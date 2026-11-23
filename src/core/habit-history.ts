import { daysFrom, mondayOf, monthDaysOf, shiftDay, torontoDay } from "./calendar";
import { monthLabel } from "./habit-calendar";
import { habitDayReader, type DayReading, type StreakRecords } from "./habit-day";
import { dayMonthLabel, dueDateLabel, type DayNotes, type Habit } from "./habits-view";
import { dayMark, streakFacts, weekSlot, type DayFacts } from "./streak";

/** How History counts a Habit: a day, a week for an N-a-week Habit or a month for an N-a-month one. */
export type HistoryUnit = "day" | "week" | "month";

/**
 * How one period reads: `hit` and `missed` count toward the totals; `open` is today or this week before it is
 * done, and a `rest`, `skipped` or `off-season` period counts as neither.
 */
export type HistoryMark = "hit" | "missed" | "open" | "rest" | "skipped" | "off-season";

export interface HistoryPeriod {
  /** "Mon 9 Nov", "Week of 9 Nov" or "November 2026". */
  label: string;
  /** The day, the Monday of the week or the 1st of the month. */
  start: string;
  mark: HistoryMark;
}

/** A `bad` Habit's period: how many times it was logged, never graded. */
export interface LoggedPeriod {
  label: string;
  start: string;
  logged: number;
}

/** How a Habit went since its start date, newest period first. */
export type HabitHistory =
  | { kind: "good"; unit: HistoryUnit; hits: number; misses: number; periods: HistoryPeriod[] }
  | { kind: "bad"; unit: HistoryUnit; logged: number; periods: LoggedPeriod[] };

// The period follows the Frequency, so a new Frequency adds its unit here.
const UNIT_OF_TARGET = {
  daily: "day",
  days: "day",
  interval: "day",
  weekly: "week",
  monthly: "month",
} as const;

type RecurringType = keyof typeof UNIT_OF_TARGET;

const isRecurring = (type: Habit["target"]["type"]): type is RecurringType =>
  Object.hasOwn(UNIT_OF_TARGET, type);

/** Recurring Habits, good or bad, have a History; One-offs and Reference Habits don't. */
export const hasHistory = ({ target }: Pick<Habit, "target">) => isRecurring(target.type);

const PERIOD_START: Record<Exclude<HistoryUnit, "day">, (day: string) => boolean> = {
  week: (day) => day === mondayOf(day),
  month: (day) => day.endsWith("-01"),
};

/**
 * The period starts from the Habit's start date to today, newest first; a `days` or `interval` Habit's only on
 * its due days. A Habit saved before start dates existed has an empty one, so it has no periods yet.
 */
function periodStarts(
  habit: Habit,
  read: (day: string) => DayReading,
  unit: HistoryUnit,
  today: string,
) {
  if (habit.startDate === "" || habit.startDate > today) return [];

  if (unit !== "day") {
    const first = unit === "week" ? mondayOf(habit.startDate) : `${habit.startDate.slice(0, 7)}-01`;

    return daysFrom(first, today)
      .filter((day) => PERIOD_START[unit](day))
      .toReversed();
  }

  // A Season only decides whether a day counts, so the due days are read without one.
  return daysFrom(habit.startDate, today)
    .filter((day) => read(day).scheduled)
    .toReversed();
}

const PERIOD_LABEL: Record<HistoryUnit, (start: string) => string> = {
  day: dueDateLabel,
  week: (start) => `Week of ${dayMonthLabel(start)}`,
  month: (start) => monthLabel(start.slice(0, 7)),
};

const PERIOD_DAYS: Record<HistoryUnit, (start: string) => string[]> = {
  day: (start) => [start],
  week: (monday) => daysFrom(monday, shiftDay(monday, 6)),
  month: monthDaysOf,
};

/** The notes of one History period, oldest Day first; a week or a month names each note's Day: "Tue 10 Nov: …". */
export const periodNotes = (notes: DayNotes, habit: string, unit: HistoryUnit, start: string) =>
  PERIOD_DAYS[unit](start).flatMap((day) =>
    (notes[day]?.[habit] ?? []).map((note) =>
      unit === "day" ? note : `${dueDateLabel(day)}: ${note}`,
    ),
  );

interface HistoryReader {
  read: (day: string) => DayReading;
  needed: number;
  today: string;
}

