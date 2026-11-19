import assert from "node:assert/strict";
import * as connections from "@worker/api/connections";
import * as interactions from "@worker/api/interactions";
import type { Env, Json } from "@worker/lib/env";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";

type Handler = typeof connections.onRequestGet;

interface Sent {
  path: string;
  method: string;
  body?: Json;
  email?: string;
}

const sendAs = (handler: Handler, env: Env, { path, method, body, email = OWNER }: Sent) => {
  const [, id] = /\/(\d+)$/.exec(path) ?? [];

  return handler({
    env,
    params: id === undefined ? {} : { id: [id] },
    request: apiRequest(method, `https://x${path}`, { email, body }),
  });
};

/** `request` is such as "PATCH /api/interactions/7". */
const send = (handler: Handler, env: Env, request: string, body?: Json) => {
  const [method = "GET", path = ""] = request.split(" ", 2);

  return sendAs(handler, env, { path, method, ...(body !== undefined && { body }) });
};

const addPerson = async (env: Env, name: string): Promise<number> =>
  (await (await send(connections.onRequestPost, env, "POST /api/connections", { name })).json()).id;

const log = (env: Env, body: Json, email = OWNER) =>
  sendAs(interactions.onRequestPost, env, {
    path: "/api/interactions",
    method: "POST",
    body,
    email,
  });

const logged = async (env: Env, body: Json): Promise<number> =>
  (await (await log(env, body)).json()).id;

const detail = async (env: Env, id: number) =>
  (await (await send(connections.onRequestGet, env, `GET /api/connections/${id}`)).json()).item;

const lastContacted = async (env: Env) =>
  Object.fromEntries(
    (
      await (await send(connections.onRequestGet, env, "GET /api/connections")).json()
    ).connections.map((c: { name: string; lastContactedOn: string | null }) => [
      c.name,
      c.lastContactedOn,
    ]),
  );

async function twoPeople() {
  const env = makeEnv();

  return { env, sam: await addPerson(env, "Sam"), ana: await addPerson(env, "Ana") };
}

test("one Interaction with two people shows on both Connection pages and updates both last contacted days", async () => {
  const { env, sam, ana } = await twoPeople();

  const created = await log(env, {
    day: "2026-11-06",
    kind: "in-person",
    note: "Mahjong",
    minutes: 120,
    connectionIds: [sam, ana],
  });

  assert.equal(created.status, 201);

  const expected = {
    day: "2026-11-06",
    kind: "in-person",
    note: "Mahjong",
    minutes: 120,
    circle: null,
    connections: [
      { id: ana, name: "Ana" },
      { id: sam, name: "Sam" },
    ],
  };

  for (const id of [sam, ana]) {
    const [shown] = (await detail(env, id)).interactions;

    assert.deepEqual({ ...shown, id: undefined }, { ...expected, id: undefined });
  }

  assert.deepEqual(await lastContacted(env), { Ana: "2026-11-06", Sam: "2026-11-06" });
});

test("a Connection page lists its Interactions newest first", async () => {
  const { env, sam } = await twoPeople();

  for (const day of ["2026-11-01", "2026-11-06", "2026-10-20"])
    await logged(env, { day, kind: "message", connectionIds: [sam] });

  assert.deepEqual(
    (await detail(env, sam)).interactions.map((i: { day: string; note: string }) => [
      i.day,
      i.note,
    ]),
    [
      ["2026-11-06", ""],
      ["2026-11-01", ""],
      ["2026-10-20", ""],
    ],
  );
});

test("deleting the newest Interaction moves last contacted back to the previous one", async () => {
  const { env, sam } = await twoPeople();
  await logged(env, { day: "2026-11-01", kind: "call", connectionIds: [sam] });
  const newest = await logged(env, { day: "2026-11-06", kind: "message", connectionIds: [sam] });

  const deleted = await send(
    interactions.onRequestDelete,
    env,
    `DELETE /api/interactions/${newest}`,
  );

  assert.equal(deleted.status, 204);
  assert.deepEqual(await lastContacted(env), { Ana: null, Sam: "2026-11-01" });
});

