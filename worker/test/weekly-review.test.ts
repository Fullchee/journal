import assert from "node:assert/strict";
import { onRequestGet } from "@worker/api/weekly-review";
import type { Env, SqlValue } from "@worker/lib/env";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";

const seed = (env: Env, sql: string, ...args: SqlValue[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();

const call = (env: Env, week: string, email: string | null = OWNER) =>
  onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", `https://x/api/weekly-review?week=${encodeURIComponent(week)}`, {
      email,
    }),
  });

const PROSE = JSON.stringify({
  summary: "A steady week.",
  directions: [{ goal: "Move every day", movement: "walked most mornings" }],
});

/** A database with only the Goals a test adds, and a model that answers `reply`. */
async function envWith(
  reply: () => Promise<{ response?: string }> = () => Promise.resolve({ response: PROSE }),
) {
  const env = makeEnv();
  await seed(env, "DELETE FROM goal_habits");
  await seed(env, "DELETE FROM goals");
  env.AI = { run: reply };

  return env;
}

async function seedWeek(env: Env) {
  await seed(
    env,
    "INSERT INTO check_ins (checked_in_at, zone, score, note) VALUES ('2026-11-09T04:30:00Z', 'Rain', 3, 'late Sunday'), ('2026-11-09T05:30:00Z', 'Sun', 8, 'next Monday'), ('2026-11-02T04:30:00Z', 'Sun', 8, 'previous Sunday')",
  );
  await seed(
    env,
    "INSERT INTO sleep (date, sleep_start, sleep_end, duration_min, sleep_score) VALUES ('2026-11-03', 'a', 'b', 420, 80), ('2026-11-10', 'a', 'b', 300, 40)",
  );
  await seed(
    env,
    "INSERT INTO activity (date, steps) VALUES ('2026-11-04', 9000), ('2026-11-01', 100)",
  );
  await seed(
    env,
    "INSERT INTO workouts (activity_id, type_key, name, start_local, duration_s) VALUES (1, 'cycling', 'Ride', '2026-11-06 07:00:00', 2700), (2, 'running', 'Run', '2026-11-09 07:00:00', 1800)",
  );
  await seed(
    env,
    "INSERT INTO habit_checks (date, habit, count) VALUES ('2026-11-05', 'sit', 1), ('2026-11-06', 'sit', -1), ('2026-11-09', 'sit', 1)",
  );
}

interface FlatDay {
  day: string;
  checkIns: { note: string }[];
  sleep: unknown;
  activity: unknown;
  workouts: { typeKey: string }[];
  habits: string[];
}

const flat = (days: FlatDay[]) =>
  days.flatMap(({ day, checkIns, sleep, activity, workouts, habits }) => [
    ...checkIns.map((c) => `${day} check-in ${c.note}`),
    ...(sleep === null ? [] : [`${day} sleep`]),
    ...(activity === null ? [] : [`${day} activity`]),
    ...workouts.map((w) => `${day} workout ${w.typeKey}`),
    ...habits.map((h) => `${day} habit ${h}`),
  ]);

test("the weekly review needs sign-in, and a stranger gets none", async () => {
  const env = await envWith();

  assert.equal((await call(env, "2026-W45", null)).status, 401);
  assert.equal((await call(env, "2026-W45", STRANGER)).status, 403);
});

for (const week of ["soon", "2026-45", "2027-W53", "2026-W00"])
  test(`a bad week ${week} is a 400`, async () => {
    assert.equal((await call(await envWith(), week)).status, 400);
  });

test("it returns only that week's rows, by Toronto day, and the saved retro", async () => {
  const env = await envWith();
  await seedWeek(env);
  await seed(
    env,
    "INSERT INTO reflections (period_kind, period, body) VALUES ('week', '2026-W45', 'Saved'), ('week', '2026-W44', 'Older')",
  );

  const body = await (await call(env, "2026-W45")).json();

  assert.deepEqual(flat(body.days), [
    "2026-11-03 sleep",
    "2026-11-04 activity",
    "2026-11-05 habit Bedtime meditation (15 min)",
    "2026-11-06 workout cycling",
    "2026-11-08 check-in late Sunday",
  ]);
  assert.equal(body.days.length, 7);
  assert.deepEqual(body.existing, { id: 1, body: "Saved" });
});

test("a work Reflection for the week never shows as the saved retro", async () => {
  const env = await envWith();
  await seed(
    env,
    "INSERT INTO reflections (track, period_kind, period, body) VALUES ('work', 'week', '2026-W45', 'Shipped DEV-N')",
  );

  assert.equal((await (await call(env, "2026-W45")).json()).existing, null);
});

test("a good duration Habit is done only on a Day its minutes reach the target", async () => {
  const env = await envWith();
  await seed(env, "UPDATE habits SET record = 'duration', target_minutes = 15 WHERE id = 'sit'");
  await seed(
    env,
    "INSERT INTO habit_durations (habit, date, start_time, minutes) VALUES ('sit', '2026-11-04', '08:00', 10), ('sit', '2026-11-05', '08:00', 15)",
  );

  const body = await (await call(env, "2026-W45")).json();

  assert.deepEqual(flat(body.days), ["2026-11-05 habit Bedtime meditation (15 min)"]);
});

test("it drafts one Directions bullet per active Goal with the model's movement", async () => {
  const env = await envWith();
  await seed(
    env,
    "INSERT INTO goals (id, title, why, state) VALUES (1, 'Move every day', 'Energy', 'active'), (2, 'Old goal', '', 'retired'), (3, 'Done goal', '', 'achieved')",
  );
  await seed(env, "INSERT INTO goal_habits (goal_id, habit_id) VALUES (1, 'sit')");

  const body = await (await call(env, "2026-W45")).json();

  assert.deepEqual(body.goals, [
    { id: 1, title: "Move every day", why: "Energy", habits: ["Bedtime meditation (15 min)"] },
  ]);
  assert.equal(body.drafted, true);
  assert.equal(body.existing, null);
  assert.match(body.draft, /^- \*\*Move every day\*\*: Energy; walked most mornings$/m);
  assert.doesNotMatch(body.draft, /Old goal|Done goal/);
});

for (const [name, reply] of [
  ["throws", () => Promise.reject(new Error("down"))],
  ["answers bad JSON", () => Promise.resolve({ response: "not json" })],
] as const)
  test(`when the AI ${name}, the data still shows with a skeleton draft`, async () => {
    const env = await envWith(reply);
    await seedWeek(env);

    const res = await call(env, "2026-W45");
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.drafted, false);
    assert.equal(flat(body.days).length, 5);
    assert.match(
      body.draft,
      /## Directions[\s\S]*Anything this week the Check-ins didn't capture\?\n$/,
    );
  });

test("an empty week with no Goals never calls the AI", async () => {
  const env = await envWith(() => assert.fail("AI must not run"));

  const body = await (await call(env, "2026-W45")).json();

  assert.equal(body.drafted, false);
  assert.doesNotMatch(body.draft, /Signals/);
});
