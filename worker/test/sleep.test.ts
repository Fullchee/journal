import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "@worker/api/sleep";
import type { Env, Json } from "@worker/lib/env";
import {
  accessHeaders,
  accessJwt,
  apiRequest,
  makeEnv,
  OWNER,
  type RequestBody,
} from "./helpers/env";

type Headers = Record<string, string>;

const serviceHeaders = () => ({
  "Cf-Access-Jwt-Assertion": accessJwt({ common_name: "abc123.access" }),
});

const ownerHeaders = accessHeaders(OWNER);

const night = (date: string, extra: Record<string, Json | undefined> = {}) => ({
  date,
  sleep_start: `${date}T22:30`,
  sleep_end: `${date}T06:30`,
  duration_min: 480,
  sleep_score: 80,
  ...extra,
});

const post = (env: Env, headers: Headers, body: RequestBody) =>
  onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/sleep", { body, headers }),
  });

const get = (env: Env, headers: Headers = ownerHeaders) =>
  onRequestGet({ env, params: {}, request: apiRequest("GET", "https://x/api/sleep", { headers }) });

test("the service token stores nights and GET lists them newest first", async () => {
  const env = makeEnv();

  const res = await post(env, serviceHeaders(), {
    rows: [night("2026-11-01"), night("2026-11-02")],
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { upserted: 2 });
  const { sleep } = await (await get(env)).json();
  assert.deepEqual(
    sleep.map((r: { date: string }) => r.date),
    ["2026-11-02", "2026-11-01"],
  );
  assert.equal(sleep[0].durationMin, 480);
  assert.equal(sleep[0].sleepStart, "2026-11-02T22:30");
});

test("posting a date again replaces that night instead of duplicating it", async () => {
  const env = makeEnv();
  await post(env, serviceHeaders(), { rows: [night("2026-11-01")] });
  await post(env, serviceHeaders(), {
    rows: [night("2026-11-01", { duration_min: 300, sleep_score: 55 })],
  });
  const { sleep } = await (await get(env)).json();
  assert.equal(sleep.length, 1);
  assert.equal(sleep[0].durationMin, 300);
  assert.equal(sleep[0].sleepScore, 55);
});

test("an empty sleep_score is stored as null", async () => {
  const env = makeEnv();
  await post(env, serviceHeaders(), { rows: [night("2026-11-01", { sleep_score: "" })] });
  assert.equal((await (await get(env)).json()).sleep[0].sleepScore, null);
});

test("a night without an end or a score stores an empty end and a null score", async () => {
  const env = makeEnv();

  await post(env, serviceHeaders(), {
    rows: [night("2026-11-01", { sleep_end: undefined, sleep_score: undefined })],
  });
  const [stored] = (await (await get(env)).json()).sleep;

  assert.equal(stored.sleepEnd, "");
  assert.equal(stored.sleepScore, null);
});

test("a bedtime with no time of day checks nothing", async () => {
  const env = makeEnv();

  await post(env, serviceHeaders(), { rows: [night("2026-11-01", { sleep_start: "2026-11-01" })] });
  const { results } = await env.DB.prepare("SELECT 1 FROM habit_checks").bind().all();

  assert.deepEqual(results, []);
});

test("the owner via Access email can also write", async () => {
  const env = makeEnv();
  assert.equal((await post(env, ownerHeaders, { rows: [night("2026-11-01")] })).status, 200);
});

test("a request with neither Access email nor token is rejected", async () => {
  assert.equal((await post(makeEnv(), {}, { rows: [night("2026-11-01")] })).status, 401);
});

test("listing nights without Access is rejected", async () => {
  assert.equal((await get(makeEnv(), {})).status, 401);
});

test("a malformed JWT is rejected", async () => {
  const headers = { "Cf-Access-Jwt-Assertion": "garbage" };
  assert.equal((await post(makeEnv(), headers, { rows: [night("2026-11-01")] })).status, 401);
});

test("a JWT with neither email nor common_name is rejected", async () => {
  const headers = { "Cf-Access-Jwt-Assertion": accessJwt({}) };
  assert.equal((await post(makeEnv(), headers, { rows: [night("2026-11-01")] })).status, 401);
});

const invalid: [string, RequestBody][] = [
  ["a body that is not JSON", "not json"],
  ["a missing rows list", {}],
  ["an empty rows list", { rows: [] }],
  ["a bad date", { rows: [night("11/01/2026")] }],
  ["a non-integer duration", { rows: [night("2026-11-01", { duration_min: 1.5 })] }],
  ["a negative duration", { rows: [night("2026-11-01", { duration_min: -1 })] }],
  ["a score above 100", { rows: [night("2026-11-01", { sleep_score: 101 })] }],
  ["a missing sleep_start", { rows: [night("2026-11-01", { sleep_start: undefined })] }],
];

for (const [name, body] of invalid) {
  test(`POST rejects ${name} and stores nothing`, async () => {
    const env = makeEnv();
    assert.equal((await post(env, serviceHeaders(), body)).status, 400);
    assert.deepEqual((await (await get(env)).json()).sleep, []);
  });
}

test("one invalid row rejects the whole batch", async () => {
  const env = makeEnv();
  const res = await post(env, serviceHeaders(), { rows: [night("2026-11-01"), night("bad")] });
  assert.equal(res.status, 400);
  assert.deepEqual((await (await get(env)).json()).sleep, []);
});

test("the service token can read the nights so the push script finds the latest one", async () => {
  const env = makeEnv();
  await post(env, serviceHeaders(), { rows: [night("2026-11-01")] });
  const res = await get(env, serviceHeaders());
  assert.equal(res.status, 200);
  assert.equal((await res.json()).sleep.length, 1);
});

const sleepChecks = async (env: Env) =>
  (
    await env.DB.prepare("SELECT date, count FROM habit_checks WHERE habit = 'sleep' ORDER BY date")
      .bind()
      .all()
  ).results;

const bedtime = (date: string, sleep_start: string) => night(date, { sleep_start });

test("a bedtime by 22:00 checks Asleep by 10 PM for that evening", async () => {
  const env = makeEnv();
  await post(env, serviceHeaders(), {
    rows: [bedtime("2026-11-02", "2026-11-01T21:30"), bedtime("2026-11-03", "2026-11-02T22:00")],
  });
  assert.deepEqual(await sleepChecks(env), [
    { date: "2026-11-01", count: 1 },
    { date: "2026-11-02", count: 1 },
  ]);
});

test("a bedtime after 22:00 or after midnight leaves Asleep by 10 PM unchecked", async () => {
  const env = makeEnv();
  await post(env, serviceHeaders(), {
    rows: [bedtime("2026-11-02", "2026-11-01T22:01"), bedtime("2026-11-03", "2026-11-03T00:30")],
  });
  assert.deepEqual(await sleepChecks(env), []);
});

test("a late night keeps a check the owner made by hand", async () => {
  const env = makeEnv();
  await env.DB.prepare(
    "INSERT INTO habit_checks (date, habit, count) VALUES ('2026-11-01', 'sleep', 1)",
  )
    .bind()
    .run();
  await post(env, serviceHeaders(), { rows: [bedtime("2026-11-02", "2026-11-01T23:15")] });
  assert.deepEqual(await sleepChecks(env), [{ date: "2026-11-01", count: 1 }]);
});
