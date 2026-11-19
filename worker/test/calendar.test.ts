import assert from "node:assert/strict";
import { sentText, urlOf } from "./helpers/fetch";
import {
  createEvent,
  listBusy,
  listRecurringSeries,
  listSeriesInstances,
  searchEvents,
  type CalendarEnv,
} from "@worker/lib/calendar";

const RANGE = { start: "2026-11-01T00:00:00Z", end: "2026-11-02T00:00:00Z" };

const CONNECTED: CalendarEnv = {
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_REFRESH_TOKEN: "refresh",
};

type Handler = (url: string, init?: RequestInit) => Response;

// Serves the token endpoint plus whatever `api` returns for calendar calls.
const fakeFetch =
  (api: Handler, token: Response = Response.json({ access_token: "tok" })): typeof fetch =>
  (input, init) =>
    Promise.resolve(
      urlOf(input).startsWith("https://oauth2.googleapis.com/token")
        ? token.clone()
        : api(urlOf(input), init),
    );

test("a missing refresh token is 'not-connected' and calls no API", async () => {
  const never = fakeFetch(() => assert.fail("no request expected"));
  assert.deepEqual(await listBusy({}, RANGE, never), { status: "not-connected" });
  assert.deepEqual(await searchEvents({}, "Dr X", RANGE, never), { status: "not-connected" });
});

test("invalid_grant from Google is 'not-connected'", async () => {
  const revoked = Response.json({ error: "invalid_grant" }, { status: 400 });
  const f = fakeFetch(() => assert.fail("no request expected"), revoked);
  assert.deepEqual(await listBusy(CONNECTED, RANGE, f), { status: "not-connected" });
});

test("another token failure is 'unreachable', not 'not-connected'", async () => {
  const f = fakeFetch(() => assert.fail("no request expected"), new Response("", { status: 503 }));
  assert.deepEqual(await listBusy(CONNECTED, RANGE, f), { status: "unreachable" });
});

const offline: typeof fetch = () => Promise.reject(new TypeError("offline"));

test("a network error is 'unreachable'", async () => {
  assert.deepEqual(await searchEvents(CONNECTED, "x", RANGE, offline), { status: "unreachable" });
});

test("listBusy asks only for the primary calendar and sorts its busy intervals", async () => {
  let body: unknown;

  const f = fakeFetch((_url, init) => {
    body = JSON.parse(sentText(init));

    return Response.json({
      calendars: {
        primary: {
          busy: [
            { start: "2026-11-01T14:00:00Z", end: "2026-11-01T15:00:00Z" },
            { start: "2026-11-01T10:00:00Z", end: "2026-11-01T11:00:00Z" },
          ],
        },
      },
    });
  });

  assert.deepEqual(await listBusy(CONNECTED, RANGE, f), {
    status: "ok",
    value: [
      { start: "2026-11-01T10:00:00Z", end: "2026-11-01T11:00:00Z" },
      { start: "2026-11-01T14:00:00Z", end: "2026-11-01T15:00:00Z" },
    ],
  });
  assert.deepEqual(body, { timeMin: RANGE.start, timeMax: RANGE.end, items: [{ id: "primary" }] });
});

test("a failed calendar call is 'unreachable'", async () => {
  const f = fakeFetch(() => new Response("", { status: 500 }));
  assert.deepEqual(await listBusy(CONNECTED, RANGE, f), { status: "unreachable" });
});

test("searchEvents shows an event with no title or times as empty text", async () => {
  const f = fakeFetch(() => Response.json({ items: [{ start: {}, end: {} }] }));

  assert.deepEqual(await searchEvents(CONNECTED, "x", RANGE, f), {
    status: "ok",
    value: [{ summary: "", start: "", end: "" }],
  });
});

test("searchEvents sends the text and returns timed events oldest first", async () => {
  let seen = "";

  const f = fakeFetch((url) => {
    seen = url;

    return Response.json({
      items: [
        {
          summary: "Dr X",
          start: { dateTime: "2026-11-01T15:00:00Z" },
          end: { dateTime: "2026-11-01T16:00:00Z" },
        },
        {
          summary: "Dr X",
          start: { dateTime: "2026-11-01T09:00:00Z" },
          end: { dateTime: "2026-11-01T10:00:00Z" },
        },
        { summary: "All day", start: { date: "2026-11-01" }, end: { date: "2026-11-02" } },
      ],
    });
  });

  const result = await searchEvents(CONNECTED, "Dr X", RANGE, f);
  assert.match(seen, /q=Dr\+X/);
  assert.deepEqual(result, {
    status: "ok",
    value: [
      { summary: "All day", start: "2026-11-01", end: "2026-11-02" },
      { summary: "Dr X", start: "2026-11-01T09:00:00Z", end: "2026-11-01T10:00:00Z" },
      { summary: "Dr X", start: "2026-11-01T15:00:00Z", end: "2026-11-01T16:00:00Z" },
    ],
  });
});

test("createEvent posts the event to the primary calendar", async () => {
  const sent: { url: string; body: unknown }[] = [];

  const f = fakeFetch((url, init) => {
    sent.push({ url, body: JSON.parse(sentText(init)) });

    return Response.json({});
  });

  const event = {
    summary: "09:00–10:30 block",
    description: "- Pay rent",
    start: RANGE.start,
    end: RANGE.end,
  };

  assert.deepEqual(await createEvent(CONNECTED, event, f), { status: "ok", value: undefined });
  assert.equal(sent[0]!.url, "https://www.googleapis.com/calendar/v3/calendars/primary/events");

  assert.deepEqual(sent[0]!.body, {
    summary: "09:00–10:30 block",
    description: "- Pay rent",
    start: { dateTime: RANGE.start },
    end: { dateTime: RANGE.end },
  });
});

