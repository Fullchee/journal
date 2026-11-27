import assert from "node:assert/strict";
import { freezeDate } from "./helpers/clock";
import { onRequestPost as postEntries } from "@worker/api/log/entries";
import { onRequestPost as postUndo } from "@worker/api/log/undo";
import type { Env, Json } from "@worker/lib/env";
import { insertHabit } from "@worker/lib/habit-records";
import { applyLog } from "@worker/lib/log-store";
import { MISSED } from "@/core";
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
const floss = makeHabit({ id: "floss", name: "Floss" });

type TestEnv = Env & { DB: ReturnType<typeof makeD1> };

async function makeUndoEnv(): Promise<TestEnv> {
  const env: TestEnv = { ...makeEnv(), DB: makeD1() };

  // The test seed holds example Habits; these tests want only their own.
  await env.DB.exec("DELETE FROM goal_habits; DELETE FROM habit_checks; DELETE FROM habits;");
  await Promise.all([youtube, pushups, floss].map((habit) => insertHabit(env, habit)));

  return env;
}

// Saves `log` through the log box's form and returns the action Undo reverses.
async function save(env: Env, log: Json[], text = "a log") {
  const res = await postEntries({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/log/entries", {
      email: OWNER,
      body: { text, log },
    }),
  });

  return String((await readJson<{ action: number }>(res)).action);
}

const watched = (start: string) => ({ habit: "youtube", start_time: start, minutes: 30 });

const undo = (env: Env, id: string, email: string | null = OWNER) =>
  postUndo({
    env,
    params: { id },
    request: apiRequest("POST", `https://x/api/log/${id}/undo`, { email }),
  });

// node:sqlite rows have no prototype, so they are copied before a deep-equal.
const rows = async <Row extends object>(env: TestEnv, sql: string) =>
  (await env.DB.prepare(sql).bind().all<Row>()).results.map((row) => ({ ...row }));

const durations = (env: TestEnv) =>
  rows<{ habit: string; date: string; start_time: string; minutes: number }>(
    env,
    "SELECT habit, date, start_time, minutes FROM habit_durations ORDER BY start_time",
  );

const counts = (env: TestEnv) =>
  rows<{ habit: string; date: string; count: number }>(
    env,
    "SELECT habit, date, count FROM habit_checks ORDER BY habit",
  );

test("a log is recorded in log_actions with each Day before and after it", async () => {
  const env = await makeUndoEnv();

  await save(env, [watched("08:00"), { habit: "pushups", count: 2 }], "youtube and push-ups");

  const [action] = await rows<{ text: string; applied: string; undone_at: string | null }>(
    env,
    "SELECT text, applied, undone_at FROM log_actions",
  );

  const untouched = { check: null, skip: null, entries: [] };

  assert.deepEqual(
    { ...action, applied: JSON.parse(action?.applied ?? "") },
    {
      text: "youtube and push-ups",
      applied: {
        habit: null,
        before: [
          { habit: "youtube", date: TODAY, ...untouched },
          { habit: "pushups", date: TODAY, ...untouched },
        ],
        after: [
          {
            habit: "youtube",
            date: TODAY,
            ...untouched,
            entries: [{ id: 1, start_time: "08:00", minutes: 30, note: "" }],
          },
          { habit: "pushups", date: TODAY, ...untouched, check: { count: 2, note: "" } },
        ],
      },
      undone_at: null,
    },
  );
});

test("a count log for a Habit that became a duration Habit since its plan stores nothing and reports 0", async () => {
  const env = await makeUndoEnv();
  const write = { record: "count", habit: youtube, date: TODAY, count: 2, note: "" } as const;

  const { lines } = await applyLog(env, {
    text: "2 youtube",
    writes: [write],
    created: null,
    today: TODAY,
  });

  assert.deepEqual(lines, ["Logged YouTube: +2 (today 0)."]);
  assert.deepEqual(await counts(env), []);
});

