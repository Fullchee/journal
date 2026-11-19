import assert from "node:assert/strict";
import {
  onRequestDelete,
  onRequestGet,
  onRequestPatch,
  onRequestPost,
} from "@worker/api/check-ins";
import type { Env } from "@worker/lib/env";
import { draftOf, patchForFields, SELF } from "@/core";
import { withVanishingRows } from "./helpers/d1";
import { apiRequest, makeEnv, OWNER, type RequestBody } from "./helpers/env";

const STRANGER = "stranger@example.com";

const get = (env: Env, email: string | null) =>
  onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", "https://x/api/check-ins", { email }),
  });

const post = (env: Env, email: string | null, body: RequestBody) =>
  onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/check-ins", { body, email }),
  });

const patch = (env: Env, email: string | null, body: RequestBody) =>
  onRequestPatch({
    env,
    params: {},
    request: apiRequest("PATCH", "https://x/api/check-ins", { body, email }),
  });

const remove = (env: Env, email: string | null, body: RequestBody) =>
  onRequestDelete({
    env,
    params: {},
    request: apiRequest("DELETE", "https://x/api/check-ins", { body, email }),
  });

test("the owner stores a Check-in and the server derives its zone", async () => {
  const env = makeEnv();
  const created = await post(env, OWNER, { score: 3, note: "tired" });
  assert.equal(created.status, 201);
  const checkIn = await created.json();
  assert.equal(checkIn.zone, "Rain");
  assert.equal(checkIn.score, 3);
  assert.equal(checkIn.note, "tired");

  const listed = await (await get(env, OWNER)).json();
  assert.deepEqual(listed.checkIns, [checkIn]);
});

test("GET lists Check-ins newest first", async () => {
  const env = makeEnv();

  for (const score of [1, 5, 8]) await post(env, OWNER, { score });
  const { checkIns } = await (await get(env, OWNER)).json();
  assert.deepEqual(
    checkIns.map((c: { score: number }) => c.score),
    [8, 5, 1],
  );
});

test("the note is optional and defaults to empty", async () => {
  const checkIn = await (await post(makeEnv(), OWNER, { score: 7 })).json();
  assert.equal(checkIn.note, "");
  assert.equal(checkIn.zone, "Sun");
});

const invalid: [string, RequestBody][] = [
  ["a score below 1", { score: 0 }],
  ["a score above 8", { score: 9 }],
  ["a fractional score", { score: 3.5 }],
  ["a string score", { score: "3" }],
  ["a missing score", {}],
  ["a non-string note", { score: 3, note: 5 }],
  ["a body that is not JSON", "not json"],
  ["a JSON null body", "null"],
  ["a clientId that is not a UUID", { score: 3, clientId: "abc" }],
];

for (const [name, body] of invalid) {
  test(`POST rejects ${name} and stores nothing`, async () => {
    const env = makeEnv();
    assert.equal((await post(env, OWNER, body)).status, 400);
    assert.deepEqual((await (await get(env, OWNER)).json()).checkIns, []);
  });
}

const zoneCases: [number, string][] = [
  [1, "Storm"],
  [2, "Storm"],
  [3, "Rain"],
  [4, "Rain"],
  [5, "Cloud"],
  [6, "Cloud"],
  [7, "Sun"],
  [8, "Sun"],
];

for (const [score, zone] of zoneCases) {
  test(`score ${score} is in ${zone}`, async () => {
    assert.equal((await (await post(makeEnv(), OWNER, { score })).json()).zone, zone);
  });
}

test("GET without the Access header is rejected", async () => {
  assert.equal((await get(makeEnv(), null)).status, 401);
});

test("a non-owner can neither read nor write", async () => {
  const env = makeEnv();
  assert.equal((await get(env, STRANGER)).status, 403);
  assert.equal((await post(env, STRANGER, { score: 3 })).status, 403);
  assert.deepEqual((await (await get(env, OWNER)).json()).checkIns, []);
});

// The test seed adds these Parts first, so their ids are fixed.
const WOLF = { id: 1, name: "Worry wolf" };
const DOER = { id: 2, name: "Doer" };
const INSPECTOR = { id: 3, name: "Inspector" };
const SKEPTIC = { id: 4, name: "Skeptic" };

