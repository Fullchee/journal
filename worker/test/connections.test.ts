import assert from "node:assert/strict";
import {
  onRequestDelete,
  onRequestGet,
  onRequestPatch,
  onRequestPost,
  onRequestPut,
} from "@worker/api/connections";
import type { Env, Json } from "@worker/lib/env";
import {
  ConnectionsBody,
  bySoonest,
  meetupLabel,
  seeingToday,
  dueToReachOut,
  firstFollowUp,
  inDaysLabel,
  lastContactedLabel,
  nextOccurrence,
  planWith,
  upcomingDates,
} from "@/core";
import { makeConnection } from "@/core/__tests__/helpers/connection";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";

for (const [name, date, yearly, expected] of [
  ["a yearly date still ahead falls this year", "1990-11-10", true, "2026-11-10"],
  ["a yearly date already passed falls next year", "1990-03-12", true, "2027-03-12"],
  ["a yearly date on today is today", "1990-11-06", true, "2026-11-06"],
  ["a one-off date ahead keeps its day", "2027-06-05", false, "2027-06-05"],
  ["a one-off date that passed has no next day", "2026-01-01", false, null],
] as const)
  test(`nextOccurrence: ${name}`, () => {
    assert.equal(nextOccurrence({ label: "x", date, yearly }, "2026-11-06"), expected);
  });

test("upcomingDates lists dates inside the window, soonest first", () => {
  const people = [
    makeConnection({
      id: 1,
      name: "Sam",
      dates: [{ label: "Birthday", date: "1990-11-20", yearly: true }],
    }),
    makeConnection({
      id: 2,
      name: "Mom",
      dates: [{ label: "Surgery", date: "2026-11-08", yearly: false }],
    }),
    makeConnection({
      id: 3,
      name: "Priya",
      dates: [{ label: "Birthday", date: "1990-12-25", yearly: true }],
    }),
  ];

  assert.deepEqual(upcomingDates(people, "2026-11-06"), [
    { id: 2, name: "Mom", label: "Surgery", inDays: 2 },
    { id: 1, name: "Sam", label: "Birthday", inDays: 14 },
  ]);
});

test("bySoonest orders dates by their next day, passed one-offs last", () => {
  const dates = [
    { label: "Wedding", date: "2027-06-05", yearly: false },
    { label: "Graduation", date: "2026-05-01", yearly: false },
    { label: "Birthday", date: "1990-11-10", yearly: true },
  ];

  assert.deepEqual(
    bySoonest(dates, "2026-11-06").map((d) => d.label),
    ["Birthday", "Wedding", "Graduation"],
  );
});

test("inDaysLabel names today and tomorrow", () => {
  assert.deepEqual(
    [0, 1, 5].map((days) => inDaysLabel(days)),
    ["today", "tomorrow", "in 5 days"],
  );
});

const NOW = new Date("2026-11-06T12:00:00Z");

test("dueToReachOut suggests the most overdue people first, at most three", () => {
  const people = [
    makeConnection({ id: 1, cadenceDays: 7, lastContactedOn: "2026-10-30" }),
    makeConnection({ id: 2, cadenceDays: 7, lastContactedOn: "2026-10-16" }),
    makeConnection({ id: 3, cadenceDays: 30, lastContactedOn: null }),
    makeConnection({ id: 4, cadenceDays: 14, lastContactedOn: "2026-10-01" }),
    makeConnection({ id: 5, cadenceDays: 7, lastContactedOn: "2026-11-05" }),
    makeConnection({ id: 6, cadenceDays: null }),
  ];

  assert.deepEqual(
    dueToReachOut(people, NOW).map((c) => c.id),
    [2, 4, 1],
  );
});

// NOW is a Friday (weekday 5).
const DRAGON_BOAT = { label: "Dragon boat", days: [3, 5] };

test("seeingToday lists people with a meetup on today's weekday and what to ask them", () => {
  const people = [
    makeConnection({ id: 1, name: "Sam", meetups: [DRAGON_BOAT], followUps: "- race prep" }),
    makeConnection({ id: 2, name: "Mom", meetups: [{ label: "Dinner", days: [0] }] }),
  ];

  assert.deepEqual(seeingToday(people, NOW), [
    { id: 1, name: "Sam", label: "Dragon boat", followUp: "race prep" },
  ]);
});

