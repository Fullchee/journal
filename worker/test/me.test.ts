import assert from "node:assert/strict";
import { onRequestGet } from "@worker/api/me";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";

const statusFor = async (email: string) => {
  const res = await onRequestGet({
    request: apiRequest("GET", "http://localhost/api/me", { email }),
    env: makeEnv(),
    params: {},
  });

  return res.status;
};

test("GET /api/me lets the owner in", async () => {
  assert.equal(await statusFor(OWNER), 204);
});

test("GET /api/me forbids a stranger", async () => {
  assert.equal(await statusFor(STRANGER), 403);
});

test("GET /api/me rejects a request without an Access token", async () => {
  const res = await onRequestGet({
    request: apiRequest("GET", "http://localhost/api/me"),
    env: makeEnv(),
    params: {},
  });

  assert.equal(res.status, 401);
});
