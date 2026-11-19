import * as z from "zod/mini";
import { expectJson, readJson } from "./json";

/** Google Calendar over REST with a refresh token (#85). The OAuth client and token are Worker secrets. */
export interface CalendarEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
}

/** "not-connected" means the user must reconnect Google; "unreachable" is a transient failure. */
export type CalendarResult<T> =
  | { status: "ok"; value: T }
  | { status: "not-connected" }
  | { status: "unreachable" };

export interface TimeRange {
  start: string;
  end: string;
}

const Interval = z.object({ start: z.string(), end: z.string() });

export type Interval = z.infer<typeof Interval>;

export interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
}

const GOOGLE = "https://www.googleapis.com/calendar/v3";

const Granted = z.object({ access_token: z.string() });

const OAuthError = z.object({ error: z.optional(z.string()) });

const Primary = z.object({ busy: z.array(Interval) });

const FreeBusy = z.object({ calendars: z.object({ primary: Primary }) });

/** An all-day event has a `date`; a timed one a `dateTime`. */
const EventTime = z.object({ dateTime: z.optional(z.string()), date: z.optional(z.string()) });

const ListedEvent = z.object({ summary: z.optional(z.string()), start: EventTime, end: EventTime });

const EventList = z.object({ items: z.array(ListedEvent) });

type Get = <Schema extends z.ZodMiniType>(
  path: string,
  schema: Schema,
  init?: RequestInit,
) => Promise<z.infer<Schema>>;

type Failure = { status: "not-connected" } | { status: "unreachable" };

async function accessToken(env: CalendarEnv, fetcher: typeof fetch): Promise<string | Failure> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = env;

  if (
    GOOGLE_CLIENT_ID === undefined ||
    GOOGLE_CLIENT_SECRET === undefined ||
    GOOGLE_REFRESH_TOKEN === undefined
  )
    return { status: "not-connected" };

  const res = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (res.ok) {
    const granted = await expectJson(res, Granted);

    return granted.access_token;
  }

  const body = await readJson(res, OAuthError);

  return { status: body?.error === "invalid_grant" ? "not-connected" : "unreachable" };
}

const isFailure = (token: string | Failure): token is Failure => token instanceof Object;