test("dueToReachOut skips someone I'll see at a meetup today", () => {
  const overdue = makeConnection({ cadenceDays: 7, lastContactedOn: "2026-10-01" });

  assert.deepEqual(dueToReachOut([{ ...overdue, meetups: [DRAGON_BOAT] }], NOW), []);
});

test("meetupLabel names the weekdays, or just the label when irregular", () => {
  assert.equal(meetupLabel(DRAGON_BOAT), "Dragon boat · Wed, Fri");
  assert.equal(meetupLabel({ label: "Book club", days: [] }), "Book club");
});

test("meetupLabel adds the start time after the weekdays", () => {
  assert.equal(meetupLabel({ ...DRAGON_BOAT, time: "18:30" }), "Dragon boat · Wed, Fri at 6:30 PM");
});

test("an empty meetup time saves as no time", async () => {
  const env = makeEnv();
  const id = await create(env);

  const { item } = await (
    await call(onRequestPatch, env, {
      method: "PATCH",
      id,
      body: { meetups: [{ label: "Dragon boat", days: [3], time: "" }] },
    })
  ).json();

  assert.deepEqual(item.meetups, [{ label: "Dragon boat", days: [3] }]);
});

test("firstFollowUp takes the first item without its list marker", () => {
  assert.equal(
    firstFollowUp("\n- How the new job is going\n- Her dog"),
    "How the new job is going",
  );
});

test("lastContactedLabel counts calendar days", () => {
  assert.equal(lastContactedLabel(null, NOW), "Not yet");
  assert.equal(lastContactedLabel("2026-11-03", NOW), "3 days ago");
});

const URL_BASE = "https://x/api/connections";

const call = (
  handler: typeof onRequestGet,
  env: Env,
  {
    method = "GET",
    id,
    body,
    email = OWNER,
  }: { method?: string; id?: number; body?: Json; email?: string } = {},
) =>
  handler({
    env,
    params: id === undefined ? {} : { id: [String(id)] },
    request: apiRequest(method, id === undefined ? URL_BASE : `${URL_BASE}/${id}`, { email, body }),
  });

const create = async (env: Env, name = "Sam") =>
  (await (await call(onRequestPost, env, { method: "POST", body: { name } })).json()).id;

test("the owner adds a person with dates and follow-ups, and the list returns them", async () => {
  const env = makeEnv();
  const id = await create(env);
  const dates = [{ label: "Birthday", date: "1990-03-12", yearly: true }];

  const meetups = [
    { label: "Dragon boat", days: [3, 6], time: "18:30" },
    { label: "Book club", days: [] },
  ];

  const saved = await call(onRequestPatch, env, {
    method: "PATCH",
    id,
    body: {
      closeness: "close",
      circles: ["Shockwave dragon boat", "Coworkers"],
      cadenceDays: 14,
      followUps: "- new job",
      howWeMet: "Dragon boat, 2024",
      meetups,
      dates,
    },
  });

  assert.equal(saved.status, 200);
  const { connections } = await (await call(onRequestGet, env)).json();
  assert.deepEqual(connections, [
    {
      id,
      name: "Sam",
      closeness: "close",
      circles: ["Coworkers", "Shockwave dragon boat"],
      cadenceDays: 14,
      lastContactedOn: null,
      followUps: "- new job",
      howWeMet: "Dragon boat, 2024",
      metThrough: null,
      introduced: [],
      links: [],
      meetups,
      dates,
      growCloser: false,
      planCheckedAt: null,
      contactId: null,
    },
  ]);
});

test("saving Circles replaces their old ones, reusing a Circle whatever its case", async () => {
  const env = makeEnv();
  const sam = await create(env);
  const priya = await create(env, "Priya");

  const setCircles = (id: number, circles: string[]) =>
    call(onRequestPatch, env, { method: "PATCH", id, body: { circles } });

  await setCircles(sam, ["Coworkers", "Mahjong"]);
  await setCircles(priya, [" coworkers ", "Mahjong"]);
  await setCircles(sam, ["Shockwave dragon boat", "Coworkers"]);

  const { connections } = ConnectionsBody.parse(await (await call(onRequestGet, env)).json());
  const { results } = await env.DB.prepare("SELECT name FROM circles ORDER BY id").bind().all();

  assert.deepEqual(
    [connections.map((c) => c.circles), results],
    [
      [
        ["Coworkers", "Mahjong"],
        ["Coworkers", "Shockwave dragon boat"],
      ],
      [{ name: "Coworkers" }, { name: "Mahjong" }, { name: "Shockwave dragon boat" }],
    ],
  );
});

