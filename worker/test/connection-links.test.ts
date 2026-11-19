import assert from "node:assert/strict";
import {
  onRequestDelete,
  onRequestGet,
  onRequestPatch,
  onRequestPost,
} from "@worker/api/connections";
import type { Env, Json } from "@worker/lib/env";
import { apiRequest, makeEnv, OWNER } from "./helpers/env";

const URL_BASE = "https://journal.test/api/connections";

const call = (
  handler: typeof onRequestGet,
  env: Env,
  { method = "GET", id, body }: { method?: string; id?: number; body?: Json } = {},
) =>
  handler({
    env,
    params: id === undefined ? {} : { id: [String(id)] },
    request: apiRequest(method, id === undefined ? URL_BASE : `${URL_BASE}/${id}`, {
      email: OWNER,
      body,
    }),
  });

const create = async (env: Env, name: string): Promise<number> =>
  (await (await call(onRequestPost, env, { method: "POST", body: { name } })).json()).id;

const patch = (env: Env, id: number, body: Json) =>
  call(onRequestPatch, env, { method: "PATCH", id, body });

const detail = async (env: Env, id: number) =>
  (await (await call(onRequestGet, env, { id })).json()).item;

test("a yearly date may have no year", async () => {
  const env = makeEnv();
  const id = await create(env, "Sam");
  const dates = [{ label: "Birthday", date: "--11-20", yearly: true }];

  assert.equal((await patch(env, id, { dates })).status, 200);
  assert.deepEqual((await detail(env, id)).dates, dates);
});

test("dates list by month and day, with or without a year", async () => {
  const env = makeEnv();
  const id = await create(env, "Sam");

  await patch(env, id, {
    dates: [
      { label: "Anniversary", date: "2019-12-01", yearly: true },
      { label: "Birthday", date: "--11-20", yearly: true },
    ],
  });

  assert.deepEqual(
    (await detail(env, id)).dates.map((d: { label: string }) => d.label),
    ["Birthday", "Anniversary"],
  );
});

test("a link shows on both people's pages", async () => {
  const env = makeEnv();
  const raj = await create(env, "Raj");
  const cindy = await create(env, "Cindy");

  assert.equal((await patch(env, cindy, { links: [{ id: raj, label: "partner" }] })).status, 200);

  assert.deepEqual((await detail(env, cindy)).links, [{ id: raj, name: "Raj", label: "partner" }]);
  assert.deepEqual((await detail(env, raj)).links, [
    { id: cindy, name: "Cindy", label: "partner" },
  ]);
});

test("saving links replaces every link the person has, on either side", async () => {
  const env = makeEnv();
  const raj = await create(env, "Raj");
  const cindy = await create(env, "Cindy");
  const priya = await create(env, "Priya");

  await patch(env, raj, { links: [{ id: cindy, label: "partner" }] });
  await patch(env, cindy, { links: [{ id: priya, label: "sister" }] });

  assert.deepEqual((await detail(env, raj)).links, []);
  assert.deepEqual((await detail(env, priya)).links, [
    { id: cindy, name: "Cindy", label: "sister" },
  ]);
});

test("met through names who introduced us, and their page lists who they introduced", async () => {
  const env = makeEnv();
  const raj = await create(env, "Raj");
  const cindy = await create(env, "Cindy");

  await patch(env, cindy, { metThroughId: raj });

  assert.deepEqual((await detail(env, cindy)).metThrough, { id: raj, name: "Raj" });
  assert.deepEqual((await detail(env, raj)).introduced, [{ id: cindy, name: "Cindy" }]);

  await patch(env, cindy, { metThroughId: null });

  assert.equal((await detail(env, cindy)).metThrough, null);
});

test("the list carries links, met through and who each person introduced", async () => {
  const env = makeEnv();
  const raj = await create(env, "Raj");
  const cindy = await create(env, "Cindy");

  await patch(env, cindy, { metThroughId: raj, links: [{ id: raj, label: "partner" }] });
  const { connections } = await (await call(onRequestGet, env)).json();

  assert.deepEqual(
    connections.map(({ name, links, metThrough, introduced }: Record<string, Json>) => ({
      name,
      links,
      metThrough,
      introduced,
    })),
    [
      {
        name: "Cindy",
        links: [{ id: raj, name: "Raj", label: "partner" }],
        metThrough: { id: raj, name: "Raj" },
        introduced: [],
      },
      {
        name: "Raj",
        links: [{ id: cindy, name: "Cindy", label: "partner" }],
        metThrough: null,
        introduced: [{ id: cindy, name: "Cindy" }],
      },
    ],
  );
});

test("a create saves links and met through in one call", async () => {
  const env = makeEnv();
  const raj = await create(env, "Raj");

  const created = await call(onRequestPost, env, {
    method: "POST",
    body: { name: "Cindy", metThroughId: raj, links: [{ id: raj, label: "partner" }] },
  });

  const cindy = (await created.json()).id;

  assert.deepEqual((await detail(env, cindy)).metThrough, { id: raj, name: "Raj" });
  assert.deepEqual((await detail(env, raj)).links, [
    { id: cindy, name: "Cindy", label: "partner" },
  ]);
});

test("deleting a Connection removes its links and clears met through pointing at it", async () => {
  const env = makeEnv();
  const raj = await create(env, "Raj");
  const cindy = await create(env, "Cindy");

  await patch(env, cindy, { metThroughId: raj, links: [{ id: raj, label: "partner" }] });

  assert.equal((await call(onRequestDelete, env, { method: "DELETE", id: raj })).status, 204);
  const left = await detail(env, cindy);

  assert.deepEqual([left.links, left.metThrough], [[], null]);
});

const REJECTED: [string, (self: number, other: number) => Json][] = [
  [
    "a yearless one-off date",
    () => ({ dates: [{ label: "Party", date: "--11-20", yearly: false }] }),
  ],
  [
    "a yearless day that doesn't exist",
    () => ({ dates: [{ label: "Birthday", date: "--02-30", yearly: true }] }),
  ],
  ["a link to themselves", (self) => ({ links: [{ id: self, label: "me" }] })],
  ["a link to nobody", () => ({ links: [{ id: 999, label: "partner" }] })],
  [
    "two links to the same person",
    (_, other) => ({
      links: [
        { id: other, label: "partner" },
        { id: other, label: "wife" },
      ],
    }),
  ],
  ["a link with no label", (_, other) => ({ links: [{ id: other, label: " " }] })],
  ["met through themselves", (self) => ({ metThroughId: self })],
  ["met through nobody", () => ({ metThroughId: 999 })],
];

for (const [name, bodyOf] of REJECTED)
  test(`PATCH rejects ${name}`, async () => {
    const env = makeEnv();
    const self = await create(env, "Sam");
    const other = await create(env, "Priya");

    assert.equal((await patch(env, self, bodyOf(self, other))).status, 400);
  });
