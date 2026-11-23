import assert from "node:assert/strict";
import { MISSED, type RestPeriod } from "@/core";
import { onRequestPost as postHabits } from "@worker/api/habits";
import { onRequestGet, onRequestPost } from "@worker/api/streaks";
import type { Env, Json } from "@worker/lib/env";
import { freezeDate } from "./helpers/clock";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";
import { readJson } from "./helpers/json";

// 15:00 UTC is 10:00 in Toronto.
const TODAY = "2026-11-10";

beforeEach(() => freezeDate(Date.parse(`${TODAY}T15:00:00Z`)));

afterEach(() => jest.useRealTimers());

const URL = "https://x/api/streaks";

const post = (env: Env, body: Json, email = OWNER) =>
  onRequestPost({ env, params: {}, request: apiRequest("POST", URL, { body, email }) });

const get = (env: Env, email = OWNER) =>
  onRequestGet({ env, params: {}, request: apiRequest("GET", URL, { email }) });

interface Body {
  counts: Record<string, Record<string, number>>;
  skips: Record<string, Record<string, { cause: string }>>;
  restPeriods: RestPeriod[];
  notes: Record<string, Record<string, string[]>>;
}

const restPeriodsOf = async (env: Env) => (await readJson<Body>(await get(env))).restPeriods;

test("GET returns every Habit's full history and the Rest periods", async () => {
  const env = makeEnv();

  const check = (date: string, count: number, cause?: string) =>
    postHabits({
      env,
      params: {},
      request: apiRequest("POST", "https://x/api/habits", {
        body: {
          type: "check",
          date,
          habit: "up",
          on: true,
          count,
          ...(cause !== undefined && { cause }),
        },
        email: OWNER,
      }),
    });

  await check("2020-01-01", 1);
  await check("2026-11-09", MISSED, "outside");
  await post(env, { type: "start-rest", days: 3 });

  const body = await readJson<Body>(await get(env));

  assert.equal(body.counts["2020-01-01"]?.["up"], 1);
  assert.equal(body.skips["2026-11-09"]?.["up"]?.cause, "outside");
  assert.deepEqual(body.restPeriods, [{ start: TODAY, end: "2026-11-12" }]);
  assert.deepEqual(body.notes, {});
});

test("a stranger gets a 403 for Streaks and can't start Rest mode", async () => {
  const env = makeEnv();

  assert.equal((await get(env, STRANGER)).status, 403);
  assert.equal((await post(env, { type: "start-rest", days: 3 }, STRANGER)).status, 403);
});

test("Rest mode runs 1 to 30 days from today", async () => {
  const env = makeEnv();

  assert.equal((await post(env, { type: "start-rest", days: 0 })).status, 400);
  assert.equal((await post(env, { type: "start-rest", days: 31 })).status, 400);
  assert.equal((await post(env, { type: "start-rest", days: 30 })).status, 204);
  assert.deepEqual(await restPeriodsOf(env), [{ start: TODAY, end: "2026-12-09" }]);
});

test("a second Rest mode can't start while one runs", async () => {
  const env = makeEnv();
  await post(env, { type: "start-rest", days: 1 });

  assert.equal((await post(env, { type: "start-rest", days: 5 })).status, 400);
});

test("ending Rest mode the day it started removes it", async () => {
  const env = makeEnv();
  await post(env, { type: "start-rest", days: 5 });

  assert.equal((await post(env, { type: "end-rest" })).status, 204);
  assert.deepEqual(await restPeriodsOf(env), []);
});

test("ending Rest mode early keeps the days up to yesterday", async () => {
  const env = makeEnv();
  await env.DB.prepare(
    "INSERT INTO rest_periods (start_date, end_date) VALUES ('2026-11-07', '2026-11-20')",
  )
    .bind()
    .run();

  assert.equal((await post(env, { type: "end-rest" })).status, 204);
  assert.deepEqual(await restPeriodsOf(env), [{ start: "2026-11-07", end: "2026-11-09" }]);
  assert.equal((await post(env, { type: "start-rest", days: 2 })).status, 204);
});

test("ending Rest mode when none runs is refused", async () => {
  assert.equal((await post(makeEnv(), { type: "end-rest" })).status, 400);
});
