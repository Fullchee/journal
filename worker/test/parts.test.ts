import assert from "node:assert/strict";
import { SELF, type CheckIn, type PartRef } from "@/core";
import {
  onRequestPatch as patchCheckIn,
  onRequestPost as postCheckIn,
} from "@worker/api/check-ins";
import { onRequestDelete, onRequestGet, onRequestPatch, onRequestPost } from "@worker/api/parts";
import type { Env, Json } from "@worker/lib/env";
import { apiRequest, makeEnv, OWNER, STRANGER, type RequestBody } from "./helpers/env";

// The example Parts the test seed holds, as Parts 1 to 5.
const SEEDED = ["Worry wolf", "Doer", "Inspector", "Skeptic", "Perseverator"];

const DOER = { id: 2, name: "Doer" };
const INSPECTOR = { id: 3, name: "Inspector" };

const params = (id?: number) => (id === undefined ? {} : { id: [String(id)] });

const url = (id?: number) =>
  id === undefined ? "https://x/api/parts" : `https://x/api/parts/${id}`;

const get = (env: Env, id?: number, email = OWNER) =>
  onRequestGet({ env, params: params(id), request: apiRequest("GET", url(id), { email }) });

const post = (env: Env, body: RequestBody, email = OWNER) =>
  onRequestPost({ env, params: {}, request: apiRequest("POST", url(), { email, body }) });

const patch = (env: Env, id: number, body: RequestBody, email = OWNER) =>
  onRequestPatch({
    env,
    params: params(id),
    request: apiRequest("PATCH", url(id), { email, body }),
  });

const remove = (env: Env, id: number, email = OWNER) =>
  onRequestDelete({ env, params: params(id), request: apiRequest("DELETE", url(id), { email }) });

interface PartJson {
  id: number;
  name: string;
  role: string;
  retired: boolean;
  recentCheckIns?: number;
}

const listed = async (env: Env): Promise<PartJson[]> => (await (await get(env)).json()).parts;

// A Check-in naming Parts, `daysAgo` days back.
async function checkIn(env: Env, inControl: CheckIn["inControl"], parts: PartRef[], daysAgo = 0) {
  const at = new Date();

  at.setDate(at.getDate() - daysAgo);

  const created = await postCheckIn({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/check-ins", { email: OWNER, body: { score: 5 } }),
  });

  // SAFETY: a created Check-in's JSON carries its integer id.
  const { id } = (await created.json()) as { id: number };

  const saved = await patchCheckIn({
    env,
    params: {},
    request: apiRequest("PATCH", "https://x/api/check-ins", {
      email: OWNER,
      body: { id, inControl, parts, checkedInAt: at.toISOString() },
    }),
  });

  // SAFETY: a saved Check-in's JSON is a CheckIn.
  return (await saved.json()) as CheckIn;
}

test("GET lists the seeded Parts with how many Check-ins named each in 30 days", async () => {
  const env = makeEnv();

  await checkIn(env, DOER, [DOER, INSPECTOR]);
  await checkIn(env, SELF, [DOER], 3);
  await checkIn(env, DOER, [], 40);

  const parts = await listed(env);

  assert.deepEqual(
    parts.map((p) => p.name),
    SEEDED,
  );
  assert.deepEqual(
    parts.map((p) => p.recentCheckIns),
    [0, 2, 1, 0, 0],
  );
});

test("a stranger can't list, edit or delete Parts", async () => {
  const env = makeEnv();

  assert.equal((await get(env, undefined, STRANGER)).status, 403);
  assert.equal((await post(env, { name: "Critic" }, STRANGER)).status, 403);
  assert.equal((await patch(env, 1, { role: "manager" }, STRANGER)).status, 403);
  assert.equal((await remove(env, 5, STRANGER)).status, 403);
});

test("POST creates a Part with the Part form's fields", async () => {
  const env = makeEnv();

  const response = await post(env, {
    name: "  Critic ",
    role: "protector",
    wants: " me safe ",
    fears: "being judged",
    feltIn: "jaw",
    description: "Fears mistakes",
  });

  assert.equal(response.status, 201);
  const { part } = await response.json();

  assert.deepEqual(
    [part.name, part.role, part.wants, part.fears, part.feltIn, part.description, part.retired],
    ["Critic", "protector", "me safe", "being judged", "jaw", "Fears mistakes", false],
  );
  assert.equal("age" in part, false);
});

test("POST refuses Self, a blank name, an unknown role and an age", async () => {
  const env = makeEnv();

  const refused: Json[] = [
    { name: "self" },
    { name: " " },
    { name: "X", role: "boss" },
    { name: "Y", age: "7" },
  ];

  for (const body of refused) assert.equal((await post(env, body)).status, 400);
});

