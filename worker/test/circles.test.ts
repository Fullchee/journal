import assert from "node:assert/strict";
import { MISSED, type Circle, type Interaction } from "@/core";
import * as circles from "@worker/api/circles";
import * as connections from "@worker/api/connections";
import * as habits from "@worker/api/habits";
import type { Env, Json } from "@worker/lib/env";
import { freezeDate } from "./helpers/clock";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";
import { readJson } from "./helpers/json";

type Handler = typeof connections.onRequestGet;

// Saturdays; 20:00 UTC is 15:00 in Toronto, after a 09:00 practice has passed.
const SATURDAY = "2026-11-14";
const SATURDAY_2027 = "2027-04-24";

const at = (day: string) => freezeDate(Date.parse(`${day}T20:00:00Z`));

beforeEach(() => at(SATURDAY));

afterEach(() => jest.useRealTimers());

/** `request` is such as "PATCH /api/circles/7". */
function sendAs(
  handler: Handler,
  env: Env,
  request: string,
  { body, email }: { body?: Json; email: string },
) {
  const [method = "GET", path = ""] = request.split(" ", 2);
  const [, id] = /\/(\d+)$/.exec(path) ?? [];

  return handler({
    env,
    params: id === undefined ? {} : { id: [id] },
    request: apiRequest(method, `https://x${path}`, { email, body }),
  });
}

const send = (handler: Handler, env: Env, request: string, body?: Json) =>
  sendAs(handler, env, request, { email: OWNER, ...(body !== undefined && { body }) });

const postHabit = (env: Env, body: Json) =>
  habits.onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/habits", { body, email: OWNER }),
  });

const PRACTICE = {
  type: "habit",
  name: "Dragon boat practice",
  startDate: SATURDAY,
  target: { type: "days", count: 7, days: [6] },
  alarm: { time: "09:00", kind: "alarm" },
  optOutFrom: SATURDAY,
  record: "duration",
  targetMinutes: 60,
  usualMinutes: 120,
};

async function createHabit(env: Env, body: Json = PRACTICE) {
  const res = await postHabit(env, body);
  assert.equal(res.status, 201);

  return (await readJson<{ id: string }>(res)).id;
}

const addPerson = async (env: Env, name: string, inCircles: string[]) =>
  (
    await readJson<{ id: number }>(
      await send(connections.onRequestPost, env, "POST /api/connections", {
        name,
        circles: inCircles,
      }),
    )
  ).id;

const listCircles = async (env: Env) =>
  (await readJson<{ circles: Circle[] }>(await send(circles.onRequestGet, env, "GET /api/circles")))
    .circles;

const circleNamed = async (env: Env, name: string) => {
  const found = (await listCircles(env)).find((circle) => circle.name === name);
  assert.ok(found);

  return found;
};

const follow = (env: Env, circleId: number, habitId: string | null) =>
  send(circles.onRequestPatch, env, `PATCH /api/circles/${circleId}`, { habitId });

const lastContacted = async (env: Env) =>
  Object.fromEntries(
    (
      await readJson<{ connections: { name: string; lastContactedOn: string | null }[] }>(
        await send(connections.onRequestGet, env, "GET /api/connections"),
      )
    ).connections.map((c) => [c.name, c.lastContactedOn]),
  );

const interactionsOf = async (env: Env, id: number) =>
  (
    await readJson<{ item: { interactions: Interaction[] } }>(
      await send(connections.onRequestGet, env, `GET /api/connections/${id}`),
    )
  ).item.interactions;

/** A team of two following an Opt-out practice, plus someone outside it. */
async function team() {
  const env = makeEnv();
  const ana = await addPerson(env, "Ana", ["Shockwave dragon boat 2026"]);
  const ben = await addPerson(env, "Ben", ["Shockwave dragon boat 2026"]);
  const zed = await addPerson(env, "Zed", []);
  const habit = await createHabit(env);
  const circle = await circleNamed(env, "Shockwave dragon boat 2026");
  assert.equal((await follow(env, circle.id, habit)).status, 200);

  return { env, ana, ben, zed, habit, circle };
}