const DETAILS = {
  note: "rough",
  place: "work",
  doing: "a standup",
  thought: "I'm behind",
  inControl: WOLF,
  parts: [DOER, SKEPTIC],
  tense: 2,
  low: 1,
  tired: 2,
  pleasantness: "Unpleasant",
  feelingEnergy: "High",
};

test("PATCH adds details to a Check-in without changing its score", async () => {
  const env = makeEnv();
  const { id, score, checkedInAt } = await (await post(env, OWNER, { score: 2 })).json();
  const res = await patch(env, OWNER, { id, ...DETAILS });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    id,
    score,
    checkedInAt,
    zone: "Storm",
    ...DETAILS,
  });
  const { checkIns } = await (await get(env, OWNER)).json();
  assert.equal(checkIns[0].place, "work");
});

test("the home flow creates a Check-in, then adds only the details filled in", async () => {
  const env = makeEnv();
  const created = await (await post(env, OWNER, { score: 6 })).json();
  const draft = { ...draftOf(created), place: "Gym", feelings: ["Calm", "Proud"], low: 1 };
  const details = patchForFields(["time", "place", "low", "feelings"], created, draft);

  assert.deepEqual(details, {
    place: "Gym",
    low: 1,
    thought: "Calm, Proud",
    pleasantness: null,
    feelingEnergy: null,
  });
  const saved = await (await patch(env, OWNER, { id: created.id, ...details })).json();
  assert.deepEqual(saved, { ...created, place: "Gym", low: 1, thought: "Calm, Proud" });
});

test("the note form saves who is in control and the parts present with the note", async () => {
  const env = makeEnv();
  const created = await (await post(env, OWNER, { score: 3 })).json();
  const draft = { ...draftOf(created), inControl: SELF, parts: [DOER, INSPECTOR], note: "calm" };
  const details = patchForFields(["note"], created, draft);
  const saved = await (await patch(env, OWNER, { id: created.id, ...details })).json();
  assert.deepEqual([saved.inControl, saved.parts, saved.note], [SELF, [DOER, INSPECTOR], "calm"]);
});

test("a Check-in names each Part by id and shows its current name", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 3 })).json();
  await patch(env, OWNER, {
    id,
    inControl: { id: WOLF.id, name: "stale" },
    parts: [{ id: DOER.id, name: "stale" }],
  });
  const saved = await (await patch(env, OWNER, { id, note: "x" })).json();
  assert.deepEqual([saved.inControl, saved.parts], [WOLF, [DOER]]);
});

test("the Part in control is not listed again as present", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 3 })).json();

  const saved = await (
    await patch(env, OWNER, { id, inControl: DOER, parts: [DOER, SKEPTIC] })
  ).json();

  assert.deepEqual([saved.inControl, saved.parts], [DOER, [SKEPTIC]]);
});

test("a Part in control keeps its place when only the Parts present change", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 3 })).json();
  await patch(env, OWNER, { id, inControl: WOLF, parts: [DOER] });
  const saved = await (await patch(env, OWNER, { id, parts: [SKEPTIC, INSPECTOR] })).json();
  assert.deepEqual([saved.inControl, saved.parts], [WOLF, [SKEPTIC, INSPECTOR]]);
});

test("Self or no answer replaces the Part in control", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 3 })).json();
  await patch(env, OWNER, { id, inControl: WOLF, parts: [DOER] });
  const self = await (await patch(env, OWNER, { id, inControl: SELF })).json();
  assert.deepEqual([self.inControl, self.parts], [SELF, [DOER]]);
  const cleared = await (await patch(env, OWNER, { id, inControl: null, parts: [] })).json();
  assert.deepEqual([cleared.inControl, cleared.parts], [null, []]);
});

test("a Part that no longer exists is skipped", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 3 })).json();

  const res = await patch(env, OWNER, {
    id,
    inControl: { id: 999, name: "Gone" },
    parts: [DOER, { id: 998, name: "Gone" }],
  });

  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.deepEqual([saved.inControl, saved.parts], [null, [DOER]]);
});

test("PATCH refuses a Part named by text", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 3 })).json();
  assert.equal((await patch(env, OWNER, { id, parts: "Doer" })).status, 400);
  assert.equal((await patch(env, OWNER, { id, inControl: "Doer" })).status, 400);
});

