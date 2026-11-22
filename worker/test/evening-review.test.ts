import assert from "node:assert/strict";
import { MISSED } from "@/core";
import * as calendarLinks from "@worker/api/calendar-links";
import * as eveningReview from "@worker/api/evening-review";
import { onRequestPost as postHabits } from "@worker/api/habits";
import type { Env, Json } from "@worker/lib/env";
import { EVENING_REVIEW_CRON } from "@worker/lib/crons";
import worker from "@worker/index";
import { makeD1 } from "./helpers/d1";
import { apiRequest, makeEnv, OWNER } from "./helpers/env";
import { urlOf } from "./helpers/fetch";
import { readJson } from "./helpers/json";

const DAY = "2026-11-12";

const accessFetch = fetch;
let items: Json[] = [];
let calendarDown = false;
let calendarCalls = 0;

// Google answers from `items`; Access certs still come from the helper.
jest
  .spyOn(globalThis, "fetch")
  .mockImplementation(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = urlOf(input);

    if (!url.includes("googleapis.com")) return accessFetch(url, init);

    if (url.includes("/token")) return Response.json({ access_token: "tok" });

    calendarCalls += 1;

    if (calendarDown) return new Response("", { status: 503 });

    if (url.includes("/users/me/calendarList"))
      return Response.json({ items: [{ id: "me@x", summary: "Me", accessRole: "owner" }] });

    return Response.json({ items });
  });

beforeEach(() => {
  items = [];
  calendarDown = false;
  calendarCalls = 0;
});

async function connected() {
  const db = makeD1();

  await db.exec(
    "INSERT INTO habits (id, name, record) VALUES ('t-gym', 'Gym', 'check'), ('t-sit', 'Sit', 'count'), ('t-run', 'Run', 'duration');",
  );

  return {
    ...makeEnv(),
    DB: db,
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_REFRESH_TOKEN: "refresh",
  } satisfies Env;
}

const instance = (id: string, series: string, start: string, end: string): Json => ({
  id,
  recurringEventId: series,
  summary: `${series} event`,
  start: { dateTime: start },
  end: { dateTime: end },
});

const removed = (id: string, series: string, start: string): Json => ({
  id,
  status: "cancelled",
  recurringEventId: series,
  originalStartTime: { dateTime: start },
});

const linksPost = (env: Env, body: Json) =>
  calendarLinks.onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/calendar-links", { email: OWNER, body }),
  });

const link = (env: Env, habit: string, seriesId: string, over: Record<string, Json> = {}) =>
  linksPost(env, {
    type: "link",
    habit,
    calendarId: "me@x",
    seriesId,
    summary: seriesId,
    assumeDone: true,
    ownCalendar: true,
    ...over,
  });

const reviewGet = (env: Env, day: string) =>
  eveningReview.onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", `https://x/api/evening-review?day=${day}`, { email: OWNER }),
  });

const confirm = (env: Env, answers: Json[] = []) =>
  eveningReview.onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/evening-review", {
      email: OWNER,
      body: { day: DAY, answers },
    }),
  });

const rows = async (env: Env, sql: string) =>
  (await env.DB.prepare(sql).bind().all<Record<string, Json>>()).results;

test("the link API lists links and the series picker", async () => {
  const env = await connected();

  items = [instance("g1", "gym-series", "2026-11-12T19:00:00-05:00", "2026-11-12T20:30:00-05:00")];
  assert.equal((await link(env, "t-gym", "gym-series")).status, 204);

  const res = await calendarLinks.onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", "https://x/api/calendar-links?series=1", { email: OWNER }),
  });

  assert.deepEqual(await readJson(res), {
    links: [
      {
        habit: "t-gym",
        calendarId: "me@x",
        seriesId: "gym-series",
        summary: "gym-series",
        assumeDone: true,
        ownCalendar: true,
      },
    ],
    series: {
      status: "ok",
      value: [
        {
          calendarId: "me@x",
          calendarName: "Me",
          seriesId: "gym-series",
          summary: "gym-series event",
          ownCalendar: true,
          count: 1,
        },
      ],
    },
  });
});

