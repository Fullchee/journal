import assert from "node:assert/strict";
import { freezeDate } from "./helpers/clock";
import { onRequestPost as postUndo } from "@worker/api/log/undo";
import { onRequestPost as postDraft } from "@worker/api/log/draft";
import { BAD_ONE_OFF, onRequestPost as postOneOff } from "@worker/api/log/one-off";
import type { Ai, Env, Json, SqlValue } from "@worker/lib/env";
import { insertHabit } from "@worker/lib/habit-records";
import { draftOf } from "@worker/lib/log-draft";
import { askLogModel } from "@worker/lib/log-model";
import { ASK_AGAIN, dayInWords, readOneOff, type LogContext } from "@worker/lib/log-plan";
import { ModelOneOff, type ModelReply } from "@worker/lib/log-thread";
import type { Logged } from "@/core";
import { makeD1 } from "./helpers/d1";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";
import { makeHabit } from "@/core/__tests__/helpers/habit";
import { readJson } from "./helpers/json";

// A Friday.
const TODAY = "2026-11-06";
const TOMORROW = "2026-11-07";
const NEXT_SATURDAY = "2026-11-14";

// 15:00 UTC is 10:00 in Toronto (EST).
beforeEach(() => freezeDate(Date.parse(`${TODAY}T15:00:00Z`)));

afterEach(() => jest.useRealTimers());

const ctx: LogContext = { habits: [], today: TODAY, time: "10:00" };

const oneOff = (fields: Record<string, string>): ModelReply => ({
  action: "one-off",
  one_off: { name: "Go portaging", ...fields },
});

// Parser: the model resolves the day; the server keeps a real date from today on, else asks which day.

test("dayInWords names the date the way a person says it", () => {
  assert.equal(dayInWords(NEXT_SATURDAY), "Saturday 14 Nov");
  assert.equal(dayInWords("2027-01-01"), "Friday 1 Jan");
});

test.each([
  { said: "today", date: TODAY, text: "Go portaging on Friday 6 Nov." },
  { said: "tomorrow", date: TOMORROW, text: "Go portaging on Saturday 7 Nov." },
  { said: "a weekday", date: NEXT_SATURDAY, text: "Go portaging on Saturday 14 Nov." },
  { said: "a date", date: "2027-03-02", text: "Go portaging on Tuesday 2 Mar." },
])("a One-off for $said drafts that date, named in words", ({ date, text }) => {
  assert.deepEqual(draftOf(oneOff({ date }), ctx), {
    type: "one-off",
    one_off: { name: "Go portaging", date, usual_when: "" },
    text,
  });
});

test("a One-off with no day drafts without a date and asks which day", () => {
  assert.deepEqual(draftOf(oneOff({}), ctx), {
    type: "one-off",
    one_off: { name: "Go portaging", usual_when: "" },
    text: "Which day is Go portaging?",
  });
});

test.each([
  { id: "past", date: "2026-11-05" },
  { id: "impossible", date: "2026-02-30" },
  { id: "not_a_date", date: "Saturday" },
])("a $id date is dropped, so the draft asks which day", ({ date }) => {
  assert.equal(readOneOff({ name: "Go portaging", date }, TODAY)?.date, undefined);
});

test("a One-off reads a time as when it usually happens", () => {
  assert.deepEqual(readOneOff({ name: " Run ", date: TOMORROW, time: "7:00" }, TODAY), {
    name: "Run",
    date: TOMORROW,
    usual_when: "07:00",
  });
});

test("a bad time is dropped and a why from the model is ignored", () => {
  const model = ModelOneOff.parse({
    name: "Run",
    date: TOMORROW,
    time: "25:00",
    why: "clear my head",
  });

  assert.deepEqual(readOneOff(model, TODAY), { name: "Run", date: TOMORROW, usual_when: "" });
});

test("a One-off with no name drafts as unclear", () => {
  assert.deepEqual(draftOf({ action: "one-off", one_off: { date: TOMORROW } }, ctx), {
    type: "unclear",
    text: ASK_AGAIN.text,
  });
});

test("a One-off reply with no one_off drafts as unclear", () => {
  assert.deepEqual(draftOf({ action: "one-off" }, ctx), { type: "unclear", text: ASK_AGAIN.text });
});

// Prompt: the model learns what a One-off is and gets today's date and weekday to resolve days against.

test("the prompt and schema ask for a One-off resolved against today", async () => {
  const inputs: Parameters<Ai["run"]>[1][] = [];

  const ai = {
    run: (_model: string, input: Parameters<Ai["run"]>[1]) => {
      inputs.push(input);

      return Promise.resolve({ response: JSON.stringify(oneOff({ date: NEXT_SATURDAY })) });
    },
  };

  const reply = await askLogModel(ai, { ...ctx, entries: {} }, "go portaging Saturday");

  const [input] = inputs;
  const system = input?.messages[0]?.content ?? "";
  const schema = JSON.stringify(input?.response_format?.json_schema);

  assert.deepEqual(reply, oneOff({ date: NEXT_SATURDAY }));
  assert.match(system, /"action":"one-off"/);
  assert.match(system, /"today":"2026-11-06","weekday":"Friday"/);
  assert.deepEqual(
    ["today", "tomorrow", "weekday", "YYYY-MM-DD", "leave out date"].filter(
      (word) => !system.includes(word),
    ),
    [],
  );
  assert.match(schema, /"one-off"/);
  assert.match(schema, /"one_off"/);
});