test("a Saturday practice passing logs one Circle Interaction of 120 minutes, and every member's last contacted is Saturday", async () => {
  const { env, ana, ben } = await team();

  assert.deepEqual(await lastContacted(env), { Ana: SATURDAY, Ben: SATURDAY, Zed: null });
  await lastContacted(env);

  const [logged, ...more] = await interactionsOf(env, ana);
  assert.deepEqual(more, []);
  assert.deepEqual(
    { ...logged, id: undefined },
    {
      id: undefined,
      day: SATURDAY,
      kind: "in-person",
      note: "",
      minutes: 120,
      circle: "Shockwave dragon boat 2026",
      connections: [
        { id: ana, name: "Ana" },
        { id: ben, name: "Ben" },
      ],
    },
  );
});

test("a Skipped practice logs no Interaction, and one Skipped after it counted loses its Interaction", async () => {
  const { env, ana, habit } = await team();
  await lastContacted(env);

  const skip = { type: "check", date: SATURDAY, habit, on: true, count: MISSED, cause: "outside" };
  assert.equal((await postHabit(env, { type: "delete-duration", entry: 1 })).status, 204);
  assert.equal((await postHabit(env, skip)).status, 204);

  assert.deepEqual([await interactionsOf(env, ana), (await lastContacted(env))["Ana"]], [[], null]);
});

test("a practice logged in the same pass that drops a Skipped one keeps its members, though it reuses the dropped id", async () => {
  const { env, ana, habit } = await team();
  await lastContacted(env);

  const skip = { type: "check", date: SATURDAY, habit, on: true, count: MISSED, cause: "outside" };
  assert.equal((await postHabit(env, { type: "delete-duration", entry: 1 })).status, 204);
  assert.equal((await postHabit(env, skip)).status, 204);
  at("2026-11-21");

  assert.deepEqual(
    (await interactionsOf(env, ana)).map((i) => [i.day, i.connections.length]),
    [["2026-11-21", 2]],
  );
});

test("a checked day of a check Habit logs an Interaction with no minutes, and a Habit no Circle follows logs none", async () => {
  const env = makeEnv();
  const ana = await addPerson(env, "Ana", ["Mahjong"]);

  const habit = await createHabit(env, {
    type: "habit",
    name: "Mahjong",
    startDate: SATURDAY,
    target: { type: "days", count: 7, days: [6] },
  });

  await follow(env, (await circleNamed(env, "Mahjong")).id, habit);
  assert.equal(
    (await postHabit(env, { type: "check", date: SATURDAY, habit, on: true })).status,
    204,
  );
  await postHabit(env, { type: "check", date: SATURDAY, habit: "up", on: true });

  assert.deepEqual(
    (await interactionsOf(env, ana)).map(({ minutes, circle }) => [minutes, circle]),
    [[null, "Mahjong"]],
  );
});

test("a day before the Circle began following logs nothing", async () => {
  const env = makeEnv();
  const ana = await addPerson(env, "Ana", ["Mahjong"]);

  const habit = await createHabit(env, {
    type: "habit",
    name: "Mahjong",
    startDate: "2026-11-07",
    target: { type: "days", count: 7, days: [6] },
  });

  assert.equal(
    (await postHabit(env, { type: "check", date: "2026-11-07", habit, on: true })).status,
    204,
  );
  await follow(env, (await circleNamed(env, "Mahjong")).id, habit);

  assert.deepEqual(await interactionsOf(env, ana), []);
});

test("after the 2027 Circle starts, practices log on 2027's members only and 2026's Interactions stay", async () => {
  const { env, ana, ben, zed, habit, circle } = await team();
  await lastContacted(env);

  at(SATURDAY_2027);

  const created = await send(circles.onRequestPost, env, "POST /api/circles", {
    name: "Shockwave dragon boat 2027",
    habitId: habit,
    memberIds: [ana, zed],
  });

  assert.equal(created.status, 201);

  await postHabit(env, {
    type: "habit",
    id: habit,
    seasons: [{ start: SATURDAY_2027, end: null }],
  });

  assert.deepEqual(await lastContacted(env), {
    Ana: SATURDAY_2027,
    Ben: SATURDAY,
    Zed: SATURDAY_2027,
  });
  assert.deepEqual(
    (await interactionsOf(env, ben)).map((i) => [i.day, i.circle]),
    [[SATURDAY, circle.name]],
  );
  assert.deepEqual(
    (await interactionsOf(env, ana)).map((i) => [i.day, i.circle]),
    [
      [SATURDAY_2027, "Shockwave dragon boat 2027"],
      [SATURDAY, circle.name],
    ],
  );
});