test("saving no Circles leaves them all", async () => {
  const env = makeEnv();
  const id = await create(env);
  await call(onRequestPatch, env, { method: "PATCH", id, body: { circles: ["Mahjong"] } });

  const saved = await call(onRequestPatch, env, { method: "PATCH", id, body: { circles: [] } });

  assert.deepEqual((await saved.json()).item.circles, []);
});

test("saving dates replaces the old ones", async () => {
  const env = makeEnv();
  const id = await create(env);

  const patchDates = (dates: Json) =>
    call(onRequestPatch, env, { method: "PATCH", id, body: { dates } });

  await patchDates([{ label: "Birthday", date: "1990-03-12", yearly: true }]);

  const { item } = await (
    await patchDates([{ label: "Wedding", date: "2027-06-05", yearly: false }])
  ).json();

  assert.deepEqual(item.dates, [{ label: "Wedding", date: "2027-06-05", yearly: false }]);
});

test("planWith picks the grow-closer person who has waited longest for a plan", () => {
  const people = [
    makeConnection({ id: 1, growCloser: true, planCheckedAt: "2026-10-20T12:00:00Z" }),
    makeConnection({ id: 2, growCloser: true, planCheckedAt: "2026-10-01T12:00:00Z" }),
    makeConnection({ id: 3, planCheckedAt: null }),
  ];

  assert.equal(planWith(people, NOW)?.id, 2);
});

test("planWith counts never asked as waiting longest", () => {
  const people = [
    makeConnection({ id: 1, growCloser: true, planCheckedAt: "2026-10-01T12:00:00Z" }),
    makeConnection({ id: 2, growCloser: true }),
  ];

  assert.equal(planWith(people, NOW)?.id, 2);
});

test("planWith waits a week after I answered", () => {
  const answered = makeConnection({ growCloser: true, planCheckedAt: "2026-11-01T12:00:00Z" });

  assert.equal(planWith([answered], NOW), null);
});

test("planWith skips someone I'll see at a meetup today", () => {
  const seeing = makeConnection({ growCloser: true, meetups: [DRAGON_BOAT] });

  assert.equal(planWith([seeing], NOW), null);
});

test("growCloser saves, and planChecked stamps when I answered", async () => {
  const env = makeEnv();
  const id = await create(env);

  const { item } = await (
    await call(onRequestPatch, env, {
      method: "PATCH",
      id,
      body: { growCloser: true, planChecked: true },
    })
  ).json();

  assert.equal(item.growCloser, true);
  assert.ok(Date.now() - Date.parse(item.planCheckedAt) < 60_000);
});

const REJECTED: [string, Json][] = [
  ["a grow-closer flag that isn't true or false", { growCloser: 1 }],
  ["the old reach-out stamp, now an Interaction", { contacted: true }],
  ["how we met over two lines", { howWeMet: "work\nthen climbing" }],
  ["the old note line, now an Interaction", { appendNote: "- **Nov 6:** hi" }],
  ["an unknown cadence", { cadenceDays: 3 }],
  ["family as a closeness", { closeness: "family" }],
  ["the old circle field", { circle: "close" }],
  ["a blank Circle name", { circles: [" "] }],
  ["an invalid date", { dates: [{ label: "Birthday", date: "1990-02-30", yearly: true }] }],
  ["an unknown field", { nickname: "S" }],
  ["a contact id over 200 characters", { contactId: "x".repeat(201) }],
  ["a weekday past Saturday", { meetups: [{ label: "Dragon boat", days: [7] }] }],
  ["a meetup with no label", { meetups: [{ label: " ", days: [3] }] }],
  [
    "a meetup time past midnight",
    { meetups: [{ label: "Dragon boat", days: [3], time: "24:00" }] },
  ],
  [
    "a month that doesn't exist",
    { dates: [{ label: "Birthday", date: "1990-13-01", yearly: true }] },
  ],
];

for (const [name, body] of REJECTED)
  test(`PATCH rejects ${name}`, async () => {
    const env = makeEnv();
    const id = await create(env);

    assert.equal((await call(onRequestPatch, env, { method: "PATCH", id, body })).status, 400);
  });

test("a create saves every field a PATCH takes in one call", async () => {
  const env = makeEnv();
  const dates = [{ label: "Birthday", date: "1990-03-12", yearly: true }];

  const created = await call(onRequestPost, env, {
    method: "POST",
    body: { name: "Priya", closeness: "friend", howWeMet: "Climbing gym", growCloser: true, dates },
  });

  const { item } = await (await call(onRequestGet, env, { id: (await created.json()).id })).json();

  assert.deepEqual(
    [created.status, item.closeness, item.howWeMet, item.growCloser, item.dates],
    [201, "friend", "Climbing gym", true, dates],
  );
});