// API: draft, save and undo.

type TestEnv = Env & { DB: ReturnType<typeof makeD1> };

async function makeOneOffEnv(...replies: ModelReply[]): Promise<TestEnv> {
  const env: TestEnv = {
    ...makeEnv(),
    DB: makeD1(),
    AI: { run: () => Promise.resolve({ response: JSON.stringify(replies.shift() ?? {}) }) },
  };

  // The test seed holds example Habits; these tests want only their own.
  await env.DB.exec("DELETE FROM goal_habits; DELETE FROM habit_checks; DELETE FROM habits;");
  await insertHabit(env, makeHabit({ id: "floss", name: "Floss" }));

  return env;
}

const post = (handler: typeof postOneOff, path: string, env: Env, body: Json) =>
  handler({
    env,
    params: {},
    request: apiRequest("POST", `https://x${path}`, { email: OWNER, body }),
  });

const undo = (env: Env, action: number) =>
  postUndo({
    env,
    params: { id: String(action) },
    request: apiRequest("POST", `https://x/api/log/${action}/undo`, { email: OWNER }),
  });

const oneOffs = async (env: TestEnv) =>
  (
    await env.DB.prepare(
      "SELECT name, usual_when, kind, record, start_date, target_type, target_count, target_days, active FROM habits WHERE target_type = 'once'",
    )
      .bind()
      .all<Record<string, SqlValue>>()
  ).results;

const portaging = {
  name: "Go portaging",
  usual_when: "",
  kind: "good",
  record: "check",
  start_date: NEXT_SATURDAY,
  target_type: "once",
  target_count: 1,
  target_days: "[]",
  active: 1,
};

const PORTAGING = { name: "Go portaging", date: NEXT_SATURDAY, usual_when: "" };

const save = (env: Env, oneOffBody: Json, email = OWNER) =>
  postOneOff({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/log/one-off", {
      email,
      body: { text: "go portaging Saturday", one_off: oneOffBody },
    }),
  });

test("POST /api/log/draft drafts a One-off and writes nothing", async () => {
  const env = await makeOneOffEnv(oneOff({ date: NEXT_SATURDAY }));
  const res = await post(postDraft, "/api/log/draft", env, { text: "go portaging Saturday" });

  assert.deepEqual(await readJson(res), {
    type: "one-off",
    one_off: PORTAGING,
    text: "Go portaging on Saturday 14 Nov.",
  });
  assert.deepEqual(await oneOffs(env), []);
});

test("saving a One-off creates a once Habit and names its day on the receipt", async () => {
  const env = await makeOneOffEnv();

  const res = await save(env, PORTAGING);
  const reply = await readJson<Logged>(res);

  assert.equal(res.status, 200);
  assert.deepEqual(
    { type: reply.type, text: reply.text },
    { type: "logged", text: "Added Go portaging on Saturday 14 Nov." },
  );
  assert.deepEqual(await oneOffs(env), [portaging]);
});

test("saving a One-off keeps its when and ignores an old client's why", async () => {
  const env = await makeOneOffEnv();

  await save(env, { name: "Run", date: TOMORROW, why: "clear my head", usual_when: "07:00" });

  assert.deepEqual(await oneOffs(env), [
    { ...portaging, name: "Run", start_date: TOMORROW, usual_when: "07:00" },
  ]);
});

test.each([
  { id: "no_date", oneOff: { name: "Go portaging", usual_when: "" } },
  { id: "past_date", oneOff: { ...PORTAGING, date: "2026-11-05" } },
  { id: "blank_name", oneOff: { ...PORTAGING, name: " " } },
  { id: "free_text_when", oneOff: { ...PORTAGING, usual_when: "7:00 AM" } },
  { id: "null", oneOff: null },
])("saving a One-off with $id is refused and writes nothing", async ({ oneOff: body }) => {
  const env = await makeOneOffEnv();
  const res = await save(env, body);

  assert.equal(res.status, 400);
  assert.deepEqual(await readJson(res), { error: BAD_ONE_OFF });
  assert.deepEqual(await oneOffs(env), []);
});

test("saving a One-off without the sentence's text is refused", async () => {
  const env = await makeOneOffEnv();
  const res = await post(postOneOff, "/api/log/one-off", env, { one_off: PORTAGING });

  assert.equal(res.status, 400);
  assert.deepEqual(await oneOffs(env), []);
});

test("a stranger can't save a One-off", async () => {
  const env = await makeOneOffEnv();
  const res = await save(env, PORTAGING, STRANGER);

  assert.equal(res.status, 403);
  assert.deepEqual(await oneOffs(env), []);
});

test("Undo removes a saved One-off", async () => {
  const env = await makeOneOffEnv();
  const { action } = await readJson<{ action: number }>(await save(env, PORTAGING));

  assert.equal((await undo(env, action)).status, 204);
  assert.deepEqual(await oneOffs(env), []);
});

test("Undo keeps a saved One-off that has a Reschedule", async () => {
  const env = await makeOneOffEnv();
  const { action } = await readJson<{ action: number }>(await save(env, PORTAGING));

  await env.DB.exec(
    "INSERT INTO habit_reschedules (habit, from_date, to_date, cause) " +
      `SELECT id, start_date, '2026-11-21', 'outside' FROM habits WHERE target_type = 'once'`,
  );

  assert.equal((await undo(env, action)).status, 204);
  assert.deepEqual(await oneOffs(env), [portaging]);
});
