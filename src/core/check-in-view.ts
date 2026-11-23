import * as z from "zod/mini";

import {
  dayOfWeek,
  daysBetween,
  formatDay,
  isoAt,
  minutesOf,
  shiftDay,
  TIME_ZONE,
  torontoDay,
  torontoTime,
} from "./calendar";
import { amountLabel } from "./check-in-mood";
import type { LogEntry } from "./log-api";
import { minutesPast18, Night } from "./sleep-summary";

type Half = "upper" | "lower";

/** Score 1-8 runs Storm to Sun, two scores per zone (matches the check_ins CHECK). */
export const ZONES = ["Storm", "Rain", "Cloud", "Sun"] as const;

const Zone = z.enum(ZONES);

export type Zone = z.infer<typeof Zone>;

/** IFS: Self is not a part, so it is offered only as the one in control. */
export const SELF = "Self" as const;

/** A Part as a Check-in names it: by id, with its current name. */
export const PartRef = z.object({ id: z.number(), name: z.string() });

export type PartRef = z.infer<typeof PartRef>;

const InControl = z.union([z.literal(SELF), PartRef]);

export const PLEASANTNESS = ["Pleasant", "Unpleasant"] as const;

export const ENERGY = ["High", "Low"] as const;

/**
 * A Check-in as the API returns it; `thought` holds the feelings, see listOf.
 * `inControl` is Self, a Part or no answer; `parts` are the others present.
 * `tense` (the Tense row), `low` and `tired` are 0 None, 1 Some, 2 A lot; null is untouched.
 * `pleasantness` and `feelingEnergy` are the How I felt quadrant.
 */
export const CheckIn = z.object({
  id: z.number(),
  checkedInAt: z.string(),
  zone: Zone,
  score: z.number(),
  note: z.string(),
  place: z.string(),
  doing: z.string(),
  thought: z.string(),
  inControl: z.nullable(InControl),
  parts: z.array(PartRef),
  tense: z.nullable(z.number()),
  low: z.nullable(z.number()),
  tired: z.nullable(z.number()),
  pleasantness: z.nullable(z.enum(PLEASANTNESS)),
  feelingEnergy: z.nullable(z.enum(ENERGY)),
});

export type CheckIn = z.infer<typeof CheckIn>;

// What the chart and the day list read, so a bare point is enough.
interface Dated {
  checkedInAt: string | number | Date;
}

export type Charted = Dated & {
  score: number;
  tense?: number | null;
  low?: number | null;
  tired?: number | null;
};

export const PLACES = [
  "Home",
  "Office",
  "Gym",
  "Library",
  "220 Vic",
  "120 Parl",
  "61 Hunt",
  "Transit",
];

// Mood Meter quadrants: each feeling is pleasant or unpleasant, and high or low energy.
const FEELINGS: { pleasantness: string; energy: string; words: string[] }[] = [
  {
    pleasantness: "Pleasant",
    energy: "High",
    words: [
      "Happy",
      "Excited",
      "Joyful",
      "Cheerful",
      "Proud",
      "Hopeful",
      "Optimistic",
      "Enthusiastic",
      "Energized",
      "Curious",
      "Confident",
      "Playful",
      "Inspired",
      "Surprised",
    ],
  },
  {
    pleasantness: "Pleasant",
    energy: "Low",
    words: [
      "Calm",
      "Content",
      "Relaxed",
      "Peaceful",
      "Serene",
      "Grateful",
      "Relieved",
      "Loved",
      "Safe",
      "Satisfied",
      "Comfortable",
      "Thoughtful",
    ],
  },
  {
    pleasantness: "Unpleasant",
    energy: "High",
    words: [
      "Anxious",
      "Stressed",
      "Nervous",
      "Overwhelmed",
      "Afraid",
      "Angry",
      "Furious",
      "Frustrated",
      "Irritated",
      "Jealous",
      "Frantic",
      "Embarrassed",
      "Restless",
      "Tense",
    ],
  },
  {
    pleasantness: "Unpleasant",
    energy: "Low",
    words: [
      "Sad",
      "Lonely",
      "Disappointed",
      "Hopeless",
      "Discouraged",
      "Guilty",
      "Ashamed",
      "Bored",
      "Tired",
      "Exhausted",
      "Numb",
      "Drained",
      "Empty",
      "Hurt",
    ],
  },
];

