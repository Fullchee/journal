import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "@worker/api/activity";
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

const day = (date: string, extra: Record<string, Json | undefined> = {}) => ({
  date,
  steps: 8000,
  moderate_min: 20,
  vigorous_min: 5,
  resting_hr: 55,
  avg_stress: 30,
  ...extra,
});

const post = (env: Env, headers: Headers, body: RequestBody) =>
  onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/activity", { body, headers }),
  });

const get = async (env: Env, headers: Headers = accessHeaders(OWNER)) =>
  (
    await onRequestGet({
      env,
      params: {},
      request: apiRequest("GET", "https://x/api/activity", { headers }),
    })
  ).json();

test("the service token stores days and reads them back newest first", async () => {
  const env = makeEnv();

  const res = await post(env, serviceHeaders, { rows: [day("2026-11-01"), day("2026-11-02")] });

  assert.deepEqual(await res.json(), { upserted: 2 });
  const { activity } = await get(env, serviceHeaders);
  assert.deepEqual(
    activity.map((r: { date: string }) => r.date),
    ["2026-11-02", "2026-11-01"],
  );
  assert.deepEqual(activity[0], {
    date: "2026-11-02",
    steps: 8000,
    moderateMin: 20,
    vigorousMin: 5,
    restingHr: 55,
    avgStress: 30,
  });
});

test("posting a date again replaces that day", async () => {
  const env = makeEnv();
  await post(env, serviceHeaders, { rows: [day("2026-11-01")] });
  await post(env, serviceHeaders, { rows: [day("2026-11-01", { steps: 12_000 })] });
  const { activity } = await get(env);
  assert.equal(activity.length, 1);
  assert.equal(activity[0].steps, 12_000);
});

test("missing or null metrics are stored as null", async () => {
  const env = makeEnv();
  await post(env, serviceHeaders, {
    rows: [day("2026-11-01", { resting_hr: null, avg_stress: undefined })],
  });
  const [row] = (await get(env)).activity;
  assert.equal(row.restingHr, null);
  assert.equal(row.avgStress, null);
});

test("missing minutes are stored as null", async () => {
  const env = makeEnv();
  await post(env, serviceHeaders, {
    rows: [day("2026-11-01", { moderate_min: undefined, vigorous_min: undefined })],
  });
  const [row] = (await get(env)).activity;
  assert.equal(row.moderateMin, null);
  assert.equal(row.vigorousMin, null);
});

test("a request with neither Access email nor token is rejected", async () => {
  assert.equal((await post(makeEnv(), {}, { rows: [day("2026-11-01")] })).status, 401);
});

const invalid: [string, RequestBody][] = [
  ["a body that is not JSON", "not json"],
  ["an empty rows list", { rows: [] }],
  ["a null row", { rows: [null] }],
  ["a bad date", { rows: [day("11/01/2026")] }],
  ["missing steps", { rows: [day("2026-11-01", { steps: undefined })] }],
  ["negative steps", { rows: [day("2026-11-01", { steps: -1 })] }],
  ["fractional minutes", { rows: [day("2026-11-01", { moderate_min: 1.5 })] }],
  ["stress above 100", { rows: [day("2026-11-01", { avg_stress: 101 })] }],
];

for (const [name, body] of invalid) {
  test(`POST rejects ${name} and stores nothing`, async () => {
    const env = makeEnv();
    assert.equal((await post(env, serviceHeaders, body)).status, 400);
    assert.deepEqual((await get(env)).activity, []);
  });
}