/** Runs `read` with a fresh access token; any thrown or non-2xx failure becomes "unreachable". */
async function withCalendar<T>(
  env: CalendarEnv,
  fetcher: typeof fetch,
  read: (get: Get) => Promise<T>,
): Promise<CalendarResult<T>> {
  try {
    const token = await accessToken(env, fetcher);

    if (isFailure(token)) return token;

    const value = await read(async (path, schema, init) => {
      const res = await fetcher(`${GOOGLE}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      });

      if (!res.ok) throw new Error(`calendar ${res.status}`);

      return expectJson(res, schema);
    });

    return { status: "ok", value };
  } catch {
    return { status: "unreachable" };
  }
}

/**
 * Busy intervals on the personal primary calendar, oldest first. The freeBusy
 * scope covers this call; listing calendars would need a wider grant.
 */
export const listBusy = (
  env: CalendarEnv,
  range: TimeRange,
  fetcher: typeof fetch = fetch,
): Promise<CalendarResult<Interval[]>> =>
  withCalendar(env, fetcher, async (get) => {
    const { calendars } = await get("/freeBusy", FreeBusy, {
      method: "POST",
      body: JSON.stringify({
        timeMin: range.start,
        timeMax: range.end,
        items: [{ id: "primary" }],
      }),
    });

    return calendars.primary.busy.toSorted((a, b) => a.start.localeCompare(b.start));
  });

/** Events on the primary calendar whose text matches `query`, oldest first. */
export const searchEvents = (
  env: CalendarEnv,
  query: string,
  range: TimeRange,
  fetcher: typeof fetch = fetch,
): Promise<CalendarResult<CalendarEvent[]>> =>
  withCalendar(env, fetcher, async (get) => {
    const params = new URLSearchParams({
      q: query,
      timeMin: range.start,
      timeMax: range.end,
      singleEvents: "true",
      orderBy: "startTime",
    });

    const { items } = await get(`/calendars/primary/events?${params.toString()}`, EventList);

    return items
      .map((e) => ({
        summary: e.summary ?? "",
        start: e.start.dateTime ?? e.start.date ?? "",
        end: e.end.dateTime ?? e.end.date ?? "",
      }))
      .toSorted((a, b) => a.start.localeCompare(b.start));
  });

export interface NewEvent {
  summary: string;
  description: string;
  start: string;
  end: string;
}

/** Adds an event to the primary calendar. */
export const createEvent = (
  env: CalendarEnv,
  event: NewEvent,
  fetcher: typeof fetch = fetch,
): Promise<CalendarResult<void>> =>
  withCalendar(env, fetcher, async (get) => {
    await get("/calendars/primary/events", z.unknown(), {
      method: "POST",
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.start },
        end: { dateTime: event.end },
      }),
    });
  });

const CalendarListEntry = z.object({
  id: z.string(),
  summary: z.optional(z.string()),
  summaryOverride: z.optional(z.string()),
  accessRole: z.string(),
});

const CalendarList = z.object({ items: z.array(CalendarListEntry) });

/** A deleted instance keeps only its id, status, series and `originalStartTime`. */
const Instance = z.object({
  id: z.string(),
  status: z.optional(z.string()),
  recurringEventId: z.optional(z.string()),
  summary: z.optional(z.string()),
  start: z.optional(EventTime),
  end: z.optional(EventTime),
  originalStartTime: z.optional(EventTime),
});

const InstanceList = z.object({ items: z.array(Instance) });

/** A Day holds far fewer instances; one page avoids paging. */
const MAX_RESULTS = "2500";

export interface SeriesRef {
  calendarId: string;
  seriesId: string;
}

/** One timed instance of a recurring series. A removed one has no end, so `end` repeats its start. */
export interface SeriesInstance extends SeriesRef {
  eventId: string;
  summary: string;
  start: string;
  end: string;
  removed: boolean;
}

export interface Series extends SeriesRef {
  calendarName: string;
  summary: string;
  ownCalendar: boolean;
  count: number;
}

const instancesPath = (calendarId: string, range: TimeRange, showDeleted: boolean) =>
  `/calendars/${encodeURIComponent(calendarId)}/events?${new URLSearchParams({
    timeMin: range.start,
    timeMax: range.end,
    singleEvents: "true",
    showDeleted: String(showDeleted),
    maxResults: MAX_RESULTS,
  }).toString()}`;

// An all-day instance has only a `date`, so it has no time to log and is left out.
function timedInstance(calendarId: string, item: z.infer<typeof Instance>): SeriesInstance[] {
  const removed = item.status === "cancelled";
  const start = (removed ? item.originalStartTime : item.start)?.dateTime;

  if (start === undefined || item.recurringEventId === undefined) return [];

  return [
    {
      calendarId,
      seriesId: item.recurringEventId,
      eventId: item.id,
      summary: item.summary ?? "",
      start,
      end: item.end?.dateTime ?? start,
      removed,
    },
  ];
}

/** Timed instances of `series` in `range`, removed ones included; one request per calendar. */
export const listSeriesInstances = (
  env: CalendarEnv,
  series: SeriesRef[],
  range: TimeRange,
  fetcher: typeof fetch,
): Promise<CalendarResult<SeriesInstance[]>> =>
  withCalendar(env, fetcher, async (get) => {
    const wanted = new Set(series.map((s) => `${s.calendarId}\n${s.seriesId}`));
    const calendars = [...new Set(series.map((s) => s.calendarId))];

    const lists = await Promise.all(
      calendars.map(async (calendarId) => {
        const { items } = await get(instancesPath(calendarId, range, true), InstanceList);

        return items.flatMap((item) => timedInstance(calendarId, item));
      }),
    );

    return lists
      .flat()
      .filter((i) => wanted.has(`${i.calendarId}\n${i.seriesId}`))
      .toSorted((a, b) => a.start.localeCompare(b.start));
  });

/**
 * Every recurring series with a timed instance in `range`, on every calendar in my list, most instances
 * first. Listing calendars needs the calendar.calendarlist.readonly scope.
 */
export const listRecurringSeries = (
  env: CalendarEnv,
  range: TimeRange,
  fetcher: typeof fetch = fetch,
): Promise<CalendarResult<Series[]>> =>
  withCalendar(env, fetcher, async (get) => {
    const { items: calendars } = await get("/users/me/calendarList", CalendarList);

    const lists = await Promise.all(
      calendars.map(async (calendar) => {
        const { items } = await get(instancesPath(calendar.id, range, false), InstanceList);
        const bySeries = new Map<string, Series>();

        const instances = items.flatMap((item) => timedInstance(calendar.id, item));

        for (const instance of instances) {
          const seen = bySeries.get(instance.seriesId);

          bySeries.set(instance.seriesId, {
            calendarId: calendar.id,
            calendarName: calendar.summaryOverride ?? calendar.summary ?? calendar.id,
            seriesId: instance.seriesId,
            summary: instance.summary,
            ownCalendar: calendar.accessRole === "owner",
            count: (seen?.count ?? 0) + 1,
          });
        }

        return [...bySeries.values()];
      }),
    );

    return lists
      .flat()
      .toSorted((a, b) =>
        b.count === a.count ? a.summary.localeCompare(b.summary) : b.count - a.count,
      );
  });
