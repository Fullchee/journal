import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { onRequestGet } from "@worker/api/targets";
import { onRequestDelete, onRequestPut } from "@worker/api/targets/goal";
import { onRequestPost } from "@worker/api/targets/review";
import { onRequestDelete as deleteNote } from "@worker/api/notes";
import type { Env, Json, SqlValue } from "@worker/lib/env";
import worker from "@worker/index";
import { freezeDate } from "./helpers/clock";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";
import { readJson } from "./helpers/json";

// A Thursday: the week is 9 to 15 Nov.
beforeEach(() => freezeDate(Date.parse("2026-11-12T15:00:00Z")));

afterEach(() => jest.useRealTimers());

const seed = (env: Env, sql: string, ...args: SqlValue[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();

const read = async (env: Env, sql: string, ...args: SqlValue[]) =>
  (
    await env.DB.prepare(sql)
      .bind(...args)
      .all<Record<string, SqlValue>>()
  ).results;

const get = (env: Env, day: string, email: string | null = OWNER) =>
  onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", `https://x/api/targets?day=${day}`, { email }),
  });

const put = (env: Env, goalId: string, body: Json, email: string | null = OWNER) =>
  onRequestPut({
    env,
    params: { goalId },
    request: apiRequest("PUT", `https://x/api/targets/${goalId}`, { email, body }),
  });

// The seeded Goal 1 holds the Target these remove and answer.
const remove = (env: Env, email: string | null = OWNER) =>
  onRequestDelete({
    env,
    params: { goalId: "1" },
    request: apiRequest("DELETE", "https://x/api/targets/1", { email }),
  });

const answer = (env: Env, body: Json, email: string | null = OWNER) =>
  onRequestPost({
    env,
    params: { goalId: "1" },
    request: apiRequest("POST", "https://x/api/targets/1/review", { email, body }),
  });

const WEEKLY = { measure: "minutes", number: 150, direction: "minimum", period: "week" };

interface Body {
  targets: {
    goalId: number;
    title: string;
    pillar: string | null;
    habits: string[];
    target: { number: number | null; start: string; reviewedThrough: string | null };
    current: { from: string; value: number | null };
    previous: { value: number | null } | null;
  }[];
}

async function seedCardio(env: Env) {
  await seed(env, "INSERT INTO goals (id, title) VALUES (20, 'Cardio')");
  await seed(
    env,
    "INSERT INTO habits (id, name, record, target_minutes) VALUES ('run', 'Run', 'duration', 30)",
  );
  await seed(env, "INSERT INTO goal_habits (goal_id, habit_id) VALUES (20, 'run')");
  await seed(
    env,
    "INSERT INTO habit_durations (habit, date, start_time, minutes) VALUES ('run', '2026-11-10', '07:00', 45), ('run', '2026-11-03', '07:00', 30)",
  );
}

test("PUT sets a Goal's Target and GET shows its progress", async () => {
  const env = makeEnv();
  await seedCardio(env);

  assert.equal((await put(env, "20", WEEKLY)).status, 204);

  const { targets } = await readJson<Body>(await get(env, "2026-11-12"));

  assert.deepEqual(
    targets.map(({ title, habits, current, previous }) => [
      title,
      habits,
      current.value,
      previous?.value,
    ]),
    [["Cardio", ["run"], 45, 30]],
  );
});

test("GET marks a Pillar Goal's Target with its pillar", async () => {
  const env = makeEnv();
  await seed(
    env,
    "INSERT INTO goals (id, title, pillar) VALUES (21, 'Sleep', 'sleep'), (22, 'Move', NULL)",
  );
  await put(env, "21", { ...WEEKLY, measure: "sleep", number: 420 });
  await put(env, "22", WEEKLY);

  const { targets } = await readJson<Body>(await get(env, "2026-11-12"));

  assert.deepEqual(
    targets.map(({ title, pillar }) => [title, pillar]),
    [
      ["Sleep", "sleep"],
      ["Move", null],
    ],
  );
});