test("Undo removes exactly what a log added", async () => {
  const env = await makeUndoEnv();

  await save(env, [watched("08:00")]);
  const res = await undo(env, await save(env, [watched("09:00")]));

  assert.equal(res.status, 204);
  assert.deepEqual(await durations(env), [
    { habit: "youtube", date: TODAY, start_time: "08:00", minutes: 30 },
  ]);
});

test("Undo restores each count, removing a row the log created", async () => {
  const env = await makeUndoEnv();

  await env.DB.exec(
    `INSERT INTO habit_checks (date, habit, count) VALUES ('${TODAY}', 'pushups', 2)`,
  );
  await undo(env, await save(env, [{ habit: "floss" }, { habit: "pushups", count: 3 }]));

  assert.deepEqual(await counts(env), [{ habit: "pushups", date: TODAY, count: 2 }]);
});

const checkNotes = (env: TestEnv) =>
  rows<{ count: number; note: string }>(env, "SELECT count, note FROM habit_checks");

test("Undo puts back the check's note a log replaced", async () => {
  const env = await makeUndoEnv();

  await env.DB.exec(
    `INSERT INTO habit_checks (date, habit, count, note) VALUES ('${TODAY}', 'pushups', 2, 'Morning')`,
  );

  const action = await save(env, [
    { habit: "pushups", count: 3, note: "Evening" },
    { habit: "pushups", count: 1, note: "Late" },
  ]);

  assert.deepEqual(await checkNotes(env), [{ count: 6, note: "Late" }]);
  await undo(env, action);
  assert.deepEqual(await checkNotes(env), [{ count: 2, note: "Morning" }]);
});

test("Undo of a log that noted a check only in a later item puts back the note", async () => {
  const env = await makeUndoEnv();

  await env.DB.exec(
    `INSERT INTO habit_checks (date, habit, count, note) VALUES ('${TODAY}', 'pushups', 2, 'Morning')`,
  );

  const action = await save(env, [
    { habit: "pushups", count: 3 },
    { habit: "pushups", count: 1, note: "Late" },
  ]);

  await undo(env, action);
  assert.deepEqual(await checkNotes(env), [{ count: 2, note: "Morning" }]);
});

test("Undo restores a missed day", async () => {
  const env = await makeUndoEnv();

  await env.DB.exec(
    `INSERT INTO habit_checks (date, habit, count) VALUES ('${TODAY}', 'floss', ${MISSED})`,
  );
  await undo(env, await save(env, [{ habit: "floss" }]));

  assert.deepEqual(await counts(env), [{ habit: "floss", date: TODAY, count: MISSED }]);
});

const skips = (env: TestEnv) =>
  rows<{ habit: string; date: string; cause: string; note: string }>(
    env,
    "SELECT habit, date, cause, note FROM habit_skips",
  );

const skipToday = (env: TestEnv, habit: string) =>
  env.DB.exec(
    `INSERT INTO habit_checks (date, habit, count) VALUES ('${TODAY}', '${habit}', ${MISSED});
    INSERT INTO habit_skips (habit, date, cause, note) VALUES ('${habit}', '${TODAY}', 'outside', 'rain');`,
  );

test("a log on a Skipped Day replaces the Skip, and Undo puts it back with its cause", async () => {
  const env = await makeUndoEnv();

  await skipToday(env, "pushups");
  const action = await save(env, [{ habit: "pushups", count: 2 }]);
  const logged = [await counts(env), await skips(env)];

  assert.equal((await undo(env, action)).status, 204);
  assert.deepEqual(
    [logged, [await counts(env), await skips(env)]],
    [
      [[{ habit: "pushups", date: TODAY, count: 2 }], []],
      [
        [{ habit: "pushups", date: TODAY, count: MISSED }],
        [{ habit: "pushups", date: TODAY, cause: "outside", note: "rain" }],
      ],
    ],
  );
});

