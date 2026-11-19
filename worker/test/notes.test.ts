import assert from "node:assert/strict";
import {
  onRequestDelete,
  onRequestGet,
  onRequestPatch,
  onRequestPost,
  onRequestPut,
} from "@worker/api/notes";
import { MAX_BODY_BYTES } from "@worker/lib/note-body";
import type { Env, SqlValue } from "@worker/lib/env";
import { apiRequest, makeEnv, OWNER, type RequestBody } from "./helpers/env";

const STRANGER = "stranger@example.com";

const seed = (env: Env, sql: string, ...args: SqlValue[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();

type Handler = typeof onRequestGet;

interface Item {
  id: number;
  title: string;
}

const params = (type: string, id?: number | string) =>
  id === undefined ? { type } : { type, id: [String(id)] };

// eslint-disable-next-line max-params -- a test helper mirrors the handler call it wraps; grouping its arguments only adds noise
const call = (
  handler: Handler,
  env: Env,
  email: string | null,
  type: string,
  id?: number | string,
  body?: RequestBody,
) =>
  handler({
    env,
    params: params(type, id),
    request: apiRequest(handler === onRequestPut ? "PUT" : "GET", "https://x/api/notes", {
      email,
      body,
    }),
  });

const get = (env: Env, email: string | null, type: string, id?: number | string) =>
  call(onRequestGet, env, email, type, id);

// eslint-disable-next-line max-params -- a test helper mirrors the handler call it wraps; grouping its arguments only adds noise
const put = (
  env: Env,
  email: string | null,
  type: string,
  id: number | string | undefined,
  body: RequestBody,
) => call(onRequestPut, env, email, type, id, body);

const TYPES: [string, string, string, string][] = [
  ["goals", "INSERT INTO goals (title, body) VALUES ('Rest', 'Rest well')", "Rest", "active"],
  [
    "reflections",
    "INSERT INTO reflections (period_kind, period, body) VALUES ('week', '2026-W42', 'A calm week')",
    "2026-W42",
    "week",
  ],
];

for (const [type, insert, title, detail] of TYPES) {
  test(`${type}: list shows title and detail without bodies`, async () => {
    const env = makeEnv();
    await seed(env, insert);
    const { items } = await (await get(env, OWNER, type)).json();
    const own = items.find((i: Item) => i.title === title);
    assert.equal(own.detail, detail);
    assert.equal("body" in own, false);
  });

  test(`${type}: detail returns the body`, async () => {
    const env = makeEnv();
    await seed(env, insert);
    const { items } = await (await get(env, OWNER, type)).json();

    const { item } = await (
      await get(env, OWNER, type, items.find((i: Item) => i.title === title).id)
    ).json();

    assert.equal(item.title, title);
    assert.ok(item.body.length > 0);
  });

  test(`${type}: the owner edits the body and updated_at moves`, async () => {
    const env = makeEnv();
    await seed(env, insert);
    const { items } = await (await get(env, OWNER, type)).json();
    const id = items.find((i: Item) => i.title === title).id;
    await seed(env, `UPDATE ${type} SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`, id);
    const res = await put(env, OWNER, type, id, { body: "# New\n\ntext" });
    assert.equal(res.status, 200);
    const { item } = await res.json();
    assert.equal(item.body, "# New\n\ntext");
    assert.notEqual(item.updatedAt, "2000-01-01T00:00:00.000Z");
    assert.equal((await (await get(env, OWNER, type, id)).json()).item.body, "# New\n\ntext");
  });

  test(`${type}: a non-owner can neither read nor write`, async () => {
    const env = makeEnv();
    await seed(env, insert);
    const { items } = await (await get(env, OWNER, type)).json();
    const id = items.find((i: Item) => i.title === title).id;
    assert.equal((await get(env, STRANGER, type, id)).status, 403);
    assert.equal((await put(env, STRANGER, type, id, { body: "hacked" })).status, 403);
    assert.notEqual((await (await get(env, OWNER, type, id)).json()).item.body, "hacked");
  });
}

test("lists order reflections newest first", async () => {
  const env = makeEnv();
  await seed(
    env,
    "INSERT INTO reflections (period_kind, period) VALUES ('week', '2026-W01'), ('week', '2026-W10')",
  );

  const reflections = (await (await get(env, OWNER, "reflections")).json()).items.map(
    (i: Item) => i.title,
  );

  assert.deepEqual(reflections, ["2026-W10", "2026-W01"]);
});

test("an unknown type is not found, including inherited object keys", async () => {
  const env = makeEnv();

  for (const type of ["nope", "constructor", "__proto__"])
    assert.equal((await get(env, OWNER, type)).status, 404);
});

test("a missing or malformed id is not found", async () => {
  const env = makeEnv();
  assert.equal((await get(env, OWNER, "goals", 9999)).status, 404);
  assert.equal((await get(env, OWNER, "goals", "1 OR 1=1")).status, 404);
  assert.equal((await put(env, OWNER, "goals", 9999, { body: "x" })).status, 404);
});

test("PUT needs an id", async () => {
  assert.equal((await put(makeEnv(), OWNER, "goals", undefined, { body: "x" })).status, 404);
});

test("requests without the Access header are rejected", async () => {
  const env = makeEnv();
  assert.equal((await get(env, null, "goals")).status, 401);
  assert.equal((await put(env, null, "goals", 1, { body: "x" })).status, 401);
});

const invalid: [string, RequestBody, number][] = [
  ["a missing body", {}, 400],
  ["a non-string body", { body: 5 }, 400],
  ["a body that is not JSON", "not json", 400],
  ["a JSON null body", "null", 400],
  ["a body over the byte limit", { body: "é".repeat(MAX_BODY_BYTES / 2 + 1) }, 413],
];

for (const [name, body, status] of invalid) {
  test(`PUT rejects ${name} and keeps the old body`, async () => {
    const env = makeEnv();
    await seed(env, "INSERT INTO goals (title, body) VALUES ('Keep', 'original')");

    const id = (await (await get(env, OWNER, "goals")).json()).items.find(
      (i: Item) => i.title === "Keep",
    ).id;

    assert.equal((await put(env, OWNER, "goals", id, body)).status, status);
    assert.equal((await (await get(env, OWNER, "goals", id)).json()).item.body, "original");
  });
}

test("an empty body is allowed so a note can be cleared", async () => {
  const env = makeEnv();
  await seed(env, "INSERT INTO goals (title, body) VALUES ('Clear', 'text')");

  const id = (await (await get(env, OWNER, "goals")).json()).items.find(
    (i: Item) => i.title === "Clear",
  ).id;

  assert.equal((await put(env, OWNER, "goals", id, { body: "" })).status, 200);
});

// eslint-disable-next-line max-params -- a test helper mirrors the handler call it wraps; grouping its arguments only adds noise
const send = (
  handler: Handler,
  env: Env,
  email: string,
  method: string,
  id: number | undefined,
  body: RequestBody,
) =>
  handler({
    env,
    params: params("goals", id),
    request: apiRequest(method, "https://x/api/notes/goals", { email, body }),
  });

test("the owner creates a goal and reads it back with its why", async () => {
  const env = makeEnv();

  const res = await send(onRequestPost, env, OWNER, "POST", undefined, {
    title: " Rest ",
    why: "Burnout",
  });

  assert.equal(res.status, 201);
  const { id } = await res.json();
  const { item } = await (await get(env, OWNER, "goals", id)).json();

  assert.deepEqual([item.title, item.why, item.detail], ["Rest", "Burnout", "active"]);
});

test("editing a goal changes title, why and state but keeps the body", async () => {
  const env = makeEnv();
  await seed(env, "INSERT INTO goals (title, body) VALUES ('Rest', 'notes')");
  const { items } = await (await get(env, OWNER, "goals")).json();

  const res = await send(
    onRequestPatch,
    env,
    OWNER,
    "PATCH",
    items.find((i: Item) => i.title === "Rest").id,
    {
      title: "Sleep",
      why: "Energy",
      state: "retired",
    },
  );

  const { item } = await res.json();

  assert.deepEqual(
    [item.title, item.why, item.detail, item.body],
    ["Sleep", "Energy", "retired", "notes"],
  );
});

test("goal writes reject a bad state, blank title, duplicate title and non-goal types", async () => {
  const env = makeEnv();
  await seed(env, "INSERT INTO goals (title) VALUES ('Rest'), ('Play')");
  const { items } = await (await get(env, OWNER, "goals")).json();
  const rest = items.find((i: Item) => i.title === "Rest").id;

  assert.equal(
    (await send(onRequestPost, env, OWNER, "POST", undefined, { title: "X", state: "done" }))
      .status,
    400,
  );
  assert.equal(
    (await send(onRequestPost, env, OWNER, "POST", undefined, { title: "  " })).status,
    400,
  );
  assert.equal(
    (await send(onRequestPost, env, OWNER, "POST", undefined, { title: "Play" })).status,
    409,
  );
  assert.equal(
    (await send(onRequestPatch, env, OWNER, "PATCH", rest, { title: "Play" })).status,
    409,
  );
  assert.equal((await send(onRequestPatch, env, OWNER, "PATCH", 9999, { title: "Z" })).status, 404);
  assert.equal(
    (await send(onRequestPost, env, "stranger@example.com", "POST", undefined, { title: "Z" }))
      .status,
    403,
  );

  const patchReflection = await onRequestPatch({
    env,
    params: params("reflections", 1),
    request: apiRequest("PATCH", "https://x", { email: OWNER, body: { title: "Z" } }),
  });

  assert.equal(patchReflection.status, 404);
});

const post = (env: Env, type: string, body: RequestBody, email = OWNER) =>
  onRequestPost({
    env,
    params: params(type),
    request: apiRequest("POST", "https://x/api/notes", { email, body }),
  });

const remove = (env: Env, type: string, id: number | string | undefined, email = OWNER) =>
  onRequestDelete({
    env,
    params: params(type, id),
    request: apiRequest("DELETE", "https://x/api/notes", { email }),
  });

test("the owner creates a reflection and a health record with bodies", async () => {
  const env = makeEnv();

  const reflection = await post(env, "reflections", {
    periodKind: "week",
    period: " 2026-W45 ",
    body: "Calm",
  });

  const record = await post(env, "health-records", { title: "Sleep study", body: "Booked" });

  assert.deepEqual([reflection.status, record.status], [201, 201]);
  const r = (await get(env, OWNER, "reflections", (await reflection.json()).id)).json();
  const c = (await get(env, OWNER, "health-records", (await record.json()).id)).json();
  const [{ item: ri }, { item: ci }] = await Promise.all([r, c]);

  assert.deepEqual([ri.title, ri.detail, ri.body], ["2026-W45", "week", "Calm"]);
  assert.deepEqual([ci.title, ci.body], ["Sleep study", "Booked"]);
});

const badCreates: [string, string, RequestBody, number][] = [
  ["reflections", "an unknown period kind", { periodKind: "day", period: "2026-11-06" }, 400],
  ["reflections", "a blank period", { periodKind: "week", period: " " }, 400],
  ["reflections", "a duplicate period", { periodKind: "week", period: "2026-W42" }, 409],
  ["health-records", "a missing title", { body: "x" }, 400],
  ["health-records", "a non-string body", { title: "X", body: 5 }, 400],
  ["health-records", "an oversized body", { title: "X", body: "é".repeat(MAX_BODY_BYTES) }, 400],
];

for (const [type, name, body, status] of badCreates) {
  test(`${type} POST rejects ${name}`, async () => {
    const env = makeEnv();
    await seed(env, "INSERT INTO reflections (period_kind, period) VALUES ('week', '2026-W42')");

    const res = await post(env, type, body);

    assert.equal(res.status, status);
  });
}

test("POST to a note id is not found", async () => {
  const res = await onRequestPost({
    env: makeEnv(),
    params: params("health-records", 1),
    request: apiRequest("POST", "https://x", { email: OWNER, body: { title: "X" } }),
  });

  assert.equal(res.status, 404);
});

test("a non-owner cannot create or delete notes", async () => {
  const env = makeEnv();
  await seed(env, "INSERT INTO health_records (id, title) VALUES (1, 'Keep')");

  assert.equal((await post(env, "health-records", { title: "X" }, STRANGER)).status, 403);
  assert.equal((await remove(env, "health-records", 1, STRANGER)).status, 403);
  assert.equal((await get(env, OWNER, "health-records", 1)).status, 200);
});

const DELETABLE: [string, string][] = [
  [
    "reflections",
    "INSERT INTO reflections (id, period_kind, period) VALUES (7, 'week', '2026-W01')",
  ],
  ["health-records", "INSERT INTO health_records (id, title) VALUES (7, 'Old')"],
  ["goals", "INSERT INTO goals (id, title) VALUES (7, 'Old')"],
];

for (const [type, insert] of DELETABLE) {
  test(`${type}: the owner deletes a note, then it is not found`, async () => {
    const env = makeEnv();
    await seed(env, insert);

    assert.equal((await remove(env, type, 7)).status, 204);
    assert.equal((await get(env, OWNER, type, 7)).status, 404);
    assert.equal((await remove(env, type, 7)).status, 404);
  });
}

test("deleting a goal drops its Habit links", async () => {
  const env = makeEnv();
  await seed(env, "INSERT INTO goals (id, title) VALUES (7, 'Old')");
  await seed(env, "INSERT INTO habits (id, name) VALUES ('walk', 'Walk')");
  await seed(env, "INSERT INTO goal_habits (goal_id, habit_id) VALUES (7, 'walk')");

  await remove(env, "goals", 7);
  const { results } = await env.DB.prepare("SELECT * FROM goal_habits").bind().all();

  assert.deepEqual(results, []);
});

test("DELETE needs a known type and an id", async () => {
  const env = makeEnv();
  assert.equal((await remove(env, "goals", undefined)).status, 404);
  assert.equal((await remove(env, "nope", 1)).status, 404);
});

// The test seed holds three Goals; these tests number their own.
const withoutGoals = async () => {
  const env = makeEnv();
  await seed(env, "DELETE FROM goals");

  return env;
};

const patchGoal = (env: Env, id: number, body: RequestBody) =>
  send(onRequestPatch, env, OWNER, "PATCH", id, body);

test("a goal created under a parent lists and reads back its parentId", async () => {
  const env = await withoutGoals();
  await seed(env, "INSERT INTO goals (id, title) VALUES (1, 'Be healthy')");

  const res = await send(onRequestPost, env, OWNER, "POST", undefined, {
    title: "Sleep well",
    parentId: 1,
  });

  assert.equal(res.status, 201);
  const { id } = await res.json();
  const { items } = await (await get(env, OWNER, "goals")).json();

  assert.deepEqual(
    items.map(({ title, parentId }: Item & { parentId: number | null }) => [title, parentId]),
    [
      ["Be healthy", null],
      ["Sleep well", 1],
    ],
  );
  assert.equal((await (await get(env, OWNER, "goals", id)).json()).item.parentId, 1);
});

test("editing a goal moves it under another and back to the top level", async () => {
  const env = await withoutGoals();
  await seed(env, "INSERT INTO goals (id, title) VALUES (1, 'Be healthy'), (2, 'Sleep well')");

  const moved = await (await patchGoal(env, 2, { title: "Sleep well", parentId: 1 })).json();
  const top = await (await patchGoal(env, 2, { title: "Sleep well", parentId: null })).json();

  assert.deepEqual([moved.item.parentId, top.item.parentId], [1, null]);
});

test("editing a goal without a parentId keeps its parent", async () => {
  const env = await withoutGoals();
  await seed(
    env,
    "INSERT INTO goals (id, title, parent_id) VALUES (1, 'Be healthy', NULL), (2, 'Sleep well', 1)",
  );

  const res = await patchGoal(env, 2, { title: "Sleep deeply", why: "", state: "active" });

  assert.equal(res.status, 200);
  assert.deepEqual((({ title, parentId }) => [title, parentId])((await res.json()).item), [
    "Sleep deeply",
    1,
  ]);
});

test("a goal cannot serve a missing goal, itself or one of its descendants", async () => {
  const env = await withoutGoals();
  await seed(
    env,
    "INSERT INTO goals (id, title, parent_id) VALUES (1, 'Be healthy', NULL), (2, 'Sleep well', 1), (3, 'Wind down', 2)",
  );

  for (const parentId of [9999, 1, 2, 3]) {
    const res = await patchGoal(env, 1, { title: "Be healthy", parentId });

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid parent" });
  }

  assert.equal(
    (await send(onRequestPost, env, OWNER, "POST", undefined, { title: "X", parentId: 9999 }))
      .status,
    400,
  );
  assert.equal((await (await get(env, OWNER, "goals", 1)).json()).item.parentId, null);
});

test("a goal still moves while an older cycle sits elsewhere in the tree", async () => {
  const env = await withoutGoals();
  await seed(
    env,
    "INSERT INTO goals (id, title, parent_id) VALUES (1, 'A', NULL), (2, 'B', NULL), (3, 'C', NULL)",
  );
  await seed(env, "UPDATE goals SET parent_id = 2 WHERE id = 1");
  await seed(env, "UPDATE goals SET parent_id = 1 WHERE id = 2");

  assert.equal((await patchGoal(env, 3, { title: "C", parentId: 1 })).status, 200);
});

test("deleting a parent goal makes its children top-level", async () => {
  const env = await withoutGoals();
  await seed(
    env,
    "INSERT INTO goals (id, title, parent_id) VALUES (1, 'Be healthy', NULL), (2, 'Sleep well', 1)",
  );

  assert.equal((await remove(env, "goals", 1)).status, 204);
  assert.equal((await (await get(env, OWNER, "goals", 2)).json()).item.parentId, null);
});

test("a second Weekly retro for the same week is a 409 and leaves the saved one as it was", async () => {
  const env = makeEnv();
  const week = { periodKind: "week", period: "2026-W45" };

  const first = await post(env, "reflections", { ...week, body: "Saved first" });
  const second = await post(env, "reflections", { ...week, body: "Would overwrite" });

  assert.deepEqual([first.status, second.status], [201, 409]);
  const { item } = await (await get(env, OWNER, "reflections", (await first.json()).id)).json();

  assert.equal(item.body, "Saved first");
});

/** Lists `type` with `query` from a database holding a growth week and two work weeks. */
async function listUrl(type: string, query: string) {
  const env = makeEnv();
  await seed(
    env,
    "INSERT INTO reflections (track, period_kind, period) VALUES ('growth', 'week', '2026-W45'), ('work', 'week', '2026-W45'), ('work', 'week', '2026-W44')",
  );

  return onRequestGet({
    env,
    params: params(type),
    request: apiRequest("GET", `https://x/api/notes/${type}${query}`, { email: OWNER }),
  });
}

const tracksListed = async (query: string) =>
  (await (await listUrl("reflections", query)).json()).items.map((i: Item) => i.title);

test("the reflections list shows only the growth track unless asked for work", async () => {
  assert.deepEqual(await tracksListed(""), ["2026-W45"]);
  assert.deepEqual(await tracksListed("?track=growth"), ["2026-W45"]);
  assert.deepEqual(await tracksListed("?track=work"), ["2026-W45", "2026-W44"]);
});

test("a list with an unknown track is a 400", async () => {
  assert.equal((await listUrl("reflections", "?track=coaching")).status, 400);
});

test("other note lists ignore the track", async () => {
  assert.equal((await listUrl("goals", "?track=work")).status, 200);
});

test("a work reflection sits beside the growth one for the same week", async () => {
  const env = makeEnv();
  const week = { periodKind: "week", period: "2026-W45" };

  const [growth, work, again] = [
    await post(env, "reflections", { ...week, body: "Calm" }),
    await post(env, "reflections", { ...week, track: "work", body: "Shipped" }),
    await post(env, "reflections", { ...week, track: "work" }),
  ];

  assert.deepEqual([growth.status, work.status, again.status], [201, 201, 409]);
  const { item } = await (await get(env, OWNER, "reflections", (await work.json()).id)).json();

  assert.deepEqual([item.title, item.track, item.body], ["2026-W45", "work", "Shipped"]);
});

test("an unknown reflection track is a 400", async () => {
  const res = await post(makeEnv(), "reflections", {
    periodKind: "week",
    period: "2026-W45",
    track: "coaching",
  });

  assert.equal(res.status, 400);
});