test("PATCH saves None (0) and A lot (2) in each of Tense, Low and Tired", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 5 })).json();
  const res = await (await patch(env, OWNER, { id, tense: 0, low: 2, tired: 0 })).json();
  assert.deepEqual([res.tense, res.low, res.tired], [0, 2, 0]);
});

test("PATCH saves the How I felt quadrant and clears it with null", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 5 })).json();

  const saved = await (
    await patch(env, OWNER, { id, pleasantness: "Pleasant", feelingEnergy: "Low" })
  ).json();

  assert.deepEqual([saved.pleasantness, saved.feelingEnergy], ["Pleasant", "Low"]);
  const cleared = await (await patch(env, OWNER, { id, pleasantness: null })).json();
  assert.deepEqual([cleared.pleasantness, cleared.feelingEnergy], [null, "Low"]);
});

test("PATCH changes only the fields sent", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 5 })).json();
  await patch(env, OWNER, { id, ...DETAILS });
  const edited = await (await patch(env, OWNER, { id, place: "home" })).json();
  assert.deepEqual(
    [edited.place, edited.note, edited.thought, edited.tense],
    ["home", "rough", "I'm behind", 2],
  );
});

test("PATCH clears a field sent empty or null", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 5 })).json();
  await patch(env, OWNER, { id, ...DETAILS });

  const cleared = await (
    await patch(env, OWNER, { id, note: "", tense: null, tired: null })
  ).json();

  assert.deepEqual([cleared.note, cleared.tense, cleared.low, cleared.tired], ["", null, 1, null]);
});

test("PATCH changes the score and re-derives the zone", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 2 })).json();
  const moved = await (await patch(env, OWNER, { id, score: 7 })).json();
  assert.deepEqual([moved.score, moved.zone], [7, "Sun"]);
});

test("PATCH moves a Check-in to the sent time", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 5 })).json();

  const moved = await (
    await patch(env, OWNER, { id, checkedInAt: "2026-11-03T14:30:00-05:00" })
  ).json();

  assert.equal(moved.checkedInAt, "2026-11-03T19:30:00.000Z");
});

test("PATCH without a time keeps the Check-in's timestamp", async () => {
  const env = makeEnv();
  const { id, checkedInAt } = await (await post(env, OWNER, { score: 5 })).json();
  assert.equal((await (await patch(env, OWNER, { id })).json()).checkedInAt, checkedInAt);
});

test("PATCH on a missing Check-in is not found", async () => {
  assert.equal((await patch(makeEnv(), OWNER, { id: 99 })).status, 404);
});

const CLIENT_ID = "0b6f5d1e-6c2a-4c1e-9d55-2f1f4b2d7a10";

test("a replayed POST with the same clientId returns the saved Check-in instead of a second one", async () => {
  const env = makeEnv();
  const first = await post(env, OWNER, { score: 3, note: "tired", clientId: CLIENT_ID });
  const replay = await post(env, OWNER, { score: 3, note: "tired", clientId: CLIENT_ID });

  assert.equal(first.status, 201);
  assert.equal(replay.status, 200);
  const saved = await first.json();
  assert.deepEqual(await replay.json(), saved);
  assert.deepEqual((await (await get(env, OWNER)).json()).checkIns, [saved]);
});

test("POSTs without a clientId each save a Check-in", async () => {
  const env = makeEnv();
  await post(env, OWNER, { score: 3 });
  await post(env, OWNER, { score: 3 });

  assert.equal((await (await get(env, OWNER)).json()).checkIns.length, 2);
});

test("PATCH finds a Check-in by the clientId it was created with", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 3, clientId: CLIENT_ID })).json();
  const patched = await patch(env, OWNER, { clientId: CLIENT_ID, place: "home" });

  assert.equal(patched.status, 200);
  assert.deepEqual({ id: (await patched.json()).id, place: "home" }, { id, place: "home" });
});

test("PATCH by a clientId no Check-in has is not found", async () => {
  assert.equal((await patch(makeEnv(), OWNER, { clientId: CLIENT_ID, place: "home" })).status, 404);
});