/** Feelings show one quadrant at a time, so both axes must be picked; dozens at once overwhelm. */
export const feelingsFor = (pleasantness: string, energy: string) =>
  FEELINGS.filter((q) => q.pleasantness === pleasantness && q.energy === energy).flatMap(
    (q) => q.words,
  );

function totalOf(spellings: Map<string, number>) {
  let total = 0;

  for (const uses of spellings.values()) total += uses;

  return total;
}

// The first spelling to reach the top count wins a tie.
function mostUsed(spellings: Map<string, number>) {
  let best = "";
  let bestUses = 0;

  for (const [spelling, uses] of spellings) {
    if (uses <= bestUses) continue;
    best = spelling;
    bestUses = uses;
  }

  return best;
}

/**
 * Typed values stay on offer: the defaults first, then past values, most used first.
 * "Cafe" and "cafe" are one option, shown in its most common spelling.
 */
export function withPast(defaults: string[], past: (string | null | undefined)[]) {
  const known = new Set(defaults.map((d) => d.toLowerCase()));
  const groups = new Map<string, Map<string, number>>();

  for (const raw of past) {
    const value = raw?.trim();

    if (value === undefined || value === "" || known.has(value.toLowerCase())) continue;
    const spellings = groups.get(value.toLowerCase()) ?? new Map<string, number>();

    spellings.set(value, (spellings.get(value) ?? 0) + 1);
    groups.set(value.toLowerCase(), spellings);
  }

  const extra = [...groups]
    .map(([, spellings]) => spellings)
    .toSorted((a, b) => totalOf(b) - totalOf(a))
    .map((spellings) => mostUsed(spellings));

  return [...defaults, ...extra];
}

/** A datetime-local value on Toronto's clock, as the Check-in time inputs edit it. */
export const whenOf = (d: Date) => `${torontoDay(d)}T${torontoTime(d)}`;

// A zone-less "YYYY-MM-DDTHH:MM" is a Toronto wall time.
function wallMs(wall: string) {
  const minutes = minutesOf(wall.slice(11, 16));

  return Date.parse(isoAt(wall.slice(0, 10), minutes));
}

/** The instant a datetime-local value names on Toronto's clock. */
export const instantOfWhen = (when: string) => new Date(wallMs(when)).toISOString();

/** A cleared date or time keeps the Check-in's saved timestamp. */
const checkedInAtFrom = (date: string, time: string) =>
  date === "" || time === "" ? undefined : instantOfWhen(`${date}T${time}`);

const ICON: Record<Zone, string> = { Sun: "☀️", Cloud: "⛅", Rain: "🌧️", Storm: "⚡" };

/** Callers pass an integer score 1-8, so the index is 0-3. */
export function zoneOf(score: number): Zone {
  const zone = ZONES[Math.ceil(score / 2) - 1];

  if (zone === undefined) throw new RangeError(`Score ${score} is outside 1-8`);

  return zone;
}

/**
 * A Check-in with only its score and time, as it stands before any details are added.
 * Every hand-built Check-in starts here, so a new field is added once.
 */
export const blankCheckIn = (score: number, checkedInAt: string): CheckIn => ({
  id: 0,
  checkedInAt,
  zone: zoneOf(score),
  score,
  note: "",
  place: "",
  doing: "",
  thought: "",
  inControl: null,
  parts: [],
  tense: null,
  low: null,
  tired: null,
  pleasantness: null,
  feelingEnergy: null,
});

const halfOf = (score: number): Half => (score % 2 === 0 ? "upper" : "lower");