// The Streak's day rules decide done and open; any Skip and any day outside a Season count as neither.
function dayHistoryMark({ read, today }: HistoryReader, day: string): HistoryMark {
  const reading = read(day);
  const mark = dayMark(streakFacts(reading), day, today);

  if (mark === "done") return "hit";

  if (mark === "open" || mark === "rest") return mark;

  if (!reading.inSeason) return "off-season";

  return reading.skip === null ? "missed" : "skipped";
}

// The Streak's week or month rule, with every Skip and each day before the start date covering its share of N.
function periodHistoryMark(
  { read, needed, today }: HistoryReader,
  start: string,
  unit: HistoryUnit,
): HistoryMark {
  const days = PERIOD_DAYS[unit](start);

  const coveredFacts = (day: string): DayFacts => {
    const reading = read(day);
    const facts = streakFacts(reading);

    return { ...facts, outside: facts.outside || reading.skip !== null || reading.beforeStart };
  };

  const { status } = weekSlot(days, coveredFacts, needed, today);

  if (status === "done") return "hit";

  if (status !== "covered") return status;

  if (days.every((day) => !read(day).inSeason)) return "off-season";

  return days.some((day) => streakFacts(read(day)).rest) ? "rest" : "skipped";
}

// A count Habit logs its count, a timed one its entries and a check Habit 1 a day.
function loggedOn(habit: Habit, records: StreakRecords, day: string) {
  return habit.record === "duration"
    ? (records.durations[day]?.[habit.id]?.length ?? 0)
    : Math.max(0, records.counts[day]?.[habit.id] ?? 0);
}

function badHistory(
  habit: Habit,
  records: StreakRecords,
  unit: HistoryUnit,
  starts: string[],
): HabitHistory {
  const loggedIn = (start: string) =>
    PERIOD_DAYS[unit](start).reduce((sum, day) => sum + loggedOn(habit, records, day), 0);

  const periods = starts.map((start) => ({
    label: PERIOD_LABEL[unit](start),
    start,
    logged: loggedIn(start),
  }));

  return {
    kind: "bad",
    unit,
    logged: periods.reduce((sum, { logged }) => sum + logged, 0),
    periods,
  };
}

/**
 * A recurring Habit's History from its start date to today, a Toronto day: one period a day (only due days for
 * a `days` or `interval` Habit), a week for an N-a-week Habit or a month for an N-a-month one. Read from the same checks, Skips and Rest periods as the Streak.
 */
export function habitHistory(habit: Habit, records: StreakRecords, now: Date): HabitHistory {
  const today = torontoDay(now);
  const { type } = habit.target;
  const unit: HistoryUnit = isRecurring(type) ? UNIT_OF_TARGET[type] : "day";
  const read = habitDayReader(habit, records);
  const starts = periodStarts(habit, read, unit, today);

  if (habit.kind === "bad") return badHistory(habit, records, unit, starts);

  const reader: HistoryReader = { read, needed: habit.target.count, today };

  const markOf = (start: string) =>
    unit === "day" ? dayHistoryMark(reader, start) : periodHistoryMark(reader, start, unit);

  const periods = starts.map((start) => ({
    label: PERIOD_LABEL[unit](start),
    start,
    mark: markOf(start),
  }));

  return {
    kind: "good",
    unit,
    hits: periods.filter(({ mark }) => mark === "hit").length,
    misses: periods.filter(({ mark }) => mark === "missed").length,
    periods,
  };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const timesLabel = (count: number) => (count === 1 ? "once" : `${count} times`);

/** "42 hit · 9 missed · 82%"; a bad Habit reads "Logged 12 times in 40 days". */
export function historyTotalsLabel(history: HabitHistory) {
  if (history.kind === "bad")
    return `Logged ${timesLabel(history.logged)} in ${plural(history.periods.length, history.unit)}`;

  const { hits, misses } = history;
  const counted = hits + misses;
  const totals = `${hits} hit · ${misses} missed`;

  return counted === 0 ? totals : `${totals} · ${Math.round((hits / counted) * 100)}%`;
}

/** A bad Habit's period, worded neutrally: "logged 3 times", or "not logged". */
export const loggedLabel = (logged: number) =>
  logged === 0 ? "not logged" : `logged ${timesLabel(logged)}`;

export const HISTORY_MARK_LABELS: Record<HistoryMark, string> = {
  hit: "Hit",
  missed: "Missed",
  open: "Still open",
  rest: "Rest, not counted",
  skipped: "Skipped, not counted",
  "off-season": "Out of season, not counted",
};

/** The last 7 periods, oldest first, as the strip draws them. */
export const historyStrip = <Period>(periods: Period[]) => periods.slice(0, 7).toReversed();
