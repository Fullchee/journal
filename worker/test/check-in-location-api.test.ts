import assert from "node:assert/strict";
import { metresBetween, NEAR_METRES } from "@worker/lib/check-in-store";
import { onRequestGet, onRequestPatch, onRequestPost } from "@worker/api/check-ins";
import type { Env } from "@worker/lib/env";
import { apiRequest, makeEnv, OWNER, type RequestBody } from "./helpers/env";

const HOME = { latitude: 43.6532, longitude: -79.3832 };

// About 100 m and 300 m north of HOME: a degree of latitude is about 111 km.
const NEXT_DOOR = { latitude: HOME.latitude + 0.0009, longitude: HOME.longitude };
const DOWN_THE_ROAD = { latitude: HOME.latitude + 0.0027, longitude: HOME.longitude };

const patch = (env: Env, body: RequestBody) =>
  onRequestPatch({
    env,
    params: {},
    request: apiRequest("PATCH", "https://x/api/check-ins", { body, email: OWNER }),
  });

const near = (env: Env, query: string) =>
  onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", `https://x/api/check-ins?${query}`, { email: OWNER }),
  });

// Monday 9:00 and Saturday 9:00 in Toronto.
const MONDAY_9AM = "2026-11-02T09:00:00-05:00";
const SATURDAY_9AM = "2026-11-07T09:00:00-05:00";

// A guess for a Check-in at `when`, from `position` when given.
const at = (position?: typeof HOME, when = MONDAY_9AM) => {
  const query = new URLSearchParams({ at: when });

  if (position) {
    query.set("latitude", String(position.latitude));
    query.set("longitude", String(position.longitude));
  }

  return query.toString();
};

// Saves a Check-in with a place, at `checkedInAt`, and, when given, the position it was saved at.
async function saveAt(env: Env, place: string, position?: typeof HOME, checkedInAt = MONDAY_9AM) {
  const created = await onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/check-ins", { body: { score: 5 }, email: OWNER }),
  });

  const { id } = await created.json();
  const res = await patch(env, { id, place, checkedInAt });
  assert.equal(res.status, 200);

  // A PATCH only takes a position for a Check-in saved now, so a past one gets it directly.
  if (position) {
    await env.DB.prepare("UPDATE check_ins SET latitude = ?, longitude = ? WHERE id = ?")
      .bind(position.latitude, position.longitude, id)
      .run();
  }

  return res.json();
}

const guessFor = (env: Env, id: number) => near(env, `guessFor=${id}`);

test("metresBetween measures the distance along the Earth's surface", () => {
  assert.equal(metresBetween(HOME, HOME), 0);
  assert.ok(Math.abs(metresBetween(HOME, NEXT_DOOR) - 100) < 1);
  assert.ok(Math.abs(metresBetween(HOME, DOWN_THE_ROAD) - 300) < 2);
  assert.ok(metresBetween(HOME, NEXT_DOOR) < NEAR_METRES);
});

test("PATCH stores a position for a Check-in saved now", async () => {
  const env = makeEnv();
  const { id } = await saveAt(env, "Home", undefined, new Date().toISOString());

  assert.equal((await patch(env, { id, ...HOME })).status, 200);
  assert.deepEqual(await (await near(env, at(HOME, SATURDAY_9AM))).json(), { place: "Home" });
});

test("PATCH refuses a position for a Check-in moved away from now", async () => {
  const env = makeEnv();
  const { id } = await saveAt(env, "Home");

  assert.equal((await patch(env, { id, ...HOME })).status, 400);
  assert.deepEqual(await (await near(env, at(HOME, SATURDAY_9AM))).json(), { place: null });
});

test("PATCH stores a queued position replayed hours later, checked against when the fix was taken", async () => {
  const env = makeEnv();
  const { id } = await saveAt(env, "Home");

  assert.equal((await patch(env, { id, ...HOME, fixedAt: MONDAY_9AM })).status, 200);
  assert.deepEqual(await (await near(env, at(HOME, SATURDAY_9AM))).json(), { place: "Home" });
});

test("PATCH refuses a fix taken more than an hour from the Check-in's time", async () => {
  const env = makeEnv();
  const { id } = await saveAt(env, "Home");

  const res = await patch(env, { id, ...HOME, fixedAt: "2026-11-02T11:00:00-05:00" });

  assert.equal(res.status, 400);
});

test("a saved position never comes back in a Check-in", async () => {
  const saved = await saveAt(makeEnv(), "Home", HOME);
  assert.equal(saved.place, "Home");
  assert.equal("latitude" in saved, false);
  assert.equal("longitude" in saved, false);
});

test("GET with a position returns the place of the nearest Check-in close by", async () => {
  const env = makeEnv();
  await saveAt(env, "Cafe", DOWN_THE_ROAD);
  await saveAt(env, "Home", HOME);
  await saveAt(env, "Work", NEXT_DOOR);

  assert.deepEqual(await (await near(env, at(HOME))).json(), { place: "Home" });
});

test("GET with a position returns no place when nothing was saved within reach", async () => {
  const env = makeEnv();
  await saveAt(env, "Cafe", DOWN_THE_ROAD);
  await saveAt(env, "Home");

  assert.deepEqual(await (await near(env, at(HOME))).json(), { place: null });
});

test("a Check-in saved close by without a place is never guessed", async () => {
  const env = makeEnv();
  await saveAt(env, "", HOME);

  assert.deepEqual(await (await near(env, at(HOME))).json(), { place: null });
});

