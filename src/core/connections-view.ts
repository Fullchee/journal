import * as z from "zod/mini";

import { clockLabel, dayOfWeek, daysBetween, shiftDay, torontoDay } from "./calendar";
import { WEEKDAYS } from "./habits-view";

/** Closeness follows Dunbar's layers loosely: who I'd call in a crisis, and friends. Family is a Circle. */
export const CLOSENESSES = ["close", "friend"] as const;

/** "" is unset. */
export const Closeness = z.enum([...CLOSENESSES, ""]);

export type Closeness = z.infer<typeof Closeness>;

export const closenessLabel = (closeness: Closeness) =>
  closeness.charAt(0).toUpperCase() + closeness.slice(1);

/** Dunbar's contact minima: weekly keeps someone close, monthly keeps a friend (Dunbar 2025). */
const CLOSENESS_CADENCE_DAYS = { close: 7, friend: 30, "": null } as const;

/** The reach-out cadence after picking a closeness: a set cadence stays, an empty one takes the closeness's default. */
export const cadenceForCloseness = (closeness: Closeness, cadenceDays: number | null) =>
  cadenceDays ?? CLOSENESS_CADENCE_DAYS[closeness];

export const CADENCES = [
  { days: 7, label: "Weekly" },
  { days: 14, label: "Every 2 weeks" },
  { days: 30, label: "Monthly" },
  { days: 90, label: "Every 3 months" },
];

/**
 * `date` is YYYY-MM-DD; a yearly date (a birthday) repeats on its month and day.
 * A yearly date with an unknown year is `--MM-DD`, as vCard and Android contacts write it.
 */
const ConnectionDate = z.object({
  label: z.string(),
  date: z.string(),
  yearly: z.boolean(),
});

export type ConnectionDate = z.infer<typeof ConnectionDate>;

/**
 * Where I usually see someone, such as dragon boat practice; `days` are weekdays (0 = Sunday), empty when irregular.
 * `time` ("HH:MM") is when it starts; meetups saved before it existed have none.
 */
export const Meetup = z.object({
  label: z.string(),
  days: z.array(z.number()),
  time: z.optional(z.string()),
});

export type Meetup = z.infer<typeof Meetup>;

export const meetupLabel = ({ label, days, time }: Meetup) =>
  [
    label,
    [
      days.map((d) => WEEKDAYS[d]).join(", "),
      time === undefined || time === "" ? "" : clockLabel(time),
    ]
      .filter(Boolean)
      .join(" at "),
  ]
    .filter(Boolean)
    .join(" · ");

/** Another Connection, named so a page can link to them. */
const ConnectionRef = z.object({ id: z.number(), name: z.string() });

export type ConnectionRef = z.infer<typeof ConnectionRef>;

/** A link to another Connection with a free-text label, such as "partner"; both people's pages show it. */
const ConnectionLink = z.extend(ConnectionRef, { label: z.string() });

export type ConnectionLink = z.infer<typeof ConnectionLink>;

/** A Connection as the list API returns it; the detail API adds the Markdown `body`. */
export const Connection = z.object({
  id: z.number(),
  name: z.string(),
  closeness: Closeness,
  /** The names of the Circles they're in, A to Z. */
  circles: z.array(z.string()),
  cadenceDays: z.nullable(z.number()),
  /** The newest Interaction's day, YYYY-MM-DD; null before the first. */
  lastContactedOn: z.nullable(z.string()),
  followUps: z.string(),
  /** One plain line, such as "dragon boat, 2024". */
  howWeMet: z.string(),
  /** Who introduced us. */
  metThrough: z.nullable(ConnectionRef),
  /** Who this person introduced me to. */
  introduced: z.array(ConnectionRef),
  links: z.array(ConnectionLink),
  meetups: z.array(Meetup),
  dates: z.array(ConnectionDate),
  /**
   * Someone I want to grow closer to gets a weekly "make a plan" prompt; `planCheckedAt` is when I last answered it.
   */
  growCloser: z.boolean(),
  planCheckedAt: z.nullable(z.string()),
  /** The phone contact this person was picked from, as expo-contacts gives it; null when typed in. */
  contactId: z.nullable(z.string()),
});

export type Connection = z.infer<typeof Connection>;

/** Every Circle someone is in, once each and A to Z. */
export const circleNames = (connections: Connection[]) =>
  [...new Set(connections.flatMap((c) => c.circles))].toSorted((a, b) => a.localeCompare(b));

export const ConnectionsBody = z.object({ connections: z.array(Connection) });

export type ConnectionsBody = z.infer<typeof ConnectionsBody>;

/**
 * A search result; `match` is the line of their follow-ups or notes that holds the query, or "" when only the name or a label matched.
 */
export const ConnectionMatch = z.object({ id: z.number(), name: z.string(), match: z.string() });

export type ConnectionMatch = z.infer<typeof ConnectionMatch>;

const DAY_MS = 86_400_000;

/**
 * The next day a date falls on from `today`, or null for a one-off date that has passed.
 * Feb 29 falls on Mar 1 in other years, as Date rolls it over.
 */
