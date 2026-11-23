import { daysFrom, monthDaysOf, shiftDay, torontoDay } from "./calendar";
import {
  habitHistory,
  type HistoryMark,
  type HistoryPeriod,
  type HistoryUnit,
  type LoggedPeriod,
} from "./habit-history";
import { habitDayReader, type StreakRecords } from "./habit-day";
import { isTreeOn, treeSpans } from "./habit-tree";
import { isTimed, type Habit, type TimedHabit } from "./habits-view";

// Loop scores a monthly Habit over an average month.
const MONTH_DAYS = 365.25 / 12;

const DAY_RATE: Partial<Record<Habit["target"]["type"], (target: Habit["target"]) => number>> = {
  days: (target) => target.days.length / 7,
  interval: (target) => 1 / target.count,
};

/** How often a Habit is due per day, as Loop's `frequency`; a new History unit adds its own rule here. */
const PER_DAY: Record<HistoryUnit, (target: Habit["target"]) => number> = {
  day: (target) => DAY_RATE[target.type]?.(target) ?? 1,
  week: (target) => target.count / 7,
  month: (target) => target.count / MONTH_DAYS,
};

/** One History period's length in days: a due day of a `days` Habit stands for 7 ÷ its weekdays. */
const PERIOD_DAYS: Record<HistoryUnit, (perDay: number) => number> = {
  day: (perDay) => 1 / perDay,
  week: () => 7,
  month: () => MONTH_DAYS,
};

/**
 * Loop's daily multiplier, 0.5 ^ (√frequency / 13), raised to one period's days, so a week-long period decays as
 * much as its 7 days would.
 */
function periodMultiplier(habit: Habit, unit: HistoryUnit) {
  const perDay = PER_DAY[unit](habit.target);

  return 0.5 ** ((Math.sqrt(perDay) * PERIOD_DAYS[unit](perDay)) / 13);
}

/** A bad Habit's limit per History period: once a day, or N a week or a month. */
const LIMIT: Record<HistoryUnit, (target: Habit["target"]) => number> = {
  day: () => 1,
  week: (target) => target.count,
  month: (target) => target.count,
};

const PERIOD_DAY_LIST: Record<HistoryUnit, (start: string) => string[]> = {
  day: (start) => [start],
  week: (monday) => daysFrom(monday, shiftDay(monday, 6)),
  month: monthDaysOf,
};

// A timed bad Habit stays under when no day passes its minutes and its days with entries fit the limit.
function timedUnder(habit: TimedHabit, records: StreakRecords, days: string[], limit: number) {
  const entries = days.map((day) => records.durations[day]?.[habit.id] ?? []);
  const minutes = entries.map((dayEntries) => dayEntries.reduce((sum, e) => sum + e.minutes, 0));

  return (
    minutes.every((total) => total <= habit.targetMinutes) &&
    entries.filter((dayEntries) => dayEntries.length > 0).length <= limit
  );
}

/** 1 for a hit, 0 for a miss; null leaves the Strength as it was. */
export type Completion = 1 | 0 | null;

const MARK_COMPLETION: Record<HistoryMark, Completion> = {
  hit: 1,
  missed: 0,
  open: null,
  rest: null,
  skipped: null,
  "off-season": null,
};

function badCompletions(
  habit: Habit,
  records: StreakRecords,
  unit: HistoryUnit,
  periods: LoggedPeriod[],
): Completion[] {
  const limit = LIMIT[unit](habit.target);
  const read = habitDayReader(habit, records);

  // A Skip, a Rest day or a day outside a Season pauses a bad Habit's day, as it does a good Habit's.
  const isPaused = (day: string) => {
    const { skip, rest, inSeason } = read(day);

    return skip !== null || rest || !inSeason;
  };

  // Going over always counts; staying under counts unless every day of the period was paused.
  return periods.map(({ start, logged }, index) => {
    const days = PERIOD_DAY_LIST[unit](start);
    const under = isTimed(habit) ? timedUnder(habit, records, days, limit) : logged <= limit;

    if (!under) return 0;

    // The newest period is today or this week: it counts only once it is over the limit.
    if (index === 0 || days.every((day) => isPaused(day))) return null;

    return 1;
  });
}

// A tree's period with nothing logged is frozen like a Skip: logging every automatic Habit would be routine input.
function goodCompletions(
  habit: Habit,
  records: StreakRecords,
  { unit, periods }: { unit: HistoryUnit; periods: HistoryPeriod[] },
  now: Date,
): Completion[] {
  const spans = treeSpans(habit, records.restPeriods, torontoDay(now));

  const logged = (day: string) =>
    (records.counts[day]?.[habit.id] ?? 0) !== 0 ||
    (records.durations[day]?.[habit.id] ?? []).length > 0;

  const frozen = (start: string) => {
    const days = PERIOD_DAY_LIST[unit](start);

    return days.some((day) => isTreeOn(spans, day)) && days.every((day) => !logged(day));
  };

  return periods.map(({ start, mark }) =>
    mark === "missed" && frozen(start) ? null : MARK_COMPLETION[mark],
  );
}

/** One History period, graded: a good Habit by its mark, a bad one by whether it stayed within its limit. */
export interface GradedPeriod {
  start: string;
  completion: Completion;
}

/** A recurring Habit's History periods, newest first, graded the way Strength and the Pillar bar count them. */
export function gradedHistory(habit: Habit, records: StreakRecords, now: Date) {
  const history = habitHistory(habit, records, now);

  const completions =
    history.kind === "good"
      ? goodCompletions(habit, records, history, now)
      : badCompletions(habit, records, history.unit, history.periods);

  const periods: GradedPeriod[] = history.periods.map(({ start }, index) => ({
    start,
    completion: completions[index] ?? null,
  }));

  return { unit: history.unit, periods };
}

/**
 * A recurring Habit's Strength from 0 to 1, read from its History with Loop's decaying score: each hit or miss
 * moves it toward 1 or 0 and every other period leaves it as it was. Null before its first counted period.
 */
export function habitStrength(habit: Habit, records: StreakRecords, now: Date): number | null {
  const history = gradedHistory(habit, records, now);

  const counted = history.periods
    .map(({ completion }) => completion)
    .filter((completion) => completion !== null)
    .toReversed();

  if (counted.length === 0) return null;

  const multiplier = periodMultiplier(habit, history.unit);

  return counted.reduce<number>(
    (score, completion) => score * multiplier + (1 - multiplier) * completion,
    0,
  );
}

/** "Strength 64%". */
export const strengthLabel = (strength: number) => `Strength ${Math.round(strength * 100)}%`;
