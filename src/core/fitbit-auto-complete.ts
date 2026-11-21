import * as z from "zod/mini";

import { isoAt, shiftDay, torontoDay, torontoTime } from "./calendar";
import { clampMinutes, oncePerStart, type ImportedEntry } from "./csv-import";
import type { Counts, RecordStyle } from "./habits-view";

/** Fitbit's Android package, which Health Connect names as each of its records' `dataOrigin`. */
export const FITBIT_PACKAGE = "com.fitbit.FitbitMobile";

/** Each rule completes one Habit from one kind of Fitbit record. */
export const FITBIT_RULES = ["steps", "sleep", "exercise"] as const;

export type FitbitRule = (typeof FITBIT_RULES)[number];

/** The rules each Record style takes: a Duration Habit logs exercise minutes, and a count Habit takes none. */
export const FITBIT_RULES_BY_RECORD: Record<RecordStyle, readonly FitbitRule[]> = {
  check: FITBIT_RULES,
  duration: ["exercise"],
  count: [],
};

/** The Health Connect record type each rule reads. */
export const FITBIT_RECORD_TYPES = {
  steps: "Steps",
  sleep: "SleepSession",
  exercise: "ExerciseSession",
} as const satisfies Record<FitbitRule, string>;

/** Steps a Day, hours a night, exercise minutes a Day. */
export const FITBIT_DEFAULT_THRESHOLDS: Record<FitbitRule, number> = {
  steps: 8000,
  sleep: 7,
  exercise: 20,
};

const MINUTE_MS = 60_000;

const Instant = z.string().check(z.refine((text) => !Number.isNaN(Date.parse(text))));

/** The fields of a Health Connect SleepSession or ExerciseSession record that a rule needs; the record carries more. */
const Session = z.object({
  startTime: Instant,
  endTime: Instant,
  metadata: z.object({ dataOrigin: z.string() }),
});

type Session = z.infer<typeof Session>;

const StepsRecord = z.extend(Session, { count: z.number() });

const minutesOf = ({ startTime, endTime }: Session) =>
  (Date.parse(endTime) - Date.parse(startTime)) / MINUTE_MS;

// Other apps write the same record types; only Fitbit's count.
function fitbitRecords<Schema extends z.ZodMiniType<Session>>(
  schema: Schema,
  records: readonly unknown[],
): z.infer<Schema>[] {
  return records.flatMap((record) => {
    const parsed = schema.safeParse(record).data;

    return parsed?.metadata.dataOrigin === FITBIT_PACKAGE ? [parsed] : [];
  });
}

interface DayAmount {
  day: string;
  amount: number;
}

const sum = (a: number, b: number) => a + b;

// A Day's steps and exercise add up; a night is one SleepSession, so naps never add to it.
const RULE_AMOUNTS: Record<
  FitbitRule,
  { amounts: (records: readonly unknown[]) => DayAmount[]; combine: typeof sum }
> = {
  steps: {
    amounts: (records) =>
      fitbitRecords(StepsRecord, records).map((record) => ({
        day: torontoDay(record.startTime),
        amount: record.count,
      })),
    combine: sum,
  },
  sleep: {
    amounts: (records) =>
      fitbitRecords(Session, records).map((session) => ({
        day: torontoDay(session.endTime),
        amount: minutesOf(session) / 60,
      })),
    combine: Math.max,
  },
  exercise: {
    amounts: (records) =>
      fitbitRecords(Session, records).map((session) => ({
        day: torontoDay(session.startTime),
        amount: minutesOf(session),
      })),
    combine: sum,
  },
};

/** Fitbit's total for each Toronto Day: steps, the longest sleep ending that Day in hours, or exercise minutes. */
export function fitbitDayTotals(rule: FitbitRule, records: readonly unknown[]) {
  const { amounts, combine } = RULE_AMOUNTS[rule];
  const totals = new Map<string, number>();

  for (const { day, amount } of amounts(records)) {
    const before = totals.get(day);

    totals.set(day, before === undefined ? amount : combine(before, amount));
  }

  return totals;
}

/** What a read needs to complete one Habit from one rule. */
export interface FitbitCompletion {
  rule: FitbitRule;
  records: readonly unknown[];
  threshold: number;
  habit: string;
  /** The first Day to complete; older ones stay as they are. */
  from: string;
  /** Every Habit's answers by Day; a Day already answered, Done or not, is left alone. */
  counts: Counts;
}

