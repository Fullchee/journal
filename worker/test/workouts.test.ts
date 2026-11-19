import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "@worker/api/workouts";
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

const serviceHeaders = { "Cf-Access-Jwt-Assertion": accessJwt({ common_name: "abc123.access" }) };

const workout = (id: number, startLocal: string, extra: Record<string, Json | undefined> = {}) => ({
  activity_id: id,
  type_key: "cycling",
  name: "Toronto Cycling",
  start_local: startLocal,
  duration_s: 2700,
  distance_m: 15_000.5,
  avg_hr: 130,
  calories: 400,
  ...extra,
});

const post = (env: Env, headers: Headers, body: RequestBody) =>
  onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/workouts", { body, headers }),
  });

const get = async (env: Env, headers: Headers = accessHeaders(OWNER)) =>
  (
    await onRequestGet({
      env,
      params: {},
      request: apiRequest("GET", "https://x/api/workouts", { headers }),
    })
  ).json();

test("the service token stores workouts and reads them back newest first", async () => {
  const env = makeEnv();

  const res = await post(env, serviceHeaders, {
    rows: [workout(1, "2026-11-01 07:00:00"), workout(2, "2026-11-01 18:30:00")],
  });

  assert.deepEqual(await res.json(), { upserted: 2 });
  const { workouts } = await get(env, serviceHeaders);
  assert.deepEqual(
    workouts.map((w: { activityId: number }) => w.activityId),
    [2, 1],
  );
  assert.deepEqual(workouts[0], {
    activityId: 2,
    date: "2026-11-01",
    startLocal: "2026-11-01 18:30:00",
    typeKey: "cycling",
    name: "Toronto Cycling",
    durationS: 2700,
    distanceM: 15_000.5,
    avgHr: 130,
    calories: 400,
  });
});

test("posting an activity id again replaces that workout", async () => {
  const env = makeEnv();
  await post(env, serviceHeaders, { rows: [workout(1, "2026-11-01 07:00:00")] });
  await post(env, serviceHeaders, {
    rows: [workout(1, "2026-11-01 07:00:00", { duration_s: 3600 })],
  });
  const { workouts } = await get(env);
  assert.equal(workouts.length, 1);
  assert.equal(workouts[0].durationS, 3600);
});

test("missing or null metrics are stored as null", async () => {
  const env = makeEnv();
  await post(env, serviceHeaders, {
    rows: [
      workout(1, "2026-11-01 07:00:00", {
        distance_m: null,
        avg_hr: undefined,
        calories: undefined,
      }),
    ],
  });
  const [row] = (await get(env)).workouts;
  assert.equal(row.distanceM, null);
  assert.equal(row.avgHr, null);
  assert.equal(row.calories, null);
});

test("a request with neither Access email nor token is rejected", async () => {
  assert.equal(
    (await post(makeEnv(), {}, { rows: [workout(1, "2026-11-01 07:00:00")] })).status,
    401,
  );
});

const at = "2026-11-01 07:00:00";

const invalid: [string, RequestBody][] = [
  ["a body that is not JSON", "not json"],
  ["an empty rows list", { rows: [] }],
  ["a null row", { rows: [null] }],
  ["a missing activity id", { rows: [workout(1, at, { activity_id: undefined })] }],
  ["an empty type", { rows: [workout(1, at, { type_key: "" })] }],
  ["a bad start time", { rows: [workout(1, "2026-11-01T07:00")] }],
  ["negative duration", { rows: [workout(1, at, { duration_s: -1 })] }],
  ["fractional heart rate", { rows: [workout(1, at, { avg_hr: 130.5 })] }],
  ["negative distance", { rows: [workout(1, at, { distance_m: -1 })] }],
];

for (const [name, body] of invalid) {
  test(`POST rejects ${name} and stores nothing`, async () => {
    const env = makeEnv();
    assert.equal((await post(env, serviceHeaders, body)).status, 400);
    assert.deepEqual((await get(env)).workouts, []);
  });
}