test("GET reads the Signals a Target measures", async () => {
  const env = makeEnv();
  await seed(
    env,
    "INSERT INTO goals (id, title) VALUES (21, 'Sleep'), (22, 'Move'), (23, 'Screens')",
  );
  await put(env, "21", { ...WEEKLY, measure: "sleep", number: 420 });
  await put(env, "22", { ...WEEKLY, measure: "intensity-minutes" });
  await put(env, "23", { ...WEEKLY, measure: "screen-time", direction: "limit", number: 180 });
  await seed(
    env,
    "INSERT INTO screen_time (device, day, minutes) VALUES ('phone', '2026-11-10', 100), ('laptop', '2026-11-10', 60), ('phone', '2026-11-11', 140)",
  );
  await seed(
    env,
    "INSERT INTO sleep (date, sleep_start, sleep_end, duration_min) VALUES ('2026-11-10', 'a', 'b', 400), ('2026-11-11', 'a', 'b', 440)",
  );
  await seed(
    env,
    "INSERT INTO activity (date, steps, moderate_min, vigorous_min) VALUES ('2026-11-10', 1000, 20, 10)",
  );

  const { targets } = await readJson<Body>(await get(env, "2026-11-12"));

  assert.deepEqual(
    targets.map(({ goalId, current }) => [goalId, current.value]),
    [
      [21, 420],
      [22, 40],
      [23, 150],
    ],
  );
});

test("PUT keeps a deadline Target's start while its period stays, and restarts it on a new period", async () => {
  const env = makeEnv();
  await seedCardio(env);
  const deadline = { ...WEEKLY, period: "deadline", deadline: "2026-12-31" };

  await put(env, "20", deadline);
  freezeDate(Date.parse("2026-11-20T15:00:00Z"));
  await put(env, "20", { ...deadline, number: 300 });

  assert.deepEqual(await read(env, "SELECT start, number FROM goal_targets"), [
    { start: "2026-11-12", number: 300 },
  ]);

  await put(env, "20", WEEKLY);

  assert.deepEqual(await read(env, "SELECT start, deadline FROM goal_targets"), [
    { start: "2026-11-20", deadline: null },
  ]);
});

test("PUT refuses a bad Target, a deadline without a date, or a missing Goal", async () => {
  const env = makeEnv();

  assert.equal((await put(env, "1", { ...WEEKLY, measure: "km" })).status, 400);
  assert.equal((await put(env, "1", { ...WEEKLY, period: "deadline" })).status, 400);
  assert.equal((await put(env, "1", { ...WEEKLY, number: 0 })).status, 400);
  assert.equal((await put(env, "999", WEEKLY)).status, 404);
});

test("DELETE removes the Target and keeps the Goal", async () => {
  const env = makeEnv();
  await put(env, "1", WEEKLY);

  assert.equal((await remove(env)).status, 204);
  assert.equal((await remove(env)).status, 404);
  assert.deepEqual(await read(env, "SELECT COUNT(*) AS n FROM goals WHERE id = 1"), [{ n: 1 }]);
});

test("deleting a Goal deletes its Target", async () => {
  const env = makeEnv();
  await put(env, "1", WEEKLY);

  await deleteNote({
    env,
    params: { type: "goals", id: ["1"] },
    request: apiRequest("DELETE", "https://x/api/notes/goals/1", { email: OWNER }),
  });

  assert.deepEqual(await read(env, "SELECT COUNT(*) AS n FROM goal_targets"), [{ n: 0 }]);
});

const targetRow = (env: Env) =>
  read(env, "SELECT number, reviewed_through AS through FROM goal_targets WHERE goal_id = 1");