test("close by, the place logged at this time of day beats the nearest", async () => {
  const env = makeEnv();
  await saveAt(env, "Home", HOME, SATURDAY_9AM);
  await saveAt(env, "Office", NEXT_DOOR, MONDAY_9AM);

  assert.deepEqual(await (await near(env, at(HOME))).json(), { place: "Office" });
  assert.deepEqual(await (await near(env, at(HOME, SATURDAY_9AM))).json(), { place: "Home" });
});

test("with no position, the place logged twice at this time of day is guessed", async () => {
  const env = makeEnv();
  await saveAt(env, "Office", undefined, MONDAY_9AM);
  await saveAt(env, "Office", undefined, "2026-10-27T08:15:00-04:00");
  await saveAt(env, "Gym", undefined, "2026-11-02T18:00:00-05:00");

  assert.deepEqual(await (await near(env, at())).json(), { place: "Office" });
});

test("with no position, one past Check-in at this time is not enough", async () => {
  const env = makeEnv();
  await saveAt(env, "Office", undefined, MONDAY_9AM);

  assert.deepEqual(await (await near(env, at())).json(), { place: null });
});

test("a routine wraps past midnight and keeps weekdays apart from weekends", async () => {
  const env = makeEnv();
  await saveAt(env, "Bed", undefined, "2026-11-02T23:30:00-05:00");
  await saveAt(env, "Bed", undefined, "2026-11-04T00:15:00-05:00");

  const lateMonday = at(undefined, "2026-11-03T00:00:00-05:00");
  const lateSaturday = at(undefined, "2026-11-08T00:00:00-05:00");
  assert.deepEqual(await (await near(env, lateMonday)).json(), { place: "Bed" });
  assert.deepEqual(await (await near(env, lateSaturday)).json(), { place: null });
});

test("moving a Check-in's time more than an hour drops its position", async () => {
  const env = makeEnv();
  const { id } = await saveAt(env, "Home", HOME);
  await saveAt(env, "Home", undefined, SATURDAY_9AM);

  await patch(env, { id, checkedInAt: "2026-11-02T09:45:00-05:00" });
  assert.deepEqual(await (await near(env, at(HOME, SATURDAY_9AM))).json(), { place: "Home" });

  await patch(env, { id, checkedInAt: "2026-11-02T12:00:00-05:00" });
  assert.deepEqual(await (await near(env, at(HOME, SATURDAY_9AM))).json(), { place: null });
});

test("routines older than 90 days are not guessed", async () => {
  const env = makeEnv();
  await saveAt(env, "Old office", undefined, "2026-07-27T09:00:00-04:00");
  await saveAt(env, "Old office", undefined, "2026-07-28T09:00:00-04:00");

  assert.deepEqual(await (await near(env, at())).json(), { place: null });
});

test("an old Check-in close by is still guessed", async () => {
  const env = makeEnv();
  await saveAt(env, "Cottage", HOME, "2025-07-26T09:00:00-04:00");

  assert.deepEqual(await (await near(env, at(HOME))).json(), { place: "Cottage" });
});

test("guessFor guesses from the Check-in's own time and stored position", async () => {
  const env = makeEnv();
  await saveAt(env, "Office", NEXT_DOOR, SATURDAY_9AM);
  const { id } = await saveAt(env, "", HOME, MONDAY_9AM);

  assert.deepEqual(await (await guessFor(env, id)).json(), { place: "Office" });
});

test("guessFor guesses from time alone for a Check-in with no position", async () => {
  const env = makeEnv();
  // Toronto is on daylight time until November 1.
  await saveAt(env, "Office", undefined, "2026-10-26T09:00:00-04:00");
  await saveAt(env, "Office", undefined, "2026-10-27T09:30:00-04:00");
  const { id } = await saveAt(env, "", undefined, MONDAY_9AM);

  assert.deepEqual(await (await guessFor(env, id)).json(), { place: "Office" });
});

test("guessFor rejects a bad id and an unknown Check-in", async () => {
  const env = makeEnv();
  assert.equal((await near(env, "guessFor=abc")).status, 400);
  assert.equal((await guessFor(env, 999)).status, 404);
});

test("a routine follows Toronto's clock, whatever time zone an old app sends", async () => {
  const env = makeEnv();
  await saveAt(env, "Office", undefined, "2026-10-26T09:00:00-04:00");
  await saveAt(env, "Office", undefined, "2026-10-27T09:30:00-04:00");

  assert.deepEqual(await (await near(env, `${at()}&timeZone=Asia/Tokyo`)).json(), {
    place: "Office",
  });
});

const badQueries: [string, string][] = [
  ["a missing longitude", `${at()}&latitude=43`],
  ["an empty latitude", `${at()}&latitude=&longitude=-79`],
  ["a latitude past the pole", `${at()}&latitude=91&longitude=0`],
  ["a longitude past 180", `${at()}&latitude=0&longitude=181`],
  ["a non-number", `${at()}&latitude=north&longitude=0`],
  ["a bad time", "at=soon"],
];

for (const [name, query] of badQueries) {
  test(`GET rejects ${name}`, async () => {
    assert.equal((await near(makeEnv(), query)).status, 400);
  });
}

const badPatches: [string, Record<string, RequestBody>][] = [
  ["a latitude without a longitude", { latitude: 43 }],
  ["a longitude without a latitude", { longitude: -79 }],
  ["a latitude past the pole", { latitude: -90.5, longitude: 0 }],
  ["a longitude past 180", { latitude: 0, longitude: 180.5 }],
  ["a string coordinate", { latitude: "43", longitude: -79 }],
  ["a bad fix time", { latitude: 43, longitude: -79, fixedAt: "soon" }],
];

for (const [name, body] of badPatches) {
  test(`PATCH rejects ${name}`, async () => {
    const env = makeEnv();
    const { id } = await saveAt(env, "Home");
    assert.equal((await patch(env, { id, ...body })).status, 400);
  });
}
