import assert from "node:assert/strict";
import { freezeDate } from "./helpers/clock";
import { MODEL_DOWN } from "@worker/lib/log-model";
import { onRequestPost as postDraft } from "@worker/api/log/draft";
import { onRequestPost as postEntries } from "@worker/api/log/entries";
import type { Ai, Env, Json, SqlValue } from "@worker/lib/env";
import { insertHabit, readNotes } from "@worker/lib/habit-records";
import type { ModelReply } from "@worker/lib/log-thread";
import { makeD1 } from "./helpers/d1";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";
import { makeHabit } from "@/core/__tests__/helpers/habit";
import { readJson } from "./helpers/json";

const TODAY = "2026-11-06";

// 15:00 UTC is 10:00 in Toronto (EST).
beforeEach(() => freezeDate(Date.parse(`${TODAY}T15:00:00Z`)));

afterEach(() => jest.useRealTimers());

const youtube = makeHabit({
  id: "youtube",
  name: "YouTube",
  kind: "bad",
  record: "duration",
  targetMinutes: 60,
});

const pushups = makeHabit({ id: "pushups", name: "Push-ups", record: "count" });

type TestEnv = Env & { DB: ReturnType<typeof makeD1>; inputs: Parameters<Ai["run"]>[1][] };

async function makeFormEnv(reply: ModelReply = {}): Promise<TestEnv> {
  const inputs: TestEnv["inputs"] = [];

  const env: TestEnv = {
    ...makeEnv(),
    DB: makeD1(),
    inputs,
    AI: {
      run: (_model, input) => {
        inputs.push(input);

        return Promise.resolve({ response: JSON.stringify(reply) });
      },
    },
  };

  // The test seed holds example Habits; these tests want only their own.
  await env.DB.exec("DELETE FROM goal_habits; DELETE FROM habit_checks; DELETE FROM habits;");
  await Promise.all([youtube, pushups].map((habit) => insertHabit(env, habit)));

  return env;
}

const draft = (env: Env, body: Json, email: string | null = OWNER) =>
  postDraft({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/log/draft", { email, body }),
  });

const save = (env: Env, body: Json, email: string | null = OWNER) =>
  postEntries({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/log/entries", { email, body }),
  });

// node:sqlite rows have no prototype, so they are copied before a deep-equal.
const rows = async (env: TestEnv, sql: string) =>
  (await env.DB.prepare(sql).bind().all<Record<string, SqlValue>>()).results.map((row) => ({
    ...row,
  }));

const written = async (env: TestEnv) => [
  ...(await rows(env, "SELECT habit, date, start_time, minutes FROM habit_durations")),
  ...(await rows(env, "SELECT habit, date, count FROM habit_checks")),
];

test("a draft returns the model's guess as a form and writes nothing", async () => {
  const env = await makeFormEnv({
    action: "log",
    log: [{ habit: "youtube", start_time: "8:00", minutes: 30 }],
  });

  const res = await draft(env, { text: "watched youtube 30 min at 8am" });

  assert.equal(res.status, 200);
  assert.deepEqual(await readJson(res), {
    type: "entries",
    entries: [{ habit: "youtube", start_time: "08:00", minutes: 30 }],
  });
  assert.deepEqual(await written(env), []);
  assert.deepEqual(await rows(env, "SELECT id FROM log_actions"), []);
});

test("a draft sends the model one user message and the log box's context", async () => {
  const env = await makeFormEnv({ action: "log", log: [{ habit: "pushups", count: 5 }] });

  await draft(env, { text: "5 pushups" });

  const messages = env.inputs[0]?.messages ?? [];

  assert.equal(env.inputs.length, 1);
  assert.deepEqual(messages.slice(1), [{ role: "user", content: "5 pushups" }]);
  const context = JSON.parse(messages[0]?.content.split("Context: ", 2)[1] ?? "");

  assert.deepEqual(
    { today: context.today, time: context.time, entries: context.entries },
    { today: TODAY, time: "10:00", entries: {} },
  );
  assert.deepEqual(
    context.habits
      .map((habit: { id: string }) => habit.id)
      .toSorted((a: string, b: string) => a.localeCompare(b)),
    ["pushups", "youtube"],
  );
});

test("a draft the model can't make sense of is unclear", async () => {
  const env = await makeFormEnv({ action: "ask", question: "When did you start?" });
  const res = await draft(env, { text: "youtube" });

  assert.deepEqual(await readJson(res), { type: "unclear", text: "When did you start?" });
});

test("a draft returns 502 when the model can't be reached", async () => {
  const env = await makeFormEnv();

  env.AI = { run: () => Promise.reject(new Error("down")) };
  const res = await draft(env, { text: "watched youtube" });

  assert.equal(res.status, 502);
  assert.deepEqual(await readJson(res), { error: MODEL_DOWN });
});

test("a draft with bad text returns 400 and no model call", async () => {
  const env = await makeFormEnv();

  for (const body of [
    {},
    { text: "" },
    { text: " ".repeat(3) },
    { text: 3 },
    { text: "x".repeat(2001) },
  ]) {
    const res = await draft(env, body);

    assert.equal(res.status, 400);
    assert.deepEqual(await readJson(res), { error: "bad text" });
  }

  assert.equal(env.inputs.length, 0);
});