describe("Weekly review answers", () => {
  test("Keep records the period answered and keeps the number", async () => {
    const env = makeEnv();
    await put(env, "1", WEEKLY);

    assert.equal((await answer(env, { answer: "keep", through: "2026-11-08" })).status, 204);
    assert.deepEqual(await targetRow(env), [{ number: 150, through: "2026-11-08" }]);
  });

  test("Adjust changes the number", async () => {
    const env = makeEnv();
    await put(env, "1", WEEKLY);

    await answer(env, { answer: "adjust", through: "2026-11-08", number: 100 });

    assert.deepEqual(await targetRow(env), [{ number: 100, through: "2026-11-08" }]);
  });

  test("Let go drops the number and keeps the Goal", async () => {
    const env = makeEnv();
    await put(env, "1", WEEKLY);

    await answer(env, { answer: "let-go", through: "2026-11-08" });

    assert.deepEqual(await targetRow(env), [{ number: null, through: "2026-11-08" }]);
  });

  test("Achieved marks the Goal achieved, at a deadline only", async () => {
    const env = makeEnv();
    await put(env, "1", WEEKLY);

    assert.equal((await answer(env, { answer: "achieved", through: "2026-11-08" })).status, 404);

    await put(env, "1", { ...WEEKLY, period: "deadline", deadline: "2026-11-08" });
    await answer(env, { answer: "achieved", through: "2026-11-08" });

    assert.deepEqual(await read(env, "SELECT state FROM goals WHERE id = 1"), [
      { state: "achieved" },
    ]);
  });

  test("an answer needs a Target and a valid body", async () => {
    const env = makeEnv();

    assert.equal((await answer(env, { answer: "keep", through: "2026-11-08" })).status, 404);
    assert.equal((await answer(env, { answer: "adjust", through: "2026-11-08" })).status, 400);
  });
});

test("GET refuses a malformed day", async () => {
  assert.equal((await get(makeEnv(), "today")).status, 400);
});

test("every Target route refuses a stranger", async () => {
  const env = makeEnv();

  assert.equal((await get(env, "2026-11-12", STRANGER)).status, 403);
  assert.equal((await put(env, "1", WEEKLY, STRANGER)).status, 403);
  assert.equal((await remove(env, STRANGER)).status, 403);
  assert.equal((await answer(env, { answer: "keep" }, STRANGER)).status, 403);
});

test("the router sends /api/targets paths to their handlers", async () => {
  const env = makeEnv();

  const call = (method: string, pathname: string, body?: Json) =>
    worker.fetch(apiRequest(method, `https://x${pathname}`, { email: OWNER, body }), env);

  assert.equal((await call("PUT", "/api/targets/1", WEEKLY)).status, 204);
  assert.equal((await call("GET", "/api/targets?day=2026-11-12")).status, 200);
  assert.equal(
    (await call("POST", "/api/targets/1/review", { answer: "keep", through: "2026-11-08" })).status,
    204,
  );
});

test("the migration carries the sleep and activity guidelines into their Pillar Goals' Targets", () => {
  const dir = path.join(__dirname, "../migrations");
  const migration = "0006_goal_targets.sql";

  const earlier = readdirSync(dir)
    .filter((file) => file < migration)
    .toSorted((a, b) => a.localeCompare(b));

  const db = new DatabaseSync(":memory:");

  for (const file of earlier) db.exec(readFileSync(path.join(dir, file), "utf8"));
  db.exec(
    "INSERT INTO goals (id, title, pillar) VALUES (1, 'Sleep well', 'sleep'), (2, 'Move', 'activity'), (3, 'Calm', 'stress')",
  );
  db.exec(readFileSync(path.join(dir, migration), "utf8"));

  // Copied into the test realm: node:sqlite builds rows in the outer one, which fail strict deepEqual.
  const stored = db
    .prepare(
      "SELECT goal_id, measure, number, direction, period FROM goal_targets ORDER BY goal_id",
    )
    .all();

  const rows = Array.from(stored, (row) => ({ ...row }));

  assert.deepEqual(rows, [
    { goal_id: 1, measure: "sleep", number: 420, direction: "minimum", period: "week" },
    {
      goal_id: 2,
      measure: "intensity-minutes",
      number: 150,
      direction: "minimum",
      period: "week",
    },
  ]);
});