test("a create saves a picked contact's id and birthday, and GET returns them", async () => {
  const env = makeEnv();
  const dates = [{ label: "Birthday", date: "2000-03-12", yearly: true }];

  const created = await call(onRequestPost, env, {
    method: "POST",
    body: { name: "Priya", dates, contactId: "0r1-2A3B" },
  });

  const { item } = await (await call(onRequestGet, env, { id: (await created.json()).id })).json();

  assert.deepEqual([item.contactId, item.dates], ["0r1-2A3B", dates]);
});

test("contactId: null unlinks the contact, and a PATCH without it keeps the link", async () => {
  const env = makeEnv();

  const { id } = await (
    await call(onRequestPost, env, { method: "POST", body: { name: "Priya", contactId: "42" } })
  ).json();

  const patch = async (body: Json) =>
    (await (await call(onRequestPatch, env, { method: "PATCH", id, body })).json()).item.contactId;

  assert.deepEqual(
    [await patch({ howWeMet: "Climbing gym" }), await patch({ contactId: null })],
    ["42", null],
  );
});

test("a create with an invalid field saves nobody", async () => {
  const env = makeEnv();

  const created = await call(onRequestPost, env, {
    method: "POST",
    body: { name: "Priya", closeness: "work" },
  });

  const { connections } = await (await call(onRequestGet, env)).json();

  assert.deepEqual([created.status, connections], [400, []]);
});

test("a second person with the same name is a conflict", async () => {
  const env = makeEnv();
  await create(env);

  assert.equal(
    (await call(onRequestPost, env, { method: "POST", body: { name: "Sam" } })).status,
    409,
  );
});

test("renaming a person to a taken name is a conflict", async () => {
  const env = makeEnv();
  await create(env);
  const priya = await create(env, "Priya");

  const renamed = await call(onRequestPatch, env, {
    method: "PATCH",
    id: priya,
    body: { name: "Sam" },
  });

  assert.equal(renamed.status, 409);
});

test("a PATCH, GET or DELETE of an unknown person is not found", async () => {
  const env = makeEnv();

  const statuses = await Promise.all([
    call(onRequestPatch, env, { method: "PATCH", id: 99, body: { growCloser: true } }),
    call(onRequestGet, env, { id: 99 }),
    call(onRequestDelete, env, { method: "DELETE", id: 99 }),
  ]);

  assert.deepEqual(
    statuses.map((res) => res.status),
    [404, 404, 404],
  );
});

test("an id that is not a number is not found", async () => {
  const res = await onRequestGet({
    env: makeEnv(),
    params: { id: ["abc"] },
    request: apiRequest("GET", `${URL_BASE}/abc`, { email: OWNER }),
  });

  assert.equal(res.status, 404);
});

test("a create refuses a stranger, a person id and a met-through pointer to nobody", async () => {
  const env = makeEnv();

  const statuses = await Promise.all([
    call(onRequestPost, env, { method: "POST", body: { name: "Sam" }, email: STRANGER }),
    onRequestPost({
      env,
      params: { id: ["1"] },
      request: apiRequest("POST", `${URL_BASE}/1`, { email: OWNER, body: { name: "Sam" } }),
    }),
    call(onRequestPost, env, { method: "POST", body: { name: "Sam", metThroughId: 99 } }),
  ]);

  assert.deepEqual(
    statuses.map((res) => res.status),
    [403, 404, 400],
  );
});

test("saving empty dates and links clears them", async () => {
  const env = makeEnv();
  const id = await create(env);
  const friend = await create(env, "Priya");

  await call(onRequestPatch, env, {
    method: "PATCH",
    id,
    body: {
      dates: [{ label: "Birthday", date: "1990-03-12", yearly: true }],
      links: [{ id: friend, label: "sister" }],
    },
  });

  const { item } = await (
    await call(onRequestPatch, env, { method: "PATCH", id, body: { dates: [], links: [] } })
  ).json();

  assert.deepEqual([item.dates, item.links], [[], []]);
});

test("strangers can't see Connections", async () => {
  assert.equal((await call(onRequestGet, makeEnv(), { email: STRANGER })).status, 403);
});