test("editing an Interaction saves its day, kind, note and minutes", async () => {
  const { env, sam } = await twoPeople();

  const id = await logged(env, {
    day: "2026-11-06",
    kind: "message",
    note: "hi",
    connectionIds: [sam],
  });

  const edited = await send(interactions.onRequestPatch, env, `PATCH /api/interactions/${id}`, {
    day: "2026-11-05",
    kind: "in-person",
    note: "coffee",
    minutes: 45,
  });

  assert.equal(edited.status, 200);
  const [shown] = (await detail(env, sam)).interactions;
  assert.deepEqual(shown, {
    id,
    day: "2026-11-05",
    kind: "in-person",
    note: "coffee",
    minutes: 45,
    circle: null,
    connections: [{ id: sam, name: "Sam" }],
  });
});

test("an edit can change who was there", async () => {
  const { env, sam, ana } = await twoPeople();
  const id = await logged(env, { day: "2026-11-06", kind: "call", connectionIds: [sam] });

  await send(interactions.onRequestPatch, env, `PATCH /api/interactions/${id}`, {
    connectionIds: [ana],
  });

  assert.deepEqual(await lastContacted(env), { Ana: "2026-11-06", Sam: null });
});

for (const [name, body] of [
  ["minutes on a call", { day: "2026-11-06", kind: "call", minutes: 30, connectionIds: [1] }],
  ["no people", { day: "2026-11-06", kind: "call", connectionIds: [] }],
  ["an unknown kind", { day: "2026-11-06", kind: "email", connectionIds: [1] }],
  ["a day that doesn't exist", { day: "2026-02-30", kind: "call", connectionIds: [1] }],
  ["a two-line note", { day: "2026-11-06", kind: "call", note: "a\nb", connectionIds: [1] }],
] satisfies [string, Json][])
  test(`logging an Interaction rejects ${name}`, async () => {
    const { env } = await twoPeople();

    assert.equal((await log(env, body)).status, 400);
  });

test("an edit that leaves minutes on a call is rejected", async () => {
  const { env, sam } = await twoPeople();

  const id = await logged(env, {
    day: "2026-11-06",
    kind: "in-person",
    minutes: 60,
    connectionIds: [sam],
  });

  const edited = await send(interactions.onRequestPatch, env, `PATCH /api/interactions/${id}`, {
    kind: "call",
  });

  assert.equal(edited.status, 400);
});

test("logging an Interaction with someone unknown is not found and saves nothing", async () => {
  const { env, sam } = await twoPeople();

  assert.equal(
    (await log(env, { day: "2026-11-06", kind: "call", connectionIds: [sam, 99] })).status,
    404,
  );
  assert.deepEqual(await lastContacted(env), { Ana: null, Sam: null });
});

test("a replayed reach-out with the same requestId logs one Interaction", async () => {
  const { env, sam } = await twoPeople();

  const body = {
    day: "2026-11-06",
    kind: "message",
    connectionIds: [sam],
    requestId: "6f1c2e0a-8b4d-4f7e-a1c3-9d2e5b7f0a41",
  };

  await log(env, body);
  const replay = await log(env, body);

  assert.equal(replay.status, 200);
  assert.equal((await detail(env, sam)).interactions.length, 1);
});

test("editing or deleting an Interaction that doesn't exist is not found", async () => {
  const env = makeEnv();

  assert.equal(
    (await send(interactions.onRequestPatch, env, "PATCH /api/interactions/9", { note: "x" }))
      .status,
    404,
  );
  assert.equal(
    (await send(interactions.onRequestDelete, env, "DELETE /api/interactions/9")).status,
    404,
  );
  assert.equal(
    (await send(interactions.onRequestDelete, env, "DELETE /api/interactions")).status,
    404,
  );
  assert.equal(
    (await send(interactions.onRequestPost, env, "POST /api/interactions/9", {})).status,
    404,
  );
});

test("an empty edit is rejected", async () => {
  const { env, sam } = await twoPeople();
  const id = await logged(env, { day: "2026-11-06", kind: "call", connectionIds: [sam] });

  assert.equal(
    (await send(interactions.onRequestPatch, env, `PATCH /api/interactions/${id}`, {})).status,
    400,
  );
});

