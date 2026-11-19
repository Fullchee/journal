import * as z from "zod/mini";
import { RESCHEDULE_CAUSES, RecordStyle } from "./habits-view";
import type { SkipCause } from "./skip";

/** A Habit's Calendar link to one recurring event series (#145). */
export const CalendarLink = z.object({
  habit: z.string(),
  calendarId: z.string(),
  seriesId: z.string(),
  summary: z.string(),
  assumeDone: z.boolean(),
  /** False on a calendar someone else owns, so they removed any instance missing from it. */
  ownCalendar: z.boolean(),
});

export type CalendarLink = z.infer<typeof CalendarLink>;

/** A recurring series seen on my calendars lately, offered by the link picker. */
const CalendarSeries = z.object({
  calendarId: z.string(),
  calendarName: z.string(),
  seriesId: z.string(),
  summary: z.string(),
  ownCalendar: z.boolean(),
  /** How many instances fell in the window looked at. */
  count: z.number(),
});

export type CalendarSeries = z.infer<typeof CalendarSeries>;

const SeriesList = z.object({ status: z.literal("ok"), value: z.array(CalendarSeries) });

const CalendarFailure = z.object({ status: z.enum(["not-connected", "unreachable"]) });

export const CalendarLinksBody = z.object({
  links: z.array(CalendarLink),
  /** Only when asked for, since it reads Google. */
  series: z.optional(z.union([SeriesList, CalendarFailure])),
});

export type CalendarLinksBody = z.infer<typeof CalendarLinksBody>;

/** One instance of a linked series on the reviewed Day. */
const ReviewEvent = z.object({
  eventId: z.string(),
  habit: z.string(),
  habitName: z.string(),
  record: RecordStyle,
  summary: z.string(),
  /** Toronto clock "HH:MM". */
  startTime: z.string(),
  minutes: z.number(),
  /** Deleted from the calendar: logs nothing unless answered. */
  removed: z.boolean(),
  assumeDone: z.boolean(),
  ownCalendar: z.boolean(),
});

export type ReviewEvent = z.infer<typeof ReviewEvent>;

export const EveningReviewBody = z.union([
  z.object({
    status: z.literal("ok"),
    day: z.string(),
    reviewed: z.boolean(),
    events: z.array(ReviewEvent),
  }),
  z.object({ status: z.enum(["not-connected", "unreachable"]) }),
]);

/** What I said about one event; `cause` turns a not-done answer into a Skip. */
export const ReviewAnswer = z.object({
  eventId: z.string(),
  done: z.boolean(),
  cause: z.optional(z.enum(RESCHEDULE_CAUSES)),
});

export type ReviewAnswer = z.infer<typeof ReviewAnswer>;

/** The answer an event gets when I leave it alone, as the review starts it and the next morning applies it. */
export const defaultAnswer = (event: ReviewEvent): ReviewAnswer => ({
  eventId: event.eventId,
  done: event.assumeDone && !event.removed,
});

/** A removed event on someone else's calendar was cancelled by them, so its Skip starts as outside. */
export const suggestedCause = (event: ReviewEvent): SkipCause | undefined =>
  event.removed && !event.ownCalendar ? "outside" : undefined;

/** A Duration Habit holds entries, never a Not done day, so it has no Skip. */
export const canSkip = (event: ReviewEvent) => event.record !== "duration";

export type ReviewOutcome =
  | { kind: "done"; habit: string; record: ReviewEvent["record"]; events: ReviewEvent[] }
  | { kind: "skip"; habit: string; cause: SkipCause };

/**
 * What a review logs, one outcome per Habit. A removed event is never done: it has no length to log. Any done event makes the Habit's day done; otherwise the
 * first Skip cause, by start time, makes it a Skip; a Habit with neither logs nothing.
 */
export function reviewOutcomes(events: ReviewEvent[], answers: ReviewAnswer[]): ReviewOutcome[] {
  const given = new Map(answers.map((answer) => [answer.eventId, answer]));
  const answerOf = (event: ReviewEvent) => given.get(event.eventId) ?? defaultAnswer(event);
  const groups = new Map<string, { record: ReviewEvent["record"]; events: ReviewEvent[] }>();

  const byStart = events.toSorted((a, b) => a.startTime.localeCompare(b.startTime));

  for (const event of byStart) {
    const group = groups.get(event.habit) ?? { record: event.record, events: [] };

    group.events.push(event);
    groups.set(event.habit, group);
  }

  return [...groups].flatMap(([habit, { record, events: habitEvents }]): ReviewOutcome[] => {
    const done = habitEvents.filter((event) => !event.removed && answerOf(event).done);

    if (done.length > 0) return [{ kind: "done", habit, record, events: done }];

    const cause = habitEvents
      .filter((event) => canSkip(event))
      .map((event) => answerOf(event).cause)
      .find((given) => given !== undefined);

    return cause === undefined ? [] : [{ kind: "skip", habit, cause }];
  });
}
