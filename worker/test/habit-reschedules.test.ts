import assert from "node:assert/strict";
import { torontoDay, type Habit, type Reschedules } from "@/core";
import { onRequestGet, onRequestPost } from "@worker/api/habits";
import type { Env, Json } from "@worker/lib/env";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";
import { readJson } from "./helpers/json";

interface HomeBody {
  habits: Habit[];
  reschedules?: Reschedules;
}

const get = (env: Env, query: string) =>
  onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", `https://x/api/habits${query}`, { email: OWNER }),
  });

const post = (env: Env, body: Json, email = OWNER) =>
  onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/habits", { body, email }),
  });

const DUE = "2099-06-01";

async function seedHabit(env: Env, target: Json, startDate = DUE) {
  const response = await post(env, {
    type: "habit",
    name: "Go portaging",
    kind: "good",
    startDate,
    target,
  });

  return (await readJson<{ id: string }>(response)).id;
}

const seedOneOff = (env: Env, startDate = DUE) =>
  seedHabit(env, { type: "once", count: 1, days: [] }, startDate);

const reschedule = (habit: string, fields: Record<string, Json> = {}) => ({
  type: "reschedule",
  habit,
  to: "2099-06-08",
  cause: "outside",
  ...fields,
});

const homeBody = async (env: Env) =>
  readJson<HomeBody>(await get(env, "?view=home&since=2099-01-01"));

const reschedulesOf = async (env: Env, id: string) => (await homeBody(env)).reschedules?.[id] ?? [];

const startDateOf = async (env: Env, id: string) =>
  (await homeBody(env)).habits.find((habit) => habit.id === id)?.startDate;

const rescheduleRows = async (env: Env) =>
  (await env.DB.prepare("SELECT id FROM habit_reschedules").bind().all()).results;

test("a Reschedule moves the One-off's date and keeps the old one with its cause", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env);

  const response = await post(env, reschedule(id, { cause: "avoidance", note: "too tired" }));

  assert.equal(response.status, 204);
  assert.equal(await startDateOf(env, id), "2099-06-08");
  const [row] = await reschedulesOf(env, id);
  assert.deepEqual(
    { ...row, createdAt: undefined },
    { from: DUE, to: "2099-06-08", cause: "avoidance", note: "too tired", createdAt: undefined },
  );
});

test("a Reschedule without a note stores an empty note and its creation time", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env);
  await post(env, reschedule(id));

  const [row] = await reschedulesOf(env, id);

  assert.ok(row, "one Reschedule");
  assert.equal(row.note, "");
  assert.match(row.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test("two Reschedules keep both rows, earliest first, and the date is the latest `to`", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env);
  await post(env, reschedule(id));
  await post(env, reschedule(id, { to: "2099-06-15", cause: "avoidance" }));

  assert.deepEqual(
    (await reschedulesOf(env, id)).map(({ from, to }) => [from, to]),
    [
      [DUE, "2099-06-08"],
      ["2099-06-08", "2099-06-15"],
    ],
  );
  assert.equal(await startDateOf(env, id), "2099-06-15");
});

test("a One-off can move to today", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env);
  const today = torontoDay(new Date());

  assert.equal((await post(env, reschedule(id, { to: today }))).status, 204);
  assert.equal(await startDateOf(env, id), today);
});

test("an overdue One-off can move ahead", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env, "2026-01-05");

  assert.equal((await post(env, reschedule(id))).status, 204);
  assert.equal(await startDateOf(env, id), "2099-06-08");
});

test("a stranger cannot Reschedule and nothing is written", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env);

  assert.equal((await post(env, reschedule(id), STRANGER)).status, 403);
  assert.deepEqual(await rescheduleRows(env), []);
  assert.equal(await startDateOf(env, id), DUE);
});