/** Scores match the old Google Form: each zone has an upper and a lower half. */
export const LEVELS = [8, 7, 6, 5, 4, 3, 2, 1].map((score) => ({
  score,
  zone: zoneOf(score),
  half: halfOf(score),
  icon: ICON[zoneOf(score)],
}));

/** The sleep push stored an empty string for a time it never sent. */
export const SleepNight = z.extend(Night, { sleepEnd: z.string() });

export type SleepNight = z.infer<typeof SleepNight>;

// Bedtime and wake share one scale, so a bar crossing midnight stays one bar.
const sleepBar = (n: SleepNight) =>
  n.sleepStart === "" || n.sleepEnd === ""
    ? []
    : { x: signalAt(n), from: minutesPast18(n.sleepStart), to: minutesPast18(n.sleepEnd) };

// Nights plot at the morning they end, a wall-clock time; a day without an end (activity, or an empty one) at its start.
const signalAt = ({ date, sleepEnd = "" }: { date: string; sleepEnd?: string }) =>
  wallMs(sleepEnd === "" ? `${date}T00:00` : sleepEnd);

export type ChartData<C extends Charted = Charted> = ReturnType<typeof chartData<C>>;

/** "day" is the one Day that `now` falls on. */
export type Days = number | "all" | "day";

const DAY_MS = 86_400_000;
const WEEK = 7;
const MAX_TICKS = 6;
const HOURS_PER_TICK = 3;
const HOURS_PER_DAY = 24;
const SATURDAY = 6;
const SUNDAY = 0;

const dayStartMs = (day: string) => Date.parse(isoAt(day));

// "all" starts at the earliest Check-in, or today when there is none.
function firstDayOf(days: Days, now: Date, earliest: number) {
  if (days === "all") return torontoDay(Math.min(now.getTime(), earliest));

  return shiftDay(torontoDay(now), days === "day" ? 0 : 1 - days);
}

// Built from Toronto hours, so a DST day still ticks at 3 AM, 6 AM and so on.
const hourTicks = (day: string) =>
  Array.from({ length: HOURS_PER_DAY / HOURS_PER_TICK }, (_, i) => {
    const at = Date.parse(isoAt(day, i * HOURS_PER_TICK * 60));

    return {
      value: at,
      label: new Date(at).toLocaleTimeString("en-US", { hour: "numeric", timeZone: TIME_ZONE }),
    };
  });

/**
 * The x axis ends at the end of `now`'s Day and starts `days` Days back ("all" starts at the first check-in).
 * One day gets an hour tick every HOURS_PER_TICK hours; a week or less gets a weekday tick per day;
 * longer ranges get at most MAX_TICKS date ticks.
 * Each mood point keeps its Check-in, so a tap on it can show and find that Check-in.
 */
export function chartData<C extends Charted>(
  checkIns: C[],
  days: Days = WEEK,
  now = new Date(),
  sleep: SleepNight[] = [],
) {
  const points = checkIns
    .map((c) => ({ x: new Date(c.checkedInAt).getTime(), y: c.score, checkIn: c }))
    .toSorted((a, b) => a.x - b.x);

  const ratingPoints = (key: "tense" | "low" | "tired") =>
    checkIns
      .flatMap((c) => {
        const y = c[key];

        return y === null || y === undefined ? [] : { x: new Date(c.checkedInAt).getTime(), y };
      })
      .toSorted((a, b) => a.x - b.x);

  const endDay = shiftDay(torontoDay(now), 1);
  const end = dayStartMs(endDay);

  const firstDay = firstDayOf(days, now, points[0]?.x ?? Infinity);
  const min = dayStartMs(firstDay);

  const spanDays = daysBetween(firstDay, endDay);
  const step = spanDays <= WEEK ? 1 : Math.ceil(spanDays / MAX_TICKS);

  const inRange = <P extends { x: number }>(ps: P[]) => ps.filter((p) => p.x >= min && p.x < end);

  const dayAt = (i: number) => shiftDay(firstDay, i);

  const label = (day: string) =>
    formatDay(day, spanDays <= WEEK ? { weekday: "short" } : { month: "short", day: "numeric" });

  const dayTicks = Array.from({ length: Math.ceil(spanDays / step) }, (_, i) => ({
    value: dayStartMs(dayAt(i * step)),
    label: label(dayAt(i * step)),
  }));

  return {
    min,
    max: end,
    ticks: days === "day" ? hourTicks(firstDay) : dayTicks,
    weekends: Array.from({ length: spanDays }, (_, i) => dayAt(i))
      .filter((d) => dayOfWeek(d) === SATURDAY || dayOfWeek(d) === SUNDAY)
      .map((d) => ({ from: dayStartMs(d), to: dayStartMs(shiftDay(d, 1)) })),
    points: inRange(points),
    tense: inRange(ratingPoints("tense")),
    low: inRange(ratingPoints("low")),
    tired: inRange(ratingPoints("tired")),
    sleep: inRange(sleep.flatMap((n) => sleepBar(n)).toSorted((a, b) => a.x - b.x)),
  };
}