test("the link API reads no calendar unless asked for the series", async () => {
  const env = await connected();

  const res = await calendarLinks.onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", "https://x/api/calendar-links", { email: OWNER }),
  });

  assert.deepEqual(await readJson(res), { links: [] });
  assert.equal(calendarCalls, 0);
});

test("linking a series again moves it to the new Habit; unlinking removes it", async () => {
  const env = await connected();

  await link(env, "t-gym", "s");
  await link(env, "t-sit", "s", { assumeDone: false, ownCalendar: false });
  assert.deepEqual(
    await rows(env, "SELECT habit, assume_done, own_calendar FROM habit_calendar_links"),
    [{ habit: "t-sit", assume_done: 0, own_calendar: 0 }],
  );

  assert.equal(
    (await linksPost(env, { type: "unlink", calendarId: "me@x", seriesId: "s" })).status,
    204,
  );
  assert.deepEqual(await rows(env, "SELECT * FROM habit_calendar_links"), []);
});

test("a link to a missing Habit or a bad body is refused", async () => {
  const env = await connected();

  assert.equal((await link(env, "nope", "s")).status, 400);
  assert.equal((await linksPost(env, { type: "link" })).status, 400);
});

test("deleting a Habit deletes its links", async () => {
  const env = await connected();

  await link(env, "t-gym", "s");
  await postHabits({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/habits", {
      email: OWNER,
      body: { type: "delete-habit", id: "t-gym" },
    }),
  });

  assert.deepEqual(await rows(env, "SELECT * FROM habit_calendar_links"), []);
});

test("a Day with no links reads no calendar and stays open", async () => {
  const env = await connected();

  assert.deepEqual(await readJson(await reviewGet(env, DAY)), {
    status: "ok",
    day: DAY,
    reviewed: false,
    events: [],
  });
  assert.equal((await confirm(env)).status, 204);
  assert.equal(calendarCalls, 0);
  assert.deepEqual(await rows(env, "SELECT * FROM evening_reviews"), []);
});

test("the review lists the Day's linked instances in Toronto time, removed ones included", async () => {
  const env = await connected();

  await link(env, "t-gym", "gym-series", { ownCalendar: false });
  await link(env, "t-run", "run-series", { assumeDone: false });
  items = [
    removed("g0", "gym-series", "2026-11-12T07:00:00-05:00"),
    instance("g1", "gym-series", "2026-11-12T19:00:00-05:00", "2026-11-12T20:30:00-05:00"),
    // 23:30 the Day before in Toronto, though it is the 12th in UTC.
    instance("late", "run-series", "2026-11-12T04:30:00Z", "2026-11-12T05:00:00Z"),
  ];

  assert.deepEqual(await readJson(await reviewGet(env, DAY)), {
    status: "ok",
    day: DAY,
    reviewed: false,
    events: [
      {
        eventId: "g0",
        habit: "t-gym",
        habitName: "Gym",
        record: "check",
        summary: "gym-series",
        startTime: "07:00",
        minutes: 1,
        removed: true,
        assumeDone: true,
        ownCalendar: false,
      },
      {
        eventId: "g1",
        habit: "t-gym",
        habitName: "Gym",
        record: "check",
        summary: "gym-series event",
        startTime: "19:00",
        minutes: 90,
        removed: false,
        assumeDone: true,
        ownCalendar: false,
      },
    ],
  });
});

test("a bad day is refused, and a calendar failure passes through", async () => {
  const env = await connected();

  assert.equal((await reviewGet(env, "2026-02-30")).status, 400);

  await link(env, "t-gym", "gym-series");
  calendarDown = true;

  assert.deepEqual(await readJson(await reviewGet(env, DAY)), { status: "unreachable" });

  const res = await confirm(env);

  assert.equal(res.status, 503);
  assert.deepEqual(await readJson(res), { status: "unreachable" });
});