test("Undo of an entry on a Skipped Opt-out Day puts the Skip back", async () => {
  const env = await makeUndoEnv();

  const boat = makeHabit({
    id: "boat",
    name: "Dragon boat",
    record: "duration",
    targetMinutes: 60,
    usualMinutes: 120,
    startDate: TODAY,
    optOutFrom: TODAY,
    alarm: { time: "18:00", kind: "alarm" },
  });

  await insertHabit(env, boat);
  await skipToday(env, "boat");
  const action = await save(env, [{ habit: "boat", start_time: "08:00", minutes: 30 }]);
  const logged = [await counts(env), await durations(env)];

  assert.equal((await undo(env, action)).status, 204);
  assert.deepEqual(
    [logged, [await counts(env), await durations(env), await skips(env)]],
    [
      [[], [{ habit: "boat", date: TODAY, start_time: "08:00", minutes: 30 }]],
      [
        [{ habit: "boat", date: TODAY, count: MISSED }],
        [],
        [{ habit: "boat", date: TODAY, cause: "outside", note: "rain" }],
      ],
    ],
  );
});

test("Undo refuses a log saved before each Day's state was kept, and changes nothing", async () => {
  const env = await makeUndoEnv();

  const applied = {
    habit: null,
    added: [{ habit: "youtube", date: TODAY, start_time: "08:15", minutes: 30 }],
    counts: [],
  };

  await env.DB.exec(
    `INSERT INTO habit_durations (habit, date, start_time, minutes) VALUES ('youtube', '${TODAY}', '08:15', 30);` +
      `INSERT INTO log_actions (id, text, applied) VALUES (1, 'old', '${JSON.stringify(applied)}')`,
  );

  const res = await undo(env, "1");

  assert.equal(res.status, 409);
  assert.deepEqual(await readJson(res), { error: "This log is too old to undo." });
  assert.equal((await durations(env)).length, 1);
});

test("Undo leaves a later entry that reused a deleted entry's id", async () => {
  const env = await makeUndoEnv();
  const first = await save(env, [watched("08:00")]);

  await env.DB.exec("DELETE FROM habit_durations");
  await save(env, [watched("09:00")]);
  const res = await undo(env, first);

  assert.equal(res.status, 409);
  assert.deepEqual(await readJson(res), {
    error: `YouTube 8:00 AM–8:30 AM on ${TODAY} was deleted since, so Undo can't remove it.`,
  });
  assert.deepEqual(await durations(env), [
    { habit: "youtube", date: TODAY, start_time: "09:00", minutes: 30 },
  ]);
});

test("a second Undo that passed the check while the first ran is refused and changes nothing", async () => {
  const env = await makeUndoEnv();

  await save(env, [watched("08:00")]);
  const action = await save(env, [watched("08:15")]);
  const { batch } = env.DB;

  // The other Undo finishes after this one has read undone_at but before its batch runs.
  env.DB.batch = async (statements) => {
    env.DB.batch = batch;
    assert.equal((await undo(env, action)).status, 204);

    return batch(statements);
  };

  const res = await undo(env, action);

  assert.equal(res.status, 409);
  assert.deepEqual(await readJson(res), { error: "Already undone." });
  assert.deepEqual(await durations(env), [
    { habit: "youtube", date: TODAY, start_time: "08:00", minutes: 30 },
  ]);
});

test("a log action can't be marked undone twice", async () => {
  const env = await makeUndoEnv();
  const action = await save(env, [watched("08:00")]);
  const markUndone = `UPDATE log_actions SET undone_at = 'x' WHERE id = ${action}`;

  await env.DB.exec(markUndone);

  await assert.rejects(env.DB.exec(markUndone), /already undone/);
});