/**
 * The Signal rows inside the chart's axis, and those inside the same number of days just before it ("all" has none before).
 */
export function signalPeriods<N extends { date: string; sleepEnd?: string }>(
  rows: N[],
  days: Days,
  axis: { min: number; max: number },
) {
  const within = (from: number, to: number) =>
    rows.filter((n) => signalAt(n) >= from && signalAt(n) < to);

  const spanDays = Math.round((axis.max - axis.min) / DAY_MS);
  const before = dayStartMs(shiftDay(torontoDay(axis.min), -spanDays));

  return {
    current: within(axis.min, axis.max),
    previous: days === "all" ? [] : within(before, axis.min),
  };
}

/**
 * Newest first, like the API; "all" keeps everything, "day" keeps only `now`'s Day,
 * and a number of days ends with `now`'s day, so a past period drops later Check-ins.
 */
export function checkInsWithin<C extends Dated>(checkIns: C[], days: Days, now = new Date()) {
  if (days === "all") return checkIns;

  if (days === "day") {
    return checkIns.filter((c) => torontoDay(c.checkedInAt) === torontoDay(now));
  }

  const today = torontoDay(now);
  const from = dayStartMs(shiftDay(today, 1 - days));
  const to = dayStartMs(shiftDay(today, 1));

  return checkIns.filter((c) => {
    const at = new Date(c.checkedInAt).getTime();

    return at >= from && at < to;
  });
}

/** The arrows step a whole period: one day for "Day", seven for "Last week" and so on. */
export const periodStep = (days: number | "day") => (days === "day" ? 1 : days);

/** A period never ends after today, even when the page stayed open past midnight. */
export function shiftPeriod(end: string, offset: number, now = new Date()) {
  const shifted = shiftDay(end, offset);
  const today = torontoDay(now);

  return shifted < today ? shifted : today;
}

const shortDate = (day: string) => formatDay(day, { month: "short", day: "numeric" });

/** A period of several days reads as its first and last day, such as "Oct 29 – Nov 4". */
export const periodLabel = (end: string, days: number) =>
  `${shortDate(shiftDay(end, 1 - days))} – ${shortDate(end)}`;

/** The arrows never step past today; `now` is read per call so an app left open overnight moves on. */
export const hasNextDay = (day: string, now = new Date()) => day < torontoDay(now);

/**
 * The list opens on the two weeks up to the newest Check-in, so a gap never opens on an empty list;
 * each "Show older" tap adds two more weeks.
 */
const WINDOW_DAYS = 14;

export function checkInWindow<C extends Dated>(checkIns: C[], pages: number) {
  const newest = checkIns[0];

  if (!newest) return { shown: checkIns, hasOlder: false };

  const shown = checkInsWithin(checkIns, pages * WINDOW_DAYS, new Date(newest.checkedInAt));

  return { shown, hasOlder: shown.length < checkIns.length };
}

