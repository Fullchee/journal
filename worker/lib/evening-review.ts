import {
  clampMinutes,
  isoAt,
  reviewOutcomes,
  shiftDay,
  torontoDay,
  torontoTime,
  type CalendarLink,
  type ReviewAnswer,
  type ReviewEvent,
  type ReviewOutcome,
} from "@/core";
import { listSeriesInstances, type CalendarResult } from "./calendar";
import type { Env } from "./env";
import { addDurations, writeCheck, writeSkip } from "./habit-records";

interface LinkRow {
  calendar_id: string;
  series_id: string;
  habit: string;
  summary: string;
  assume_done: number;
  own_calendar: number;
}

const linkOf = (row: LinkRow): CalendarLink => ({
  habit: row.habit,
  calendarId: row.calendar_id,
  seriesId: row.series_id,
  summary: row.summary,
  assumeDone: row.assume_done === 1,
  ownCalendar: row.own_calendar === 1,
});

export async function readLinks(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT calendar_id, series_id, habit, summary, assume_done, own_calendar FROM habit_calendar_links ORDER BY summary",
  )
    .bind()
    .all<LinkRow>();

  return results.map((row) => linkOf(row));
}

/** Links one series to a Habit, moving it off any Habit it fed before. */
export async function saveLink(env: Env, link: CalendarLink) {
  const { meta } = await env.DB.prepare(
    "INSERT INTO habit_calendar_links (calendar_id, series_id, habit, summary, assume_done, own_calendar) " +
      "SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM habits WHERE id = ?3) " +
      "ON CONFLICT (calendar_id, series_id) DO UPDATE SET habit = excluded.habit, summary = excluded.summary, " +
      "assume_done = excluded.assume_done, own_calendar = excluded.own_calendar",
  )
    .bind(
      link.calendarId,
      link.seriesId,
      link.habit,
      link.summary,
      link.assumeDone ? 1 : 0,
      link.ownCalendar ? 1 : 0,
    )
    .run();

  return meta.changes > 0;
}

export async function deleteLink(env: Env, calendarId: string, seriesId: string) {
  await env.DB.prepare("DELETE FROM habit_calendar_links WHERE calendar_id = ? AND series_id = ?")
    .bind(calendarId, seriesId)
    .run();
}

async function isReviewed(env: Env, day: string) {
  const { results } = await env.DB.prepare("SELECT 1 FROM evening_reviews WHERE date = ?")
    .bind(day)
    .all();

  return results.length > 0;
}

const MINUTE_MS = 60_000;

/** The Day's instances of linked series, read from Google; no links means no Google call. */
async function readEvents(
  env: Env,
  day: string,
  fetcher: typeof fetch,
): Promise<CalendarResult<ReviewEvent[]>> {
  const { results: links } = await env.DB.prepare(
    "SELECT l.calendar_id, l.series_id, l.habit, l.summary, l.assume_done, l.own_calendar, h.name, h.record " +
      "FROM habit_calendar_links l JOIN habits h ON h.id = l.habit",
  )
    .bind()
    .all<LinkRow & { name: string; record: ReviewEvent["record"] }>();

  if (links.length === 0) return { status: "ok", value: [] };

  const linked = new Map(links.map((row) => [`${row.calendar_id}\n${row.series_id}`, row]));

  const instances = await listSeriesInstances(
    env,
    links.map((row) => ({ calendarId: row.calendar_id, seriesId: row.series_id })),
    { start: isoAt(day, 0), end: isoAt(day, 1440) },
    fetcher,
  );

  if (instances.status !== "ok") return instances;

  return {
    status: "ok",
    value: instances.value.flatMap((instance): ReviewEvent[] => {
      const row = linked.get(`${instance.calendarId}\n${instance.seriesId}`);

      // An instance that started before midnight belongs to the Day before (ADR 0013).
      if (row === undefined || torontoDay(instance.start) !== day) return [];

      return [
        {
          eventId: instance.eventId,
          habit: row.habit,
          habitName: row.name,
          record: row.record,
          // A removed instance keeps no title, so it shows the series' title from when it was linked.
          summary: instance.summary === "" ? row.summary : instance.summary,
          startTime: torontoTime(instance.start),
          minutes: clampMinutes(
            (Date.parse(instance.end) - Date.parse(instance.start)) / MINUTE_MS,
          ),
          removed: instance.removed,
          assumeDone: row.assume_done === 1,
          ownCalendar: row.own_calendar === 1,
        },
      ];
    }),
  };
}

export async function readReview(env: Env, day: string, fetcher: typeof fetch = fetch) {
  const [reviewed, events] = await Promise.all([
    isReviewed(env, day),
    readEvents(env, day, fetcher),
  ]);

  return events.status === "ok"
    ? { status: "ok" as const, day, reviewed, events: events.value }
    : events;
}

// The review is an automatic source: its Skips and counts never override a Day already answered.
async function applyOutcome(env: Env, day: string, outcome: ReviewOutcome) {
  const { habit } = outcome;

  if (outcome.kind === "skip") {
    await env.DB.batch(writeSkip(env.DB, { habit, date: day, mode: "fill", cause: outcome.cause }));

    return;
  }

  if (outcome.record === "duration") {
    const entries = outcome.events.map(({ eventId, startTime, minutes }) => ({
      date: day,
      startTime,
      minutes,
      id: eventId,
    }));

    await env.DB.batch(addDurations(env.DB, habit, entries, "calendar"));

    return;
  }

  // A count Habit counts each event; a check Habit is done once.
  const count = outcome.record === "count" ? outcome.events.length : 1;

  await env.DB.batch(writeCheck(env.DB, { habit, date: day, count, mode: "fill" }));
}

export type ConfirmResult = CalendarResult<void> | { status: "reviewed" };

/** Logs the Day's answers, with unanswered events taking their defaults, then locks the Day. */
export async function confirmReview(
  env: Env,
  day: string,
  answers: ReviewAnswer[],
  fetcher: typeof fetch = fetch,
): Promise<ConfirmResult> {
  const review = await readReview(env, day, fetcher);

  if (review.status !== "ok") return review;

  if (review.reviewed) return { status: "reviewed" };

  // A Day with nothing linked stays open, so links added later can still review it.
  if (review.events.length === 0) return { status: "ok", value: undefined };

  for (const outcome of reviewOutcomes(review.events, answers))
    await applyOutcome(env, day, outcome);

  await env.DB.prepare("INSERT INTO evening_reviews (date) VALUES (?) ON CONFLICT DO NOTHING")
    .bind(day)
    .run();

  return { status: "ok", value: undefined };
}

/** The cron's pass: a Day I didn't review logs its assume done events the next morning. */
export async function confirmYesterday(env: Env, now: Date, fetcher: typeof fetch = fetch) {
  return confirmReview(env, shiftDay(torontoDay(now), -1), [], fetcher);
}