const invalidDetails: [string, RequestBody][] = [
  ["a missing id", { place: "home" }],
  ["a clientId that is not a UUID", { clientId: "abc", place: "home" }],
  ["a non-string place", { id: 1, place: 3 }],
  ["a Tense amount above A lot", { id: 1, tense: 3 }],
  ["a Tired amount above A lot", { id: 1, tired: 3 }],
  ["a fractional Low amount", { id: 1, low: 1.5 }],
  ["a negative Low amount", { id: 1, low: -1 }],
  ["a pleasantness off the quadrant", { id: 1, pleasantness: "Neutral" }],
  ["a feeling energy off the quadrant", { id: 1, feelingEnergy: "Medium" }],
  ["a score of 0", { id: 1, score: 0 }],
  ["a score of 9", { id: 1, score: 9 }],
  ["a fractional score", { id: 1, score: 3.5 }],
  ["an unparseable time", { id: 1, checkedInAt: "yesterday-ish" }],
  ["a non-string time", { id: 1, checkedInAt: 5 }],
  ["a body that is not JSON", "nope"],
];

for (const [name, body] of invalidDetails) {
  test(`PATCH rejects ${name}`, async () => {
    const env = makeEnv();
    await post(env, OWNER, { score: 4 });
    assert.equal((await patch(env, OWNER, body)).status, 400);
  });
}

test("a non-owner cannot add details", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 4 })).json();
  assert.equal((await patch(env, STRANGER, { id, ...DETAILS })).status, 403);
});

test("DELETE removes only that Check-in", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 2 })).json();
  await post(env, OWNER, { score: 6 });
  assert.equal((await remove(env, OWNER, { id })).status, 204);
  const { checkIns } = await (await get(env, OWNER)).json();
  assert.deepEqual(
    checkIns.map((c: { score: number }) => c.score),
    [6],
  );
});

test("DELETE removes a Check-in that names Parts, and its links", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 2 })).json();
  await patch(env, OWNER, { id, inControl: WOLF, parts: [DOER] });
  assert.equal((await remove(env, OWNER, { id })).status, 204);

  const { results } = await env.DB.prepare("SELECT count(*) AS n FROM check_in_parts")
    .bind()
    .all<{ n: number }>();

  assert.equal(results[0]?.n, 0);
});

test("DELETE on a missing Check-in is not found", async () => {
  assert.equal((await remove(makeEnv(), OWNER, { id: 99 })).status, 404);
});

const badIds: [string, RequestBody][] = [
  ["a string id", { id: "1" }],
  ["a missing id", {}],
  ["a body that is not JSON", "not json"],
];

for (const [name, body] of badIds) {
  test(`DELETE rejects ${name}`, async () => {
    assert.equal((await remove(makeEnv(), OWNER, body)).status, 400);
  });
}

test("a non-owner cannot delete a Check-in", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 3 })).json();
  assert.equal((await remove(env, STRANGER, { id })).status, 403);
  assert.equal((await (await get(env, OWNER)).json()).checkIns.length, 1);
});

const READ_BACK = /SELECT[\s\S]*FROM check_ins/;

test("a PATCH is not found when the Check-in vanishes before the read back", async () => {
  const env = makeEnv();
  const { id } = await (await post(env, OWNER, { score: 3 })).json();

  const res = await patch({ ...env, DB: withVanishingRows(env.DB, READ_BACK, 2) }, OWNER, {
    id,
    note: "gone",
  });

  assert.equal(res.status, 404);
});

test("a POST fails when the inserted Check-in cannot be read back", async () => {
  const env = makeEnv();

  await assert.rejects(
    post({ ...env, DB: withVanishingRows(env.DB, READ_BACK) }, OWNER, { score: 3 }),
    /inserted Check-in was not found/,
  );
});

test("a replayed POST fails when its saved Check-in cannot be read back", async () => {
  const env = makeEnv();
  await post(env, OWNER, { score: 3, clientId: CLIENT_ID });

  await assert.rejects(
    post({ ...env, DB: withVanishingRows(env.DB, READ_BACK) }, OWNER, {
      score: 3,
      clientId: CLIENT_ID,
    }),
    /client_id conflict found no saved Check-in/,
  );
});
