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

  // Two workouts on one Day count once; another Habit's entries never count.
  await seed(
    env,
    "INSERT INTO habits (id, name, record) VALUES ('lift', 'Lift', 'duration'), ('walk', 'Walk', 'duration')",
  );
  await seed(
    env,
    "INSERT INTO habit_durations (habit, date, start_time, minutes) VALUES ('lift', '2026-11-10', '07:00', 60), ('lift', '2026-11-10', '18:00', 30), ('lift', '2026-11-13', '07:00', 45), ('walk', '2026-11-11', '07:00', 30)",
  );
  await seed(env, "INSERT INTO interactions (day, kind) VALUES ('2026-11-12', 'in-person')");
}

interface Body {
  bars: { pillar: string; state: string; score?: number; value?: string; message?: string }[];
}

test("GET scores each pillar Goal from the window's rows", async () => {
  const env = { ...makeEnv(), HEVY_HABIT: "lift" };
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

test("GET counts no strength Days when no Habit logs Hevy", async () => {
  const env = makeEnv();
  await seedPillars(env);

  const { bars } = await readJson<Body>(await call(env, END));

  assert.match(
    bars.find(({ pillar }) => pillar === "activity")?.value ?? "",
    /0 of 2 strength days/,
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