export function nextOccurrence({ date, yearly }: ConnectionDate, today: string): string | null {
  if (!yearly) return date >= today ? date : null;

  const month = date.slice(-5, -3);
  const day = Number(date.slice(-2));
  const year = Number(today.slice(0, 4));
  const on = (y: number) => shiftDay(`${y}-${month}-01`, day - 1);
  const thisYear = on(year);

  return thisYear >= today ? thisYear : on(year + 1);
}

const YEARLESS = "--";

export const hasYear = (date: string) => !date.startsWith(YEARLESS);

/** The same month and day in `year`, or with no year when `year` is null. */
export const withYear = (date: string, year: string | null) =>
  year === null ? `${YEARLESS}${date.slice(-5)}` : `${year}-${date.slice(-5)}`;

/** A full day for a date picker; 2000 is a leap year, so a yearless Feb 29 stays Feb 29. */
export const dayOfYearless = (date: string) => (hasYear(date) ? date : withYear(date, "2000"));

/** How many years a yearly date marks on `on` (a birthday's age), or null when its year is unknown. */
export const ageOn = ({ date, yearly }: ConnectionDate, on: string) =>
  yearly && hasYear(date) ? Number(on.slice(0, 4)) - Number(date.slice(0, 4)) : null;

/** Days from `today` to the date's next occurrence, or null for a one-off date that has passed. */
export function daysUntil(date: ConnectionDate, today: string): number | null {
  const on = nextOccurrence(date, today);

  return on === null ? null : daysBetween(today, on);
}

/** Soonest first; a passed one-off date goes last. */
export const bySoonest = (dates: ConnectionDate[], today: string) =>
  dates.toSorted((a, b) => (daysUntil(a, today) ?? Infinity) - (daysUntil(b, today) ?? Infinity));

export interface Upcoming {
  id: number;
  name: string;
  label: string;
  inDays: number;
}

/** Dates in the next `withinDays` days, soonest first, for the Today page and the people list. */
export function upcomingDates(
  connections: Connection[],
  today: string,
  withinDays = 14,
): Upcoming[] {
  return connections
    .flatMap(({ id, name, dates }) =>
      dates.flatMap((d) => {
        const inDays = daysUntil(d, today);

        return inDays !== null && inDays <= withinDays ? { id, name, label: d.label, inDays } : [];
      }),
    )
    .toSorted((a, b) => a.inDays - b.inDays);
}

export function inDaysLabel(inDays: number) {
  if (inDays === 0) return "today";

  return inDays === 1 ? "tomorrow" : `in ${inDays} days`;
}

/** How far past their cadence a person is, as a share of it; never contacted counts as one full cadence. */
export function overdueShare(c: Connection, now: Date) {
  if (c.cadenceDays === null) return -Infinity;

  if (c.lastContactedOn === null) return 1;

  return daysBetween(c.lastContactedOn, torontoDay(now)) / c.cadenceDays;
}

export interface Seeing {
  id: number;
  name: string;
  label: string;
  followUp: string;
}

/** People I usually see on this weekday, with the first thing to ask them about. */
export const seeingToday = (connections: Connection[], now: Date): Seeing[] =>
  connections.flatMap(({ id, name, meetups, followUps }) =>
    meetups
      .filter((m) => m.days.includes(dayOfWeek(torontoDay(now))))
      .map((m) => ({ id, name, label: m.label, followUp: firstFollowUp(followUps) })),
  );

const meetsOn = (c: Connection, weekday: number) => c.meetups.some((m) => m.days.includes(weekday));

/**
 * A few gentle suggestions, never a backlog: the people most past their cadence.
 * Someone I'll see at a meetup today needs no message.
 */
export const dueToReachOut = (connections: Connection[], now: Date, limit = 3) =>
  connections
    .flatMap((c) => {
      if (meetsOn(c, dayOfWeek(torontoDay(now)))) return [];
      const share = overdueShare(c, now);

      return share >= 1 ? { c, share } : [];
    })
    .toSorted((a, b) => b.share - a.share)
    .slice(0, limit)
    .map(({ c }) => c);

/**
 * About 50 hours together moves an acquaintance to a casual friend (Hall 2019), so time together beats messages.
 */
const PLAN_EVERY_DAYS = 7;

/**
 * One gentle prompt a day at most: the person I want to grow closer to who has waited longest.
 * Someone I'll see at a meetup today, or answered for in the last week, waits.
 */
export function planWith(connections: Connection[], now: Date): Connection | null {
  const waited = (c: Connection) =>
    c.planCheckedAt === null ? Infinity : (now.getTime() - Date.parse(c.planCheckedAt)) / DAY_MS;

  return (
    connections
      .filter(
        (c) =>
          c.growCloser && !meetsOn(c, dayOfWeek(torontoDay(now))) && waited(c) >= PLAN_EVERY_DAYS,
      )
      .toSorted((a, b) => waited(b) - waited(a))[0] ?? null
  );
}

/** The first thing to ask about, without its list marker, for a one-line hint. */
export const firstFollowUp = (followUps: string) =>
  followUps
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .find(Boolean) ?? "";

export function lastContactedLabel(lastContactedOn: string | null, now: Date) {
  if (lastContactedOn === null) return "Not yet";

  const days = daysBetween(lastContactedOn, torontoDay(now));

  if (days === 0) return "Today";

  return days === 1 ? "Yesterday" : `${days} days ago`;
}