test("POST answers 409 for a name taken in any case", async () => {
  const env = makeEnv();

  assert.equal((await post(env, { name: "doer" })).status, 409);
});

test("GET of one Part gives its recent Check-ins, in control or present, and says it is used", async () => {
  const env = makeEnv();
  const inControl = await checkIn(env, DOER, []);
  const present = await checkIn(env, SELF, [INSPECTOR, DOER]);

  await checkIn(env, SELF, [INSPECTOR]);

  const body = await (await get(env, 2)).json();

  assert.equal(body.part.name, "Doer");
  assert.equal(body.used, true);
  assert.deepEqual(
    body.checkIns.map((c: { id: number }) => c.id).toSorted((a: number, b: number) => a - b),
    [inControl.id, present.id].toSorted((a, b) => a - b),
  );
  assert.equal((await (await get(env, 5)).json()).used, false);
  assert.equal((await get(env, 99)).status, 404);
});

test("renaming a Part renames it on every past Check-in", async () => {
  const env = makeEnv();
  const first = await checkIn(env, DOER, [INSPECTOR]);
  const second = await checkIn(env, SELF, [DOER]);

  const response = await patch(env, 2, { name: "Achiever" });

  assert.equal((await response.json()).part.name, "Achiever");
  const { part, checkIns } = await (await get(env, 2)).json();
  const byId = new Map<number, CheckIn>(checkIns.map((c: CheckIn) => [c.id, c]));

  assert.equal(part.name, "Achiever");
  assert.deepEqual(byId.get(first.id)?.inControl, { id: 2, name: "Achiever" });
  assert.deepEqual(byId.get(second.id)?.parts, [{ id: 2, name: "Achiever" }]);
});

test("a rename to a taken name answers 409 and changes nothing", async () => {
  const env = makeEnv();

  assert.equal((await patch(env, 2, { name: "Inspector" })).status, 409);
  assert.equal((await (await get(env, 2)).json()).part.name, "Doer");
});

test("PATCH edits the Part form's fields and the protector role", async () => {
  const env = makeEnv();

  const { part } = await (
    await patch(env, 2, { role: "protector", wants: "rest", fears: "chaos", feltIn: "chest" })
  ).json();

  assert.deepEqual(
    [part.role, part.wants, part.fears, part.feltIn],
    ["protector", "rest", "chaos", "chest"],
  );
});

test("retiring keeps the Part, its page and its Check-ins", async () => {
  const env = makeEnv();
  const named = await checkIn(env, DOER, []);
  const { part } = await (await patch(env, 2, { retired: true })).json();

  assert.equal(part.retired, true);
  const body = await (await get(env, 2)).json();

  assert.deepEqual(
    body.checkIns.map((c: CheckIn) => c.id),
    [named.id],
  );
});

test("PATCH refuses an empty or unknown change and a missing Part", async () => {
  const env = makeEnv();

  assert.equal((await patch(env, 2, {})).status, 400);
  assert.equal((await patch(env, 2, { colour: "red" })).status, 400);
  assert.equal((await patch(env, 2, { age: "7" })).status, 400);
  assert.equal((await patch(env, 99, { role: "exile" })).status, 404);
});

test("DELETE removes a Part no Check-in names", async () => {
  const env = makeEnv();

  assert.equal((await remove(env, 5)).status, 204);
  assert.equal((await get(env, 5)).status, 404);
});

test("DELETE refuses a Part a Check-in names, in control or present", async () => {
  const env = makeEnv();

  await checkIn(env, DOER, [INSPECTOR]);

  assert.equal((await remove(env, 2)).status, 409);
  assert.equal((await remove(env, 3)).status, 409);
  assert.equal((await get(env, 2)).status, 200);
});

test("DELETE of a missing Part is not found", async () => {
  assert.equal((await remove(makeEnv(), 99)).status, 404);
});

test("an unknown path under /api/parts is not found", async () => {
  const env = makeEnv();

  const response = await onRequestGet({
    env,
    params: { id: ["1", "x"] },
    request: apiRequest("GET", url(), { email: OWNER }),
  });

  const request = apiRequest("POST", url(1), { email: OWNER, body: { name: "X" } });
  const posted = await onRequestPost({ env, params: params(1), request });

  assert.equal(response.status, 404);
  assert.equal(posted.status, 404);

  const deleted = await onRequestDelete({
    env,
    params: {},
    request: apiRequest("DELETE", url(), { email: OWNER }),
  });

  const patchRequest = apiRequest("PATCH", url(), { email: OWNER, body: { role: "exile" } });
  const patched = await onRequestPatch({ env, params: {}, request: patchRequest });

  assert.equal(deleted.status, 404);
  assert.equal(patched.status, 404);
});
