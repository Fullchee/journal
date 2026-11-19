import assert from "node:assert/strict";
import { onRequestGet } from "@worker/api/pillars";
import type { Env, SqlValue } from "@worker/lib/env";
import { freezeDate } from "./helpers/clock";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";
import { readJson } from "./helpers/json";

beforeEach(() => freezeDate(Date.parse("2026-11-16T15:00:00Z")));

afterEach(() => jest.useRealTimers());

const seed = (env: Env, sql: string, ...args: SqlValue[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();

const call = (env: Env, end: string, email: string | null = OWNER) =>
  onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", `https://x/api/pillars?end=${end}`, { email }),
  });

// The window is 9 to 15 Nov.
const END = "2026-11-15";

const WEEK = ["09", "10", "11", "12", "13", "14", "15"].map((d) => `2026-11-${d}`);

async function seedPillars(env: Env) {
  await seed(
    env,
    "INSERT INTO goals (title, pillar) VALUES ('Restorative sleep', 'sleep'), ('Physical activity', 'activity'), ('Social connection', 'connection'), ('Stress management', 'stress')",
  );

  for (const day of WEEK) {
    await seed(
      env,
      "INSERT INTO sleep (date, sleep_start, sleep_end, duration_min) VALUES (?, 'a', 'b', 450)",
      day,
    );
    await seed(
      env,
      "INSERT INTO activity (date, steps, moderate_min, vigorous_min) VALUES (?, 5000, 30, 0)",
      day,
    );
  }

  // 01:00 UTC on 11 Nov is 20:00 on 10 Nov in Toronto.
  await seed(
    env,
    `INSERT INTO hevy_workouts (id, "index", title, start_time, end_time, seen_at) VALUES ('h1', 1, 'Legs', '2026-11-11T01:00:00.000Z', '2026-11-11T02:00:00.000Z', 'x')`,
  );
  await seed(
    env,
    "INSERT INTO workouts (activity_id, type_key, name, start_local, duration_s) VALUES (1, 'strength_training', 'Lift', '2026-11-13 07:00:00', 2700), (2, 'cycling', 'Ride', '2026-11-14 07:00:00', 2700)",
  );
  await seed(env, "INSERT INTO interactions (day, kind) VALUES ('2026-11-12', 'in-person')");
}

interface Body {
  bars: { pillar: string; state: string; score?: number; value?: string; message?: string }[];
}

test("GET scores each pillar Goal from the window's rows", async () => {
  const env = makeEnv();
  await seedPillars(env);

  const { bars } = await readJson<Body>(await call(env, END));

  assert.deepEqual(
    bars.map(({ pillar, state, value, message }) => [pillar, state, value ?? message]),
    [
      ["sleep", "scored", "7 h 30 m a night"],
      ["activity", "scored", "210 of 150 min · 2 of 2 strength days"],
      ["connection", "scored", "In person on 1 day"],
      ["stress", "none", "Link a Habit to see this"],
    ],
  );
});

test("each pillar belongs to at most one Goal and is one of the six", async () => {
  const env = makeEnv();
  await seed(env, "INSERT INTO goals (title, pillar) VALUES ('Nutrition', 'nutrition')");

  await assert.rejects(seed(env, "INSERT INTO goals (title, pillar) VALUES ('Food', 'nutrition')"));
  await assert.rejects(seed(env, "INSERT INTO goals (title, pillar) VALUES ('Fun', 'fun')"));
});

test("GET refuses a missing or malformed end", async () => {
  const response = await call(makeEnv(), "yesterday");

  assert.equal(response.status, 400);
});

test("GET refuses a stranger", async () => {
  const response = await call(makeEnv(), END, STRANGER);

  assert.equal(response.status, 403);
});