test("a draft needs the owner", async () => {
  const env = await makeFormEnv();

  assert.equal((await draft(env, { text: "x" }, STRANGER)).status, 403);
  assert.equal((await draft(env, { text: "x" }, null)).status, 401);
  assert.equal(env.inputs.length, 0);
});

test("saving entries writes them and returns the receipt and Undo action", async () => {
  const env = await makeFormEnv();

  const res = await save(env, {
    text: "youtube at 8 and 5 pushups",
    log: [
      { habit: "youtube", start_time: "08:00", minutes: 30 },
      { habit: "pushups", count: 5 },
    ],
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await readJson(res), {
    type: "logged",
    text: [
      "Logged YouTube: 30 min at 8:00 AM (today 30 min of 1 h).",
      "Logged Push-ups: +5 (today 5).",
    ].join("\n"),
    action: 1,
  });
  assert.deepEqual(await written(env), [
    { habit: "youtube", date: TODAY, start_time: "08:00", minutes: 30 },
    { habit: "pushups", date: TODAY, count: 5 },
  ]);
  assert.deepEqual(await rows(env, "SELECT text FROM log_actions"), [
    { text: "youtube at 8 and 5 pushups" },
  ]);
});

test("a draft keeps the note the model gave, on one line", async () => {
  const env = await makeFormEnv({
    action: "log",
    log: [{ habit: "youtube", minutes: 120, note: " Android\nwrapper " }],
  });

  const res = await draft(env, { text: "Side projects for the past two hours: Android wrapper" });

  assert.deepEqual(await readJson(res), {
    type: "entries",
    entries: [{ habit: "youtube", minutes: 120, note: "Android wrapper" }],
  });
});

test("saving entries keeps each note, and readNotes lists a Day's notes by start, then the check's", async () => {
  const env = await makeFormEnv();

  await save(env, {
    text: "notes",
    log: [
      { habit: "youtube", start_time: "09:00", minutes: 30, note: "Android wrapper" },
      { habit: "youtube", start_time: "08:00", minutes: 30, note: "Talk on Hermes" },
      { habit: "youtube", start_time: "07:00", minutes: 30 },
      { habit: "pushups", count: 5, note: "Before lunch" },
    ],
  });

  assert.deepEqual(
    await rows(env, "SELECT start_time, note FROM habit_durations ORDER BY start_time"),
    [
      { start_time: "07:00", note: "" },
      { start_time: "08:00", note: "Talk on Hermes" },
      { start_time: "09:00", note: "Android wrapper" },
    ],
  );
  assert.deepEqual(await readNotes(env, TODAY), {
    [TODAY]: { pushups: ["Before lunch"], youtube: ["Talk on Hermes", "Android wrapper"] },
  });
  assert.deepEqual(await readNotes(env, "2026-11-07"), {});
});

test("a log without a note keeps the check's note", async () => {
  const env = await makeFormEnv();

  await save(env, { text: "", log: [{ habit: "pushups", count: 5, note: "Before lunch" }] });
  await save(env, { text: "", log: [{ habit: "pushups", count: 2 }] });

  assert.deepEqual(await rows(env, "SELECT count, note FROM habit_checks"), [
    { count: 7, note: "Before lunch" },
  ]);
});

test("saving an entry that overlaps a logged one writes it without asking", async () => {
  const env = await makeFormEnv();
  const body = { text: "", log: [{ habit: "youtube", start_time: "08:00", minutes: 30 }] };

  await save(env, body);
  const res = await save(env, body);

  assert.equal(res.status, 200);
  assert.equal((await readJson<{ type: string }>(res)).type, "logged");
  assert.equal((await written(env)).length, 2);
});

test("saving an entry that doesn't check out returns 400 with the question and writes nothing", async () => {
  const env = await makeFormEnv();

  const res = await save(env, {
    text: "",
    log: [
      { habit: "pushups", count: 1 },
      { habit: "reading", minutes: 20 },
    ],
  });

  assert.equal(res.status, 400);
  assert.deepEqual(await readJson(res), { error: 'Which Habit is "reading"?' });
  assert.deepEqual(await written(env), []);
});

test("saving a malformed body returns 400", async () => {
  const env = await makeFormEnv();
  const log = [{ habit: "pushups" }];

  for (const body of [
    {},
    { text: "x" },
    { text: "x", log: [] },
    { text: "x", log: { habit: "pushups" } },
    { log },
    { text: 3, log },
    { text: "x".repeat(2001), log },
  ]) {
    const res = await save(env, body);

    assert.equal(res.status, 400);
    assert.deepEqual(await readJson(res), { error: "bad entries" });
  }

  assert.deepEqual(await written(env), []);
});

test("saving entries needs the owner", async () => {
  const env = await makeFormEnv();
  const body = { text: "", log: [{ habit: "pushups" }] };

  assert.equal((await save(env, body, STRANGER)).status, 403);
  assert.equal((await save(env, body, null)).status, 401);
  assert.deepEqual(await written(env), []);
});