for (const [handler, method] of [
  [onRequestPatch, "PATCH"],
  [onRequestPut, "PUT"],
  [onRequestDelete, "DELETE"],
] as const) {
  test(`a stranger's ${method} on a person is forbidden`, async () => {
    const env = makeEnv();
    const id = await create(env);

    assert.equal((await call(handler, env, { method, id, email: STRANGER })).status, 403);
  });

  test(`a ${method} without a person id is not found`, async () => {
    assert.equal((await call(handler, makeEnv(), { method, body: { body: "x" } })).status, 404);
  });
}

test("the owner saves notes, and the detail carries them as a note body", async () => {
  const env = makeEnv();
  const id = await create(env);

  const { item } = await (
    await call(onRequestPut, env, { method: "PUT", id, body: { body: "Nov 6: new job is rough" } })
  ).json();

  assert.deepEqual([item.title, item.body], ["Sam", "Nov 6: new job is rough"]);
});

test("deleting a person removes them, their dates and their Circle memberships", async () => {
  const env = makeEnv();
  const id = await create(env);
  await call(onRequestPatch, env, {
    method: "PATCH",
    id,
    body: {
      dates: [{ label: "Birthday", date: "1990-03-12", yearly: true }],
      circles: ["Mahjong"],
    },
  });

  const deleted = await call(onRequestDelete, env, { method: "DELETE", id });

  const [dates, members] = await Promise.all(
    ["connection_dates", "connection_circles"].map(
      async (table) => (await env.DB.prepare(`SELECT 1 FROM ${table}`).bind().all()).results,
    ),
  );

  assert.deepEqual([deleted.status, dates, members], [204, [], []]);
});

const searchFor = async (env: Env, q: string, email = OWNER) =>
  onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", `${URL_BASE}?${new URLSearchParams({ q })}`, { email }),
  });

test("search finds people by their notes and shows the matching line", async () => {
  const env = makeEnv();
  const id = await create(env);
  await create(env, "Priya");
  await call(onRequestPut, env, {
    method: "PUT",
    id,
    body: { body: "Met at work.\n- **Nov 6:** talked about her MOVE to Ottawa" },
  });

  const { found } = await (await searchFor(env, "move")).json();

  assert.deepEqual(found, [{ id, name: "Sam", match: "Nov 6: talked about her MOVE to Ottawa" }]);
});

test("search finds people by a date label, with no matching line", async () => {
  const env = makeEnv();
  const id = await create(env);
  await call(onRequestPatch, env, {
    method: "PATCH",
    id,
    body: { dates: [{ label: "Anniversary", date: "2020-06-01", yearly: true }] },
  });

  const { found } = await (await searchFor(env, "annivers")).json();

  assert.deepEqual(found, [{ id, name: "Sam", match: "" }]);
});

test("search finds people by how we met and shows it", async () => {
  const env = makeEnv();
  const id = await create(env);
  await call(onRequestPatch, env, { method: "PATCH", id, body: { howWeMet: "Climbing gym" } });

  const { found } = await (await searchFor(env, "climbing")).json();

  assert.deepEqual(found, [{ id, name: "Sam", match: "Climbing gym" }]);
});

test("search treats % as plain text", async () => {
  const env = makeEnv();
  await create(env);

  const { found } = await (await searchFor(env, "%")).json();

  assert.deepEqual(found, []);
});

test("strangers can't search Connections", async () => {
  assert.equal((await searchFor(makeEnv(), "Sam", STRANGER)).status, 403);
});

test("search matches meetup labels, not their JSON keys", async () => {
  const env = makeEnv();
  const id = await create(env);
  await call(onRequestPatch, env, {
    method: "PATCH",
    id,
    body: { meetups: [{ label: "Dragon boat", days: [3], time: "18:30" }] },
  });

  const [byKey, byLabel] = await Promise.all(
    ["tim", "dragon"].map(async (q) => (await (await searchFor(env, q)).json()).found),
  );

  assert.deepEqual([byKey, byLabel], [[], [{ id, name: "Sam", match: "" }]]);
});

test("search finds people by a Circle's name, with no matching line", async () => {
  const env = makeEnv();
  const id = await create(env);
  await create(env, "Priya");
  await call(onRequestPatch, env, {
    method: "PATCH",
    id,
    body: { circles: ["Shockwave dragon boat"] },
  });

  const { found } = await (await searchFor(env, "shockwave")).json();

  assert.deepEqual(found, [{ id, name: "Sam", match: "" }]);
});