/** How many "Show older" pages the list needs before it shows `target`; `checkIns` is newest first. */
export function pagesFor<C extends Dated>(checkIns: C[], target: C) {
  const newest = checkIns[0];

  if (!newest) return 1;

  const days = daysBetween(torontoDay(target.checkedInAt), torontoDay(newest.checkedInAt));

  return Math.max(1, Math.ceil((days + 1) / WINDOW_DAYS));
}

/** A Check-in just after Toronto midnight starts the next Day. */
export function byDay<C extends Dated>(checkIns: C[]) {
  const days = new Map<string, C[]>();

  const newestFirst = checkIns.toSorted(
    (a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
  );

  for (const c of newestFirst) {
    const day = torontoDay(c.checkedInAt);

    days.set(day, [...(days.get(day) ?? []), c]);
  }

  return [...days].map(([day, list]) => ({ day, checkIns: list }));
}

export type DetailField = "place" | "doing" | "feelings" | "note" | "tense" | "low" | "tired";

export type EditField = "time" | "zone" | DetailField;

/** Exact optionals: a patch names only the fields it changes, and stored ones went through JSON, which drops undefined. */
export const CheckInPatch = z.object({
  score: z.exactOptional(CheckIn.shape.score),
  place: z.exactOptional(CheckIn.shape.place),
  doing: z.exactOptional(CheckIn.shape.doing),
  tense: z.exactOptional(CheckIn.shape.tense),
  low: z.exactOptional(CheckIn.shape.low),
  tired: z.exactOptional(CheckIn.shape.tired),
  pleasantness: z.exactOptional(CheckIn.shape.pleasantness),
  feelingEnergy: z.exactOptional(CheckIn.shape.feelingEnergy),
  thought: z.exactOptional(CheckIn.shape.thought),
  inControl: z.exactOptional(CheckIn.shape.inControl),
  parts: z.exactOptional(CheckIn.shape.parts),
  note: z.exactOptional(CheckIn.shape.note),
  checkedInAt: z.exactOptional(CheckIn.shape.checkedInAt),
});

export type CheckInPatch = z.infer<typeof CheckInPatch>;

/** What the edit popovers change; `when` is a datetime-local value in local time. */
export interface CheckInDraft {
  when: string;
  score: number;
  place: string;
  doing: string;
  /** "HH:MM" or ""; what was done is logged, not stored on the Check-in. */
  doingStart: string;
  doingEnd: string;
  tense: number | null;
  low: number | null;
  tired: number | null;
  pleasantness: CheckIn["pleasantness"];
  feelingEnergy: CheckIn["feelingEnergy"];
  feelings: string[];
  note: string;
  inControl: CheckIn["inControl"];
  parts: PartRef[];
}

/** Feelings are stored joined in one column, `thought`. */
export const listOf = (joined: string) => (joined === "" ? [] : joined.split(", "));

const joined = (list: string[]) => list.join(", ");

export function draftOf(c: CheckIn): CheckInDraft {
  return {
    when: whenOf(new Date(c.checkedInAt)),
    score: c.score,
    place: c.place,
    doing: c.doing,
    doingStart: "",
    doingEnd: "",
    tense: c.tense,
    low: c.low,
    tired: c.tired,
    pleasantness: c.pleasantness,
    feelingEnergy: c.feelingEnergy,
    feelings: listOf(c.thought),
    note: c.note,
    inControl: c.inControl,
    parts: c.parts,
  };
}

const DAY_MINUTES = 24 * 60;

/**
 * What "What were you doing?"'s start and end say about its log entry, on the Check-in's Day.
 * An end before the start ran past midnight; a missing time or a zero-length span says nothing.
 */
export function doingSpan({ when, doingStart, doingEnd }: CheckInDraft): LogEntry {
  if (doingStart === "" || doingEnd === "") return {};
  const minutes = (minutesOf(doingEnd) - minutesOf(doingStart) + DAY_MINUTES) % DAY_MINUTES;

  return minutes === 0 ? {} : { date: when.slice(0, 10), start_time: doingStart, minutes };
}

/** A datetime-local value shows only digits, so the form names its day; a half-typed value names none. */
export function weekdayOf(when: string): string {
  return Number.isNaN(Date.parse(`${when}Z`))
    ? ""
    : formatDay(when.slice(0, 10), { weekday: "long" });
}

/** The patch for one edited field, so saving it never touches the others. */
function patchFor(field: EditField, draft: CheckInDraft): CheckInPatch {
  switch (field) {
    case "time": {
      const checkedInAt = checkedInAtFrom(draft.when.slice(0, 10), draft.when.slice(11, 16));

      return checkedInAt === undefined ? {} : { checkedInAt };
    }

    case "zone": {
      return { score: draft.score };
    }

    // The quadrant toggles filter the feeling words, and save with them.
    case "feelings": {
      return {
        thought: joined(draft.feelings),
        pleasantness: draft.pleasantness,
        feelingEnergy: draft.feelingEnergy,
      };
    }

    // "What does it feel like?" asks who is in control and who is present, then for the note.
    case "note": {
      return { inControl: draft.inControl, parts: draft.parts, note: draft.note };
    }

    case "place":
    case "doing":
    case "tense":
    case "low":
    case "tired": {
      return { [field]: draft[field] };
    }
  }
}

/**
 * A form of several fields, such as "Add details", sends only the ones the draft changed,
 * so an untouched time keeps its saved seconds.
 */
export function patchForFields(
  fields: EditField[],
  saved: CheckIn,
  draft: CheckInDraft,
): CheckInPatch {
  const before = draftOf(saved);

  const changed: CheckInPatch = {};

  for (const f of fields) {
    const patch = patchFor(f, draft);

    if (JSON.stringify(patch) !== JSON.stringify(patchFor(f, before)))
      Object.assign(changed, patch);
  }

  return changed;
}

/** "Self", the Part's name, or "" when no one was named. */
export function inControlName(inControl: CheckIn["inControl"]) {
  if (inControl === null) return "";

  return inControl === SELF ? SELF : inControl.name;
}

// Same order as the "Add details" form; Tense, Low and Tired come last because they are the hardest to gauge.
const DETAILS: { field: DetailField; label: string; value: (c: CheckIn) => string }[] = [
  { field: "place", label: "Place", value: (c) => c.place },
  { field: "doing", label: "Doing", value: (c) => c.doing },
  { field: "feelings", label: "Feelings", value: (c) => c.thought },
  { field: "note", label: "In control", value: (c) => inControlName(c.inControl) },
  { field: "note", label: "Present", value: (c) => c.parts.map((part) => part.name).join(", ") },
  { field: "note", label: "Note", value: (c) => c.note },
  { field: "tense", label: "Tense", value: (c) => amountLabel(c.tense) },
  { field: "low", label: "Low", value: (c) => amountLabel(c.low) },
  { field: "tired", label: "Tired", value: (c) => amountLabel(c.tired) },
];

export interface DetailRow {
  field: DetailField;
  label: string;
  value: string;
}

/**
 * Every Check-in has a zone; its details show only once filled.
 * The zone follows the score, so an edited score shows its zone before the reload brings the saved one.
 */
export function checkInRows(c: CheckIn) {
  const details: DetailRow[] = DETAILS.map((d) => ({
    field: d.field,
    label: d.label,
    value: d.value(c),
  }));

  return {
    zone: `${zoneOf(c.score)} (${c.score}/8)`,
    rows: details.filter((d) => d.value !== ""),
    // A field with several rows, such as "note", is missing only when all of them are empty.
    missing: [...new Set(details.map((d) => d.field))].filter((field) =>
      details.every((d) => d.field !== field || d.value === ""),
    ),
  };
}
