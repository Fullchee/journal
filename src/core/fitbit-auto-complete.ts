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