test("deleting the Habit keeps its Circle's Interactions", async () => {
  const { env, ana, habit, circle } = await team();
  await lastContacted(env);
  assert.equal((await postHabit(env, { type: "delete-habit", id: habit })).status, 204);

  assert.deepEqual(
    [(await interactionsOf(env, ana)).length, (await circleNamed(env, circle.name)).habitId],
    [1, null],
  );
});

test("the Circles list shows each Circle's Habit, start day and members A to Z", async () => {
  const { env, ana, ben, habit, circle } = await team();

  assert.deepEqual(await listCircles(env), [
    {
      id: circle.id,
      name: circle.name,
      habitId: habit,
      followsFrom: SATURDAY,
      members: [
        { id: ana, name: "Ana" },
        { id: ben, name: "Ben" },
      ],
    },
  ]);
});

test("relinking to the same Habit keeps its start day, and unlinking clears both", async () => {
  const { env, habit, circle } = await team();
  at("2026-11-21");
  await follow(env, circle.id, habit);
  const kept = await circleNamed(env, circle.name);
  await follow(env, circle.id, null);
  const cleared = await circleNamed(env, circle.name);

  assert.deepEqual(
    [kept.followsFrom, cleared.habitId, cleared.followsFrom],
    [SATURDAY, null, null],
  );
});

test("a Circle can't follow a missing Habit or a One-off, and a missing Circle is not found", async () => {
  const { env, circle } = await team();

  const oneOff = await createHabit(env, {
    type: "habit",
    name: "Regatta",
    startDate: SATURDAY,
    target: { type: "once", count: 1, days: [] },
  });

  assert.deepEqual(
    [
      (await follow(env, circle.id, "nope")).status,
      (await follow(env, circle.id, oneOff)).status,
      (await follow(env, 999, null)).status,
      (await send(circles.onRequestPatch, env, "PATCH /api/circles", { habitId: null })).status,
      (
        await send(circles.onRequestPatch, env, `PATCH /api/circles/${circle.id}`, {
          habitId: null,
          name: "x",
        })
      ).status,
    ],
    [400, 400, 404, 404, 400],
  );
});

for (const target of [
  { type: "monthly", count: 2, days: [] },
  { type: "interval", count: 3, days: [] },
])
  test(`a Circle can follow a ${target.type} Habit`, async () => {
    const { env, circle } = await team();

    const habit = await createHabit(env, {
      type: "habit",
      name: "Paddle",
      startDate: SATURDAY,
      target,
    });

    assert.equal((await follow(env, circle.id, habit)).status, 200);
  });

test("a new Circle needs a free name, a recurring Habit and members who exist", async () => {
  const { env, habit } = await team();

  const post = async (body: Json) =>
    (await send(circles.onRequestPost, env, "POST /api/circles", body)).status;

  assert.deepEqual(
    [
      await post({ name: "shockwave dragon boat 2026" }),
      await post({ name: "Team", habitId: "nope" }),
      await post({ name: "Team", memberIds: [999] }),
      await post({ name: "  " }),
      await post({ name: "Coworkers" }),
      await post({ name: "Rowing", habitId: habit }),
      (await send(circles.onRequestPost, env, "POST /api/circles/3", { name: "Other" })).status,
    ],
    [409, 400, 400, 400, 201, 201, 404],
  );
  assert.equal((await circleNamed(env, "Coworkers")).followsFrom, null);
});

test("only the owner reads or changes Circles", async () => {
  const { env, circle } = await team();

  assert.deepEqual(
    [
      (await sendAs(circles.onRequestGet, env, "GET /api/circles", { email: STRANGER })).status,
      (
        await sendAs(circles.onRequestPost, env, "POST /api/circles", {
          body: { name: "x" },
          email: STRANGER,
        })
      ).status,
      (
        await sendAs(circles.onRequestPatch, env, `PATCH /api/circles/${circle.id}`, {
          body: { habitId: null },
          email: STRANGER,
        })
      ).status,
      (await send(circles.onRequestGet, env, `GET /api/circles/${circle.id}`)).status,
    ],
    [403, 403, 403, 404],
  );
});
