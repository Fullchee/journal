import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { onRequestGet, onRequestPost } from "@worker/api/screen-time";
import type { Env, Json } from "@worker/lib/env";
import worker from "@worker/index";
import { accessJwt, apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";
import { readJson } from "./helpers/json";

const serviceToken = { "Cf-Access-Jwt-Assertion": accessJwt({ common_name: "abc123.access" }) };

const post = (env: Env, body: Json, email: string | null = OWNER) =>
  onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/screen-time", { email, body }),
  });

const get = (env: Env, from: string, email: string | null = OWNER) =>
  onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", `https://x/api/screen-time?from=${from}`, { email }),
  });

interface Body {
  days: { day: string; minutes: number }[];
}

const days = async (env: Env) => (await readJson<Body>(await get(env, "2026-11-01"))).days;

test("GET sums each Day across devices from `from` on", async () => {
  const env = makeEnv();

  await post(env, {
    device: "phone",
    days: [
      { day: "2026-10-31", minutes: 50 },
      { day: "2026-11-01", minutes: 90 },
      { day: "2026-11-02", minutes: 30 },
    ],
  });
  await post(env, { device: "laptop", days: [{ day: "2026-11-01", minutes: 120 }] });

  assert.deepEqual(await days(env), [
    { day: "2026-11-01", minutes: 210 },
    { day: "2026-11-02", minutes: 30 },
  ]);
});

test("resending a Day replaces that device's row instead of adding to it", async () => {
  const env = makeEnv();
  const res = await post(env, { device: "phone", days: [{ day: "2026-11-01", minutes: 40 }] });

  assert.deepEqual(await readJson(res), { stored: 1 });
  await post(env, { device: "phone", days: [{ day: "2026-11-01", minutes: 95 }] });

  assert.deepEqual(await days(env), [{ day: "2026-11-01", minutes: 95 }]);
});

test("a Mac posts to /mac with a service token", async () => {
  const env = makeEnv();

  const res = await worker.fetch(
    apiRequest("POST", "https://x/api/screen-time/mac", {
      headers: serviceToken,
      body: { device: "work-mac", days: [{ day: "2026-11-01", minutes: 300 }] },
    }),
    env,
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await days(env), [{ day: "2026-11-01", minutes: 300 }]);
});

test("POST refuses a bad device, Day or minutes, and an empty upload", async () => {
  const env = makeEnv();

  for (const body of [
    { device: "Work Mac", days: [{ day: "2026-11-01", minutes: 1 }] },
    { device: "phone", days: [{ day: "2026-02-30", minutes: 1 }] },
    { device: "phone", days: [{ day: "2026-11-01", minutes: 1501 }] },
    { device: "phone", days: [{ day: "2026-11-01", minutes: 1.5 }] },
    { device: "phone", days: [] },
  ]) {
    assert.equal((await post(env, body)).status, 400);
  }
});

test("GET refuses a bad from, and both refuse a stranger", async () => {
  const env = makeEnv();

  assert.equal((await get(env, "soon")).status, 400);
  assert.equal((await get(env, "2026-11-01", STRANGER)).status, 403);
  assert.equal(
    (await post(env, { device: "phone", days: [{ day: "2026-11-01", minutes: 1 }] }, STRANGER))
      .status,
    403,
  );
});

test("the owner's service token can't read the totals", async () => {
  const env = makeEnv();

  const res = await onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", "https://x/api/screen-time?from=2026-11-01", {
      headers: serviceToken,
    }),
  });

  assert.equal(res.status, 401);
});

test("the migration keeps every Target while it widens the measures", () => {
  const dir = path.join(__dirname, "../migrations");
  const migration = "0011_screen_time.sql";

  const earlier = readdirSync(dir)
    .filter((file) => file < migration)
    .toSorted((a, b) => a.localeCompare(b));

  const db = new DatabaseSync(":memory:");

  for (const file of earlier) db.exec(readFileSync(path.join(dir, file), "utf8"));
  db.exec(
    "INSERT INTO goals (id, title) VALUES (1, 'Run'); INSERT INTO goal_targets (goal_id, measure, number, period, start) VALUES (1, 'minutes', 150, 'week', '2026-11-02')",
  );
  db.exec(readFileSync(path.join(dir, migration), "utf8"));
  db.exec("INSERT INTO goals (id, title) VALUES (2, 'Less Screen Time')");
  db.exec(
    "INSERT INTO goal_targets (goal_id, measure, number, direction, period, start) VALUES (2, 'screen-time', 180, 'limit', 'week', '2026-11-02')",
  );

  // Copied into the test realm: node:sqlite builds rows in the outer one, which fail strict deepEqual.
  const rows = Array.from(
    db.prepare("SELECT goal_id, measure FROM goal_targets ORDER BY goal_id").all(),
    (row) => ({ ...row }),
  );

  assert.deepEqual(rows, [
    { goal_id: 1, measure: "minutes" },
    { goal_id: 2, measure: "screen-time" },
  ]);
});