test("Undo refuses when a count changed since, and changes nothing", async () => {
  const env = await makeUndoEnv();
  const action = await save(env, [{ habit: "pushups", count: 3 }]);

  await env.DB.exec(`UPDATE habit_checks SET count = 4 WHERE habit = 'pushups'`);
  const res = await undo(env, action);

  assert.equal(res.status, 409);
  assert.deepEqual(await readJson(res), {
    error: `Push-ups on ${TODAY} changed since (now 4), so Undo would lose that change.`,
  });
  assert.deepEqual(await counts(env), [{ habit: "pushups", date: TODAY, count: 4 }]);
});

test("Undo refuses when anything else on a logged Day changed since", async () => {
  const env = await makeUndoEnv();
  const action = await save(env, [watched("08:00")]);

  await env.DB.exec(
    `INSERT INTO habit_durations (habit, date, start_time, minutes) VALUES ('youtube', '${TODAY}', '09:00', 15)`,
  );
  const res = await undo(env, action);

  assert.equal(res.status, 409);
  assert.deepEqual(await readJson(res), {
    error: `YouTube on ${TODAY} changed since, so Undo would lose that change.`,
  });
  assert.equal((await durations(env)).length, 2);
});

test("Undo refuses when a logged count was cleared since", async () => {
  const env = await makeUndoEnv();
  const action = await save(env, [{ habit: "floss" }]);

  await env.DB.exec("DELETE FROM habit_checks");

  assert.equal((await undo(env, action)).status, 409);
});

test("Undo names a deleted Habit by its id when its count changed", async () => {
  const env = await makeUndoEnv();
  const action = await save(env, [{ habit: "floss" }]);

  await env.DB.exec("DELETE FROM habit_checks; DELETE FROM habits WHERE id = 'floss'");
  const res = await undo(env, action);

  assert.equal(res.status, 409);
  assert.deepEqual(await readJson(res), {
    error: `floss on ${TODAY} changed since (now 0), so Undo would lose that change.`,
  });
});

test("Undo names a deleted Habit by its id when its entry is gone", async () => {
  const env = await makeUndoEnv();
  const action = await save(env, [watched("08:00")]);

  await env.DB.exec("DELETE FROM habit_durations; DELETE FROM habits WHERE id = 'youtube'");
  const res = await undo(env, action);

  assert.equal(res.status, 409);
  assert.deepEqual(await readJson(res), {
    error: `youtube 8:00 AM–8:30 AM on ${TODAY} was deleted since, so Undo can't remove it.`,
  });
});

test("an Undo whose batch fails for another reason fails too", async () => {
  const env = await makeUndoEnv();
  const action = await save(env, [watched("08:00")]);

  env.DB.batch = () => Promise.reject(new Error("D1 is down"));

  await assert.rejects(undo(env, action), /D1 is down/);
});

test("Undo is single use", async () => {
  const env = await makeUndoEnv();
  const action = await save(env, [watched("08:00")]);

  await undo(env, action);
  const res = await undo(env, action);

  assert.equal(res.status, 409);
  assert.deepEqual(await readJson(res), { error: "Already undone." });
});

test("Undo of an unknown or malformed id returns 404", async () => {
  const env = await makeUndoEnv();

  assert.equal((await undo(env, "7")).status, 404);
  assert.equal((await undo(env, "abc")).status, 404);
});

test("a stranger can't Undo", async () => {
  const env = await makeUndoEnv();
  const action = await save(env, [watched("08:00")]);

  assert.equal((await undo(env, action, STRANGER)).status, 403);
  assert.equal((await durations(env)).length, 1);
});

test("a failed batch writes none of its statements", async () => {
  const env = await makeUndoEnv();

  const insert = () =>
    env.DB.prepare("INSERT INTO log_actions (id, text, applied) VALUES (1, 'x', '{}')").bind();

  await assert.rejects(env.DB.batch([insert(), insert()]));

  assert.deepEqual(await rows<{ id: number }>(env, "SELECT id FROM log_actions"), []);
});
