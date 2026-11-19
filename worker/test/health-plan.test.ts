import assert from "node:assert/strict";
import { onRequestGet, onRequestPut } from "@worker/api/health-plan";
import type { Env, Json } from "@worker/lib/env";
import { apiRequest, makeEnv, OWNER } from "./helpers/env";

const get = (env: Env, email: string | null) =>
  onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", "https://x/api/health-plan", { email }),
  });

const put = (env: Env, email: string | null, body: Json) =>
  onRequestPut({
    env,
    params: {},
    request: apiRequest("PUT", "https://x/api/health-plan", { email, body }),
  });

test("an unwritten plan reads as empty", async () => {
  const { item } = await (await get(makeEnv(), OWNER)).json();
  assert.deepEqual(item, { body: "", updatedAt: null });
});

test("the owner writes the plan, then rewrites it, and it stays one row", async () => {
  const env = makeEnv();
  assert.equal((await put(env, OWNER, { body: "first" })).status, 200);
  const { item } = await (await put(env, OWNER, { body: "second" })).json();
  assert.equal(item.body, "second");
  assert.notEqual(item.updatedAt, undefined);

  const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM health_plan")
    .bind()
    .all<{ n: number }>();

  assert.equal(results[0]?.n, 1);
});

test("a non-owner can neither read nor change the plan", async () => {
  const env = makeEnv();
  await put(env, OWNER, { body: "plan" });
  assert.equal((await get(env, "stranger@example.com")).status, 403);
  assert.equal((await put(env, "stranger@example.com", { body: "x" })).status, 403);
});

test("an invalid body is rejected and nothing is stored", async () => {
  const env = makeEnv();
  assert.equal((await put(env, OWNER, { body: 5 })).status, 400);
  assert.equal((await put(env, OWNER, { body: "x".repeat(90_001) })).status, 413);
  assert.equal((await (await get(env, OWNER)).json()).item.body, "");
});

test("requests without the Access header are rejected", async () => {
  assert.equal((await get(makeEnv(), null)).status, 401);
});