test.each([
  { id: "an unknown cause", fields: { cause: "weather" } },
  { id: "a missing cause", fields: { cause: null } },
  { id: "a date before today", fields: { to: "2000-01-01" } },
  { id: "a malformed date", fields: { to: "June 8" } },
  { id: "a date that does not exist", fields: { to: "2099-02-30" } },
  { id: "the date it already has", fields: { to: DUE } },
  { id: "a note that is not text", fields: { note: 3 } },
  { id: "a note over the length limit", fields: { note: "x".repeat(2001) } },
])("a Reschedule with $id is refused and nothing is written", async ({ fields }) => {
  const env = makeEnv();
  const id = await seedOneOff(env);

  assert.equal((await post(env, reschedule(id, fields))).status, 400);
  assert.deepEqual(await rescheduleRows(env), []);
  assert.equal(await startDateOf(env, id), DUE);
});

test("a repeating Habit cannot be Rescheduled", async () => {
  const env = makeEnv();
  const id = await seedHabit(env, { type: "daily", count: 7, days: [] });

  assert.equal((await post(env, reschedule(id))).status, 400);
  assert.deepEqual(await rescheduleRows(env), []);
  assert.equal(await startDateOf(env, id), DUE);
});

test("a Reschedule of a Habit that does not exist is refused", async () => {
  const env = makeEnv();

  assert.equal((await post(env, reschedule("no-such-habit"))).status, 400);
  assert.deepEqual(await rescheduleRows(env), []);
});

test("GET sends no reschedules without `since`", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env);
  await post(env, reschedule(id));

  const body = await readJson<HomeBody>(await get(env, "?view=home"));

  assert.equal(body.reschedules, undefined);
});

test("GET returns a Reschedule older than `since`, so a One-off keeps its whole history", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env);
  await post(env, reschedule(id));

  const body = await readJson<HomeBody>(await get(env, "?view=home&since=2099-12-01"));

  assert.equal(body.reschedules?.[id]?.length, 1);
});

test("deleting a rescheduled One-off removes its Reschedules", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env);
  await post(env, reschedule(id));

  assert.equal((await post(env, { type: "delete-habit", id })).status, 204);
  assert.deepEqual(await rescheduleRows(env), []);
});

const editDate = (env: Env, id: string, startDate: string) =>
  post(env, { type: "habit", id, startDate });

test("an upcoming One-off with no Reschedule takes a date fix from the form", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env);

  assert.equal((await editDate(env, id, "2099-06-02")).status, 204);
  assert.equal(await startDateOf(env, id), "2099-06-02");
});

test("a rescheduled One-off only moves by another Reschedule, so its history stays whole", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env);
  await post(env, reschedule(id));

  assert.equal((await editDate(env, id, "2099-07-01")).status, 400);
  assert.equal((await rescheduleRows(env)).length, 1);
});

const undo = (habit: string, to = "2099-06-08") => ({ type: "undo-reschedule", habit, to });

test("an Undo takes back the latest Reschedule and restores the date it left", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env);
  await post(env, reschedule(id));
  await post(env, reschedule(id, { to: "2099-06-15" }));

  assert.equal((await post(env, undo(id, "2099-06-15"))).status, 204);
  assert.equal(await startDateOf(env, id), "2099-06-08");
  assert.deepEqual(
    (await reschedulesOf(env, id)).map(({ to }) => to),
    ["2099-06-08"],
  );
});

test.each([
  { id: "an earlier Reschedule than the latest", to: "2099-06-08" },
  { id: "a date it was never moved to", to: "2099-07-01" },
])("an Undo naming $id is refused and nothing changes", async ({ to }) => {
  const env = makeEnv();
  const id = await seedOneOff(env);
  await post(env, reschedule(id));
  await post(env, reschedule(id, { to: "2099-06-15" }));

  assert.equal((await post(env, undo(id, to))).status, 400);
  assert.equal(await startDateOf(env, id), "2099-06-15");
  assert.equal((await rescheduleRows(env)).length, 2);
});

test("an Undo of a One-off with no Reschedule is refused", async () => {
  const env = makeEnv();
  const id = await seedOneOff(env);

  assert.equal((await post(env, undo(id, DUE))).status, 400);
  assert.equal(await startDateOf(env, id), DUE);
});