/** The Days from `from` on that reach the threshold and the Habit has no answer for yet, earliest first. */
export function fitbitDoneDays({
  rule,
  records,
  threshold,
  habit,
  from,
  counts,
}: FitbitCompletion) {
  const unanswered = (day: string) => (counts[day]?.[habit] ?? 0) === 0;

  return [...fitbitDayTotals(rule, records)]
    .flatMap(([day, total]) => (day >= from && total >= threshold && unanswered(day) ? [day] : []))
    .toSorted((a, b) => a.localeCompare(b));
}

/** Fitbit's exercise sessions from `from` on as Duration entries on their Toronto Day and clock, earliest first. */
export function fitbitExerciseEntries(records: readonly unknown[], from: string): ImportedEntry[] {
  const entries = fitbitRecords(Session, records)
    .map((session) => ({
      date: torontoDay(session.startTime),
      startTime: torontoTime(session.startTime),
      minutes: clampMinutes(minutesOf(session)),
    }))
    .filter(({ date }) => date >= from);

  return oncePerStart(entries);
}

/** The first Day a read completes: the link's Day, or the Day before the last read, whichever is later. */
export function fitbitFirstDay(since: string, lastReadAt: string | null) {
  if (lastReadAt === null) return since;
  const dayBefore = shiftDay(torontoDay(lastReadAt), -1);

  return dayBefore > since ? dayBefore : since;
}

/** Where a Health Connect read starts: a Day early, so the night that ends on the first Day is read whole. */
export const fitbitReadFrom = (firstDay: string) => isoAt(shiftDay(firstDay, -1));

/** A threshold the owner typed, or null when it isn't a number above zero. */
export function fitbitThreshold(text: string) {
  const value = Number(text.trim());

  return text.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Days of Fitbit sessions each upload re-sends, so a session the watch syncs late, or the owner edits or deletes, still lands. */
export const FITBIT_SESSION_DAYS = 14;

const ExerciseRecord = z.extend(Session, {
  exerciseType: z.int(),
  title: z.optional(z.string()),
  metadata: z.object({ id: z.string(), dataOrigin: z.string() }),
});

export type FitbitExerciseRecord = z.infer<typeof ExerciseRecord>;

const DistanceRecord = z.extend(Session, { distance: z.object({ inMeters: z.number() }) });

type DistanceRecord = z.infer<typeof DistanceRecord>;

const IsoDay = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));

const NonNegative = z.number().check(z.gte(0));

/** A Fitbit session as the app uploads it and `fitbit_sessions` stores it; `distanceM` is null when Fitbit wrote no Distance during it. */
const FitbitSession = z.object({
  id: z.string().check(z.minLength(1)),
  exerciseType: z.int(),
  title: z.nullable(z.string()),
  startDate: IsoDay,
  startTime: Instant,
  endTime: Instant,
  durationS: NonNegative,
  distanceM: z.nullable(NonNegative),
});

export type FitbitSession = z.infer<typeof FitbitSession>;

/** One upload: every Fitbit session starting on `from` or later, so a stored one from `from` on that it leaves out is gone. */
export const FitbitSessionUpload = z.object({ from: IsoDay, sessions: z.array(FitbitSession) });

/** Fitbit's ExerciseSession records; other apps' are left out. */
export const fitbitExerciseSessions = (records: readonly unknown[]) =>
  fitbitRecords(ExerciseRecord, records);

// Like Health Connect's own aggregates, a record that straddles the session's start or end counts only for its part inside.
function shareInside(record: DistanceRecord, start: number, end: number) {
  const recordStart = Date.parse(record.startTime);
  const recordEnd = Date.parse(record.endTime);

  if (recordEnd === recordStart) return recordStart >= start && recordStart < end ? 1 : 0;

  return (
    Math.max(0, Math.min(recordEnd, end) - Math.max(recordStart, start)) / (recordEnd - recordStart)
  );
}

/** The session with the Fitbit Distance recorded during it; `distances` may hold other apps' records and ones around it. */
export function fitbitSession(
  session: FitbitExerciseRecord,
  distances: readonly unknown[],
): FitbitSession {
  const start = Date.parse(session.startTime);
  const end = Date.parse(session.endTime);

  let distanceM: number | null = null;

  for (const record of fitbitRecords(DistanceRecord, distances)) {
    const share = shareInside(record, start, end);

    if (share > 0) distanceM = (distanceM ?? 0) + record.distance.inMeters * share;
  }

  return {
    id: session.metadata.id,
    exerciseType: session.exerciseType,
    title: session.title ?? null,
    startDate: torontoDay(session.startTime),
    startTime: session.startTime,
    endTime: session.endTime,
    durationS: (end - start) / 1000,
    distanceM,
  };
}
