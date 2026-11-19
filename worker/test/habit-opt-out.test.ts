import assert from "node:assert/strict";
import type { Counts, Durations, Habit } from "@/core";
import { onRequestGet, onRequestPost } from "@worker/api/habits";
import { onRequestGet as getStreaks } from "@worker/api/streaks";
import type { Env, Json } from "@worker/lib/env";
import { readHabitsDone } from "@worker/lib/habits-done";
import { freezeDate } from "./helpers/clock";
import { apiRequest, makeEnv, OWNER } from "./helpers/env";
import { readJson } from "./helpers/json";

// A Saturday; 15:00 UTC is 10:00 in Toronto, an hour after practice starts.
const SATURDAY = "2026-11-14";
const LAST_SATURDAY = "2026-11-07";

beforeEach(() => freezeDate(Date.parse(`${SATURDAY}T15:00:00Z`)));

afterEach(() => jest.useRealTimers());

interface Body {
  habits: Habit[];
  counts: Counts;
  durations: Durations;
}

const post = (env: Env, body: Json) =>
  onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/habits", { body, email: OWNER }),
  });

const read = async (env: Env) =>
  readJson<Body>(
    await onRequestGet({
      env,
      params: {},
      request: apiRequest("GET", "https://x/api/habits?view=tracker&since=2026-11-01", {
        email: OWNER,
      }),
    }),
  );

const PRACTICE = {
  type: "habit",
  name: "Dragon boat",
  startDate: "2026-11-01",
  target: { type: "days", count: 7, days: [6] },
  alarm: { time: "09:00", kind: "alarm" },
  optOutFrom: "2026-11-01",
};

const TIMED = { ...PRACTICE, record: "duration", targetMinutes: 60, usualMinutes: 120 };

const create = async (env: Env, body: Json) => {
  const res = await post(env, body);
  assert.equal(res.status, 201);

  return (await readJson<{ id: string }>(res)).id;
};

const habitOf = async (env: Env, id: string) =>
  (await read(env)).habits.find((habit) => habit.id === id);

test("an Opt-out Duration Habit saves its usual length", async () => {
  const env = makeEnv();
  const habit = await habitOf(env, await create(env, TIMED));
  assert.deepEqual([habit?.optOutFrom, habit?.usualMinutes], ["2026-11-01", 120]);
});

test("an Opt-out Duration Habit needs a usual length", async () => {
  assert.equal((await post(makeEnv(), { ...TIMED, usualMinutes: null })).status, 400);
});

test("a Habit that can't be Opt-out saves without it, and a Habit that isn't timed drops its usual length", async () => {
  const env = makeEnv();

  const id = await create(env, {
    ...PRACTICE,
    usualMinutes: 30,
    target: { type: "weekly", count: 2, days: [] },
  });

  const habit = await habitOf(env, id);
  assert.deepEqual([habit?.optOutFrom, habit?.usualMinutes], [null, null]);
});

test("a counted check day is stored as done, for Streaks and the period close too", async () => {
  const env = makeEnv();
  const id = await create(env, PRACTICE);

  const streaks = await getStreaks({
    env,
    params: {},
    request: apiRequest("GET", "https://x/api/streaks", { email: OWNER }),
  });

  const { counts } = await readJson<{ counts: Counts }>(streaks);

  assert.deepEqual([counts[LAST_SATURDAY]?.[id], counts[SATURDAY]?.[id]], [1, 1]);
  assert.deepEqual(
    (await readHabitsDone(env, LAST_SATURDAY))
      .filter(({ name }) => name === "Dragon boat")
      .map(({ date }) => date),
    [LAST_SATURDAY, SATURDAY],
  );
});