test("confirming logs each Habit by its record style, Skips a not-done one, then locks the Day", async () => {
  const env = await connected();

  await link(env, "t-gym", "gym-series");
  await link(env, "t-sit", "sit-series");
  await link(env, "t-run", "run-series");
  items = [
    instance("g1", "gym-series", "2026-11-12T19:00:00-05:00", "2026-11-12T20:30:00-05:00"),
    instance("s1", "sit-series", "2026-11-12T07:00:00-05:00", "2026-11-12T08:00:00-05:00"),
    instance("s2", "sit-series", "2026-11-12T19:00:00-05:00", "2026-11-12T20:00:00-05:00"),
    instance("r1", "run-series", "2026-11-12T12:00:00-05:00", "2026-11-12T12:45:00-05:00"),
  ];

  assert.equal(
    (await confirm(env, [{ eventId: "g1", done: false, cause: "avoidance" }])).status,
    204,
  );

  assert.deepEqual(await rows(env, "SELECT habit, count FROM habit_checks ORDER BY habit"), [
    { habit: "t-gym", count: MISSED },
    { habit: "t-sit", count: 2 },
  ]);
  assert.deepEqual(await rows(env, "SELECT habit, cause FROM habit_skips"), [
    { habit: "t-gym", cause: "avoidance" },
  ]);
  assert.deepEqual(
    await rows(
      env,
      "SELECT habit, date, start_time, minutes, calendar_event_id FROM habit_durations",
    ),
    [{ habit: "t-run", date: DAY, start_time: "12:00", minutes: 45, calendar_event_id: "r1" }],
  );

  assert.equal((await confirm(env)).status, 409);
  const after = await readJson<{ reviewed: boolean }>(await reviewGet(env, DAY));

  assert.equal(after.reviewed, true);
});

test("the review never overrides a Day already answered", async () => {
  const env = await connected();

  await env.DB.prepare(
    "INSERT INTO habit_checks (date, habit, count) VALUES (?1, 't-sit', 5), (?1, 't-gym', 1)",
  )
    .bind(DAY)
    .run();
  await link(env, "t-sit", "sit-series");
  await link(env, "t-gym", "gym-series");
  items = [
    instance("s1", "sit-series", "2026-11-12T07:00:00-05:00", "2026-11-12T08:00:00-05:00"),
    instance("g1", "gym-series", "2026-11-12T19:00:00-05:00", "2026-11-12T20:00:00-05:00"),
  ];

  await confirm(env, [{ eventId: "g1", done: false, cause: "outside" }]);

  assert.deepEqual(await rows(env, "SELECT habit, count FROM habit_checks ORDER BY habit"), [
    { habit: "t-gym", count: 1 },
    { habit: "t-sit", count: 5 },
  ]);
  assert.deepEqual(await rows(env, "SELECT * FROM habit_skips"), []);
});

test("the morning cron confirms yesterday with the defaults", async () => {
  const env = await connected();

  await link(env, "t-gym", "gym-series");
  await link(env, "t-sit", "sit-series", { assumeDone: false });
  items = [
    instance("g1", "gym-series", "2026-11-12T19:00:00-05:00", "2026-11-12T20:00:00-05:00"),
    instance("s1", "sit-series", "2026-11-12T07:00:00-05:00", "2026-11-12T08:00:00-05:00"),
  ];

  const pending: Promise<unknown>[] = [];

  worker.scheduled(
    { cron: EVENING_REVIEW_CRON, scheduledTime: Date.parse("2026-11-13T08:47:00Z") },
    env,
    {
      waitUntil: (promise) => {
        pending.push(promise);
      },
    },
  );
  await Promise.all(pending);

  assert.deepEqual(await rows(env, "SELECT date, habit, count FROM habit_checks"), [
    { date: DAY, habit: "t-gym", count: 1 },
  ]);
  assert.deepEqual(await rows(env, "SELECT date FROM evening_reviews"), [{ date: DAY }]);
});