test("strangers can't log Interactions", async () => {
  const { env, sam } = await twoPeople();

  assert.equal(
    (await log(env, { day: "2026-11-06", kind: "call", connectionIds: [sam] }, STRANGER)).status,
    403,
  );
});

test("search finds people by an Interaction's note and shows it", async () => {
  const { env, sam, ana } = await twoPeople();
  await logged(env, {
    day: "2026-11-06",
    kind: "call",
    note: "Went to Taiwan",
    connectionIds: [sam, ana],
  });

  const { found } = await (
    await send(connections.onRequestGet, env, "GET /api/connections?q=taiwan")
  ).json();

  assert.deepEqual(found, [
    { id: ana, name: "Ana", match: "Went to Taiwan" },
    { id: sam, name: "Sam", match: "Went to Taiwan" },
  ]);
});

test("deleting a person drops the Interactions only they were in and keeps shared ones", async () => {
  const { env, sam, ana } = await twoPeople();
  const samOnly = await logged(env, { day: "2026-11-01", kind: "call", connectionIds: [sam] });
  await logged(env, { day: "2026-11-06", kind: "in-person", connectionIds: [sam, ana] });

  await send(connections.onRequestDelete, env, `DELETE /api/connections/${sam}`);

  const shown = (await detail(env, ana)).interactions;
  assert.deepEqual(
    shown.map((i: { day: string; connections: Json }) => [i.day, i.connections]),
    [["2026-11-06", [{ id: ana, name: "Ana" }]]],
  );
  assert.equal(
    (
      await send(interactions.onRequestPatch, env, `PATCH /api/interactions/${samOnly}`, {
        note: "x",
      })
    ).status,
    404,
  );
});

test("a follow-up goes on its own line after each person's follow-ups", async () => {
  const { env, sam, ana } = await twoPeople();

  await send(connections.onRequestPatch, env, `PATCH /api/connections/${sam}`, {
    followUps: "- Her new job\n",
  });

  const created = await log(env, {
    day: "2026-11-06",
    kind: "message",
    connectionIds: [sam, ana],
    followUp: " Ask about the Taiwan photos ",
  });

  assert.equal(created.status, 201);
  assert.equal((await detail(env, sam)).followUps, "- Her new job\n- Ask about the Taiwan photos");
  assert.equal((await detail(env, ana)).followUps, "- Ask about the Taiwan photos");
});

test("a blank follow-up leaves follow-ups alone, and a multi-line one is refused", async () => {
  const { env, sam } = await twoPeople();

  await log(env, { day: "2026-11-06", kind: "call", connectionIds: [sam], followUp: "  " });
  assert.equal((await detail(env, sam)).followUps, "");

  const refused = await log(env, {
    day: "2026-11-06",
    kind: "call",
    connectionIds: [sam],
    followUp: "a\nb",
  });

  assert.equal(refused.status, 400);
});

test("an edit that points at someone unknown is not found", async () => {
  const { env, sam } = await twoPeople();
  const id = await logged(env, { day: "2026-11-06", kind: "call", connectionIds: [sam] });

  const edited = await send(interactions.onRequestPatch, env, `PATCH /api/interactions/${id}`, {
    connectionIds: [99],
  });

  assert.equal(edited.status, 404);
});

test("a stranger, a missing id and an id that is not a number are refused on every write", async () => {
  const env = makeEnv();

  for (const handler of [interactions.onRequestPatch, interactions.onRequestDelete]) {
    const method = handler === interactions.onRequestPatch ? "PATCH" : "DELETE";

    const results = await Promise.all([
      sendAs(handler, env, { path: "/api/interactions/1", method, email: STRANGER, body: {} }),
      sendAs(handler, env, { path: "/api/interactions", method, body: {} }),
      handler({
        env,
        params: { id: ["abc"] },
        request: apiRequest(method, "https://x/api/interactions/abc", { email: OWNER, body: {} }),
      }),
    ]);

    assert.deepEqual(
      results.map((res) => res.status),
      [403, 404, 404],
    );
  }
});