test("createEvent is 'not-connected' without a refresh token", async () => {
  const event = { summary: "x", description: "", start: RANGE.start, end: RANGE.end };

  assert.deepEqual(
    await createEvent(
      {},
      event,
      fakeFetch(() => assert.fail("no request")),
    ),
    {
      status: "not-connected",
    },
  );
});

const timed = (id: string, series: string, [start, end]: [string, string], summary = "Run") => ({
  id,
  recurringEventId: series,
  summary,
  start: { dateTime: start },
  end: { dateTime: end },
});

test("listSeriesInstances reads each calendar once, deleted ones included, and keeps only linked timed instances", async () => {
  const urls: string[] = [];

  const f = fakeFetch((url) => {
    urls.push(url);

    if (url.includes("/calendars/shared%40group/"))
      return Response.json({
        items: [timed("g1", "gym", ["2026-11-01T19:00:00-05:00", "2026-11-01T20:30:00-05:00"])],
      });

    return Response.json({
      items: [
        timed("r2", "run", ["2026-11-01T12:00:00-05:00", "2026-11-01T13:00:00-05:00"]),
        {
          id: "r1",
          status: "cancelled",
          recurringEventId: "run",
          originalStartTime: { dateTime: "2026-11-01T07:00:00-05:00" },
        },
        {
          id: "a1",
          recurringEventId: "run",
          summary: "All day",
          start: { date: "2026-11-01" },
          end: { date: "2026-11-02" },
        },
        timed("o1", "other", ["2026-11-01T09:00:00-05:00", "2026-11-01T10:00:00-05:00"]),
        {
          id: "single",
          summary: "One-time",
          start: { dateTime: "2026-11-01T09:00:00-05:00" },
          end: { dateTime: "2026-11-01T10:00:00-05:00" },
        },
      ],
    });
  });

  const result = await listSeriesInstances(
    CONNECTED,
    [
      { calendarId: "primary", seriesId: "run" },
      { calendarId: "shared@group", seriesId: "gym" },
    ],
    RANGE,
    f,
  );

  assert.equal(urls.length, 2);
  assert.match(urls[0] ?? "", /showDeleted=true/);
  assert.deepEqual(result, {
    status: "ok",
    value: [
      {
        calendarId: "primary",
        seriesId: "run",
        eventId: "r1",
        summary: "",
        start: "2026-11-01T07:00:00-05:00",
        end: "2026-11-01T07:00:00-05:00",
        removed: true,
      },
      {
        calendarId: "primary",
        seriesId: "run",
        eventId: "r2",
        summary: "Run",
        start: "2026-11-01T12:00:00-05:00",
        end: "2026-11-01T13:00:00-05:00",
        removed: false,
      },
      {
        calendarId: "shared@group",
        seriesId: "gym",
        eventId: "g1",
        summary: "Run",
        start: "2026-11-01T19:00:00-05:00",
        end: "2026-11-01T20:30:00-05:00",
        removed: false,
      },
    ],
  });
});

test("listRecurringSeries counts each calendar's series, names the calendar and sorts by count", async () => {
  const f = fakeFetch((url) => {
    if (url.includes("/users/me/calendarList"))
      return Response.json({
        items: [
          { id: "me@x", summary: "Me", accessRole: "owner" },
          { id: "club@group", summary: "Club", summaryOverride: "My club", accessRole: "reader" },
          { id: "bare@group", accessRole: "reader" },
        ],
      });

    if (url.includes("/calendars/me%40x/"))
      return Response.json({
        items: [
          timed("s1", "sit", ["2026-11-01T07:00:00-05:00", "2026-11-01T08:00:00-05:00"], "Sit"),
          timed("s2", "sit", ["2026-11-02T07:00:00-05:00", "2026-11-02T08:00:00-05:00"], "Sit"),
          timed("b1", "bike", ["2026-11-01T17:00:00-05:00", "2026-11-01T18:00:00-05:00"], "Bike"),
        ],
      });

    if (url.includes("/calendars/club%40group/"))
      return Response.json({
        items: [
          timed("c1", "class", ["2026-11-01T19:00:00-05:00", "2026-11-01T20:00:00-05:00"], "Class"),
        ],
      });

    return Response.json({ items: [] });
  });

  assert.deepEqual(await listRecurringSeries(CONNECTED, RANGE, f), {
    status: "ok",
    value: [
      {
        calendarId: "me@x",
        calendarName: "Me",
        seriesId: "sit",
        summary: "Sit",
        ownCalendar: true,
        count: 2,
      },
      {
        calendarId: "me@x",
        calendarName: "Me",
        seriesId: "bike",
        summary: "Bike",
        ownCalendar: true,
        count: 1,
      },
      {
        calendarId: "club@group",
        calendarName: "My club",
        seriesId: "class",
        summary: "Class",
        ownCalendar: false,
        count: 1,
      },
    ],
  });
});

test("listRecurringSeries names a calendar with no summary by its id", async () => {
  const calendarList = { items: [{ id: "bare@group", accessRole: "reader" }] };

  const instances = {
    items: [timed("x1", "x", ["2026-11-01T07:00:00-05:00", "2026-11-01T08:00:00-05:00"])],
  };

  const f = fakeFetch((url) =>
    Response.json(url.includes("/users/me/calendarList") ? calendarList : instances),
  );

  const result = await listRecurringSeries(CONNECTED, RANGE, f);

  assert.equal(result.status === "ok" && result.value[0]?.calendarName, "bare@group");
});
