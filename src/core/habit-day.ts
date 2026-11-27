import {
  dayOfWeek,
  daysBetween,
  formatDay,
  isoAt,
  monthDaysOf,
  shiftDay,
  torontoDay,
  weekOf,
} from "./calendar";
import {
  isTimed,
  type Counts,
  type DurationEntry,
  type Durations,
  type Habit,
  type Skip,
  type Skips,
  type TimedHabit,
} from "./habits-view";
import { restPeriodOn, type RestPeriod } from "./rest-mode";
import { isInSeason } from "./season";

/** A stored count of -1 means the day was missed on purpose; zero is never stored. */
export const MISSED = -1;

export type DayStatus = "done" | "missed" | "empty";

/** A `duration` Habit's day, read from its entries against its minutes a day. */
export interface TimedDay {
  minutes: number;
  sessions: number;
  /** Only a `bad` Habit can go over: its minutes a day are a ceiling. */
  over: boolean;
  /** The share of the bar reached, at most 1. */
  progress: number;
  entries: DurationEntry[];
}

/**
 * One Habit on one day. `count` is the stored count, so a tap starts from it; `status` and `due` also read a
 * timed Habit's minutes, so a day that reaches the bar is done and counts toward a weekly target.
 */
export interface HabitDay<Timed extends TimedDay | null = TimedDay | null> {
  date: string;
  count: number;
  status: DayStatus;
  due: boolean;
  /** The stored count after one tap on the day. */
  next: number;
  /** Only a good check or count Habit, or an Opt-out one, can be missed; other Habits treat a -1 as an empty day. */
  canMiss: boolean;
  /** Null unless the Habit is a `duration` Habit. */
  timed: Timed;
}

export interface HabitWeekSummary {
  /** Done days and counts in the Monday-to-Sunday week; a missed day adds nothing. */
  total: number;
  /** What a collapsed Habit shows: name and this week's progress; a Backlog Habit has no week to count. */
  row: { name: string; progress: string; over: boolean };
}

export interface HabitDays<Timed extends TimedDay | null = TimedDay | null> {
  on: (date: Date) => HabitDay<Timed>;
  /** The Monday-to-Sunday week that contains `date`. */
  week: (date: Date) => HabitWeekSummary;
}

type DayRules = Pick<Habit, "kind" | "record" | "optOutFrom">;

/** An Opt-out `duration` Habit is done unless I Skip, so it can be missed like a check Habit. */
export const canMiss = ({ kind, record, optOutFrom }: DayRules) =>
  kind === "good" && (record !== "duration" || optOutFrom !== null);

function dayStatus(habit: DayRules, count: number): DayStatus {
  if (count > 0) return "done";

  return count === MISSED && canMiss(habit) ? "missed" : "empty";
}

// A count Habit adds one per tap, starting over from a missed day; a bad check Habit toggles; a good check Habit cycles blank, done, missed.
function nextCount(habit: DayRules, count: number) {
  if (habit.record === "count") return Math.max(0, count) + 1;

  const status = dayStatus(habit, count);

  if (!canMiss(habit)) return status === "done" ? 0 : 1;

  return { empty: 1, done: MISSED, missed: 0 }[status];
}

// A `good` day is done once its total reaches the bar; a `bad` day counts as soon as anything is logged.
const isTimedDayDone = ({ kind, targetMinutes }: TimedHabit, { minutes, sessions }: TimedDay) =>
  kind === "good" ? minutes >= targetMinutes : sessions > 0;

function timedDay({ kind, targetMinutes }: TimedHabit, entries: DurationEntry[]): TimedDay {
  const minutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);

  return {
    minutes,
    sessions: entries.length,
    over: kind === "bad" && minutes > targetMinutes,
    progress: Math.min(1, minutes / targetMinutes),
    entries,
  };
}

// Week totals and due days read counts, so each done day of a `duration` Habit counts as 1. A Skip wins over the
// entries: the server drops them, and until it answers the cache still holds them.
function withDurations(counts: Counts, habit: Habit, durations: Durations): Counts {
  if (!isTimed(habit)) return counts;
  const merged = { ...counts };

  for (const [date, byHabit] of Object.entries(durations))
    if (
      counts[date]?.[habit.id] !== MISSED &&
      isTimedDayDone(habit, timedDay(habit, byHabit[habit.id] ?? []))
    )
      merged[date] = { ...merged[date], [habit.id]: 1 };

  return merged;
}

const totalIn = (counts: Counts, habitId: string, days: string[]) =>
  days.reduce((sum, d) => sum + Math.max(0, counts[d]?.[habitId] ?? 0), 0);

// An N× a month Habit counts toward its calendar month; every other Habit's row counts its week.
const periodDays = ({ target }: Pick<Habit, "target">, day: string) =>
  target.type === "monthly" ? monthDaysOf(day) : weekOf(day);

// An Every N days Habit is due on its start date and every N days after it, never before.
function isIntervalDay({ target, startDate }: Pick<Habit, "target" | "startDate">, day: string) {
  const gap = daysBetween(startDate, day);

  return gap >= 0 && gap % target.count === 0;
}

function periodTarget(habit: Habit, day: string) {
  const { target } = habit;

  switch (target.type) {
    case "daily": {
      return 7;
    }

    case "weekly":
    case "monthly":
    case "once": {
      return target.count;
    }

    case "days":
    case "none": {
      return target.days.length;
    }

    case "interval": {
      return weekOf(day).filter((d) => isIntervalDay(habit, d)).length;
    }
  }
}

// A One-off is due from its start date until a done or missed check on or after it; a later answer leaves the earlier days overdue.
function isOneOffDueOn({ id, startDate }: Habit, date: Date, counts: Counts) {
  const day = torontoDay(date);

  return (
    day >= startDate &&
    Object.entries(counts).every(
      ([d, byHabit]) => d < startDate || d > day || (byHabit[id] ?? 0) === 0,
    )
  );
}

function onScheduledDay(habit: Pick<Habit, "target" | "startDate">, day: string) {
  const { target } = habit;

  if (target.type === "days") return target.days.includes(dayOfWeek(day));

  return target.type !== "interval" || isIntervalDay(habit, day);
}

/**
 * A day the Habit's schedule says it is due: inside a Season, and for a `days` Habit on one of its fixed weekdays,
 * for an `interval` Habit every N days from its start date.
 * A `weekly` or `monthly` Habit's target and a One-off's answer sit on top of this, in `habitDays`.
 */
export const dueBySchedule = (
  habit: Pick<Habit, "target" | "seasons" | "startDate">,
  day: string,
) => isInSeason(habit.seasons, day) && onScheduledDay(habit, day);

// A `weekly` or `monthly` Habit is due on every day until its period reaches the target, then only the days it
// was recorded. A `bad` Habit is never limited: an occurrence above the ceiling still needs recording.
function isDueOn(habit: Habit, date: Date, counts: Counts) {
  const { target } = habit;
  const day = torontoDay(date);

  if (!dueBySchedule(habit, day)) return false;

  if (target.type === "once") return isOneOffDueOn(habit, date, counts);

  if ((target.type !== "weekly" && target.type !== "monthly") || habit.kind === "bad") return true;

  return totalIn(counts, habit.id, periodDays(habit, day)) < target.count;
}

// An Every N days Habit's next due day on or after `day`; a due day already done moves on to the one after.
function nextDueDay({ id, target, startDate }: Habit, counts: Counts, day: string) {
  if (day < startDate) return startDate;

  const due = shiftDay(
    day,
    (target.count - (daysBetween(startDate, day) % target.count)) % target.count,
  );

  return due === day && (counts[day]?.[id] ?? 0) > 0 ? shiftDay(day, target.count) : due;
}

// A week can hold no due day of an Every N days Habit, so its row names the next due day instead of a weekly count.
function nextDueLabel(habit: Habit, counts: Counts, day: string) {
  const due = nextDueDay(habit, counts, day);

  return due === day
    ? "Due today"
    : `Next due ${formatDay(due, { weekday: "short", month: "short", day: "numeric" })}`;
}

function progressLabel(habit: Habit, total: number, day: string) {
  const period = habit.target.type === "monthly" ? "this month" : "this week";
  const target = periodTarget(habit, day);

  return habit.kind === "bad"
    ? `${total} ${period} (at most ${target})`
    : `${total} of ${target} ${period}`;
}

const rowProgress = (habit: Habit, counts: Counts, total: number, day: string) =>
  habit.target.type === "interval"
    ? nextDueLabel(habit, counts, day)
    : progressLabel(habit, total, day);

/**
 * Everything stored about the Habits' Days: checks, Duration entries, Skips and Rest periods. Today, the Streak,
 * History, Strength, Stage and alarms all read this one shape.
 */
export interface HabitRecords {
  counts: Counts;
  durations: Durations;
  skips: Skips;
  restPeriods: RestPeriod[];
}

/**
 * What the app knows of every Habit's Days: the recent Days at once, the whole history once it loads. Before then
 * `records` hold only the recent Days and no Rest periods, and `whole` is null: a Streak, Stage, Strength, History or
 * tree question read from recent Days alone would be wrong.
 */
export interface KnownRecords {
  records: HabitRecords;
  /** `records`, once they reach back to each Habit's start. */
  whole: HabitRecords | null;
}

/** What decides a Day's count and status. */
export type DayRecords = Pick<HabitRecords, "counts" | "durations">;

/** Everything a screen shows about one Habit's days, read from the stored counts and Duration entries. */
export function habitDays(habit: TimedHabit, records: DayRecords): HabitDays<TimedDay>;
export function habitDays(habit: Habit, records: DayRecords): HabitDays;
export function habitDays(habit: Habit, { counts, durations }: DayRecords): HabitDays {
  const reached = withDurations(counts, habit, durations);

  return {
    on(date) {
      const day = torontoDay(date);
      const count = counts[day]?.[habit.id] ?? 0;

      return {
        date: day,
        count,
        status: dayStatus(habit, reached[day]?.[habit.id] ?? 0),
        due: isDueOn(habit, date, reached),
        next: nextCount(habit, count),
        canMiss: canMiss(habit),
        timed: isTimed(habit) ? timedDay(habit, durations[day]?.[habit.id] ?? []) : null,
      };
    },
    week(date) {
      const day = torontoDay(date);
      const periodTotal = totalIn(reached, habit.id, periodDays(habit, day));

      return {
        total: totalIn(reached, habit.id, weekOf(day)),
        row: {
          name: habit.name,
          progress: habit.active ? rowProgress(habit, reached, periodTotal, day) : "Backlog",
          // A `bad` Habit is over when it happens more often than its ceiling.
          over: habit.active && habit.kind === "bad" && periodTotal > periodTarget(habit, day),
        },
      };
    },
  };
}

/**
 * One Day of a Habit, as the Streak, History, Strength, Calendar and Pillar bar all read it. Each turns these
 * facts into its own mark; none of them decides due, Season, Rest mode or Skip on its own.
 */
export interface DayReading {
  /** On the Habit's fixed weekdays or every N days, whatever its Season. */
  scheduled: boolean;
  inSeason: boolean;
  /** Scheduled and in a Season. */
  due: boolean;
  beforeStart: boolean;
  rest: boolean;
  /** The Day's Skip when it has a cause; a Skip with no cause is a plain not-done day. */
  skip: Skip | null;
  done: boolean;
  /** Toward a week's N: a count Habit's count, otherwise 1 when done. */
  value: number;
}

/** Reads each Day of one Habit from its records; builds the Habit's days once. */
export function habitDayReader(habit: Habit, records: HabitRecords): (day: string) => DayReading {
  const days = habitDays(habit, records);

  return (day) => {
    const done = days.on(new Date(isoAt(day))).status === "done";
    const scheduled = onScheduledDay(habit, day);
    const inSeason = isInSeason(habit.seasons, day);

    return {
      scheduled,
      inSeason,
      due: scheduled && inSeason,
      beforeStart: day < habit.startDate,
      rest: restPeriodOn(records.restPeriods, day) !== null,
      skip: records.skips[day]?.[habit.id] ?? null,
      done,
      value: Number(done && habit.record === "count" ? records.counts[day]?.[habit.id] : done),
    };
  };
}

/** A Habit done on one Day, by name. */
export interface HabitDone {
  date: string;
  name: string;
}

/**
 * Each Day from `from` to `to`, inclusive, that a Habit was done by the tracker's rule, oldest first.
 * One-offs have their own section, so they are left out.
 */
export function habitsDone(
  habits: Habit[],
  { counts, durations }: DayRecords,
  from: string,
  to: string,
): HabitDone[] {
  const doneDays = (habit: Habit) =>
    Object.entries(withDurations(counts, habit, durations))
      .filter(
        ([date, byHabit]) =>
          date >= from && date <= to && dayStatus(habit, byHabit[habit.id] ?? 0) === "done",
      )
      .map(([date]) => ({ date, name: habit.name }));

  return habits
    .filter(({ target }) => target.type !== "once")
    .flatMap((habit) => doneDays(habit))
    .toSorted((a, b) => a.date.localeCompare(b.date));
}

/** "45 min", "2 h" or "1 h 30 min". */
export function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest} min`;

  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** A tracker cell is about 2.75rem wide, so it shows "45m", "2h" or "1h30". */
export function shortMinutes(minutes: number) {
  if (minutes === 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}m`;

  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}

const timesLabel = (sessions: number) => (sessions === 1 ? "once" : `${sessions} times`);

/** "2 h · 3 times"; an empty day reads "Nothing logged". */
export const durationSummary = ({ minutes, sessions }: Pick<TimedDay, "minutes" | "sessions">) =>
  sessions === 0 ? "Nothing logged" : `${minutesLabel(minutes)} · ${timesLabel(sessions)}`;

/**
 * The bar reads as a goal for a `good` Habit and a ceiling for a `bad` one, as a collapsed row does for the week.
 */
export const durationBarLabel = ({
  kind,
  targetMinutes,
}: Pick<TimedHabit, "kind" | "targetMinutes">) =>
  `${kind === "bad" ? "at most" : "goal"} ${minutesLabel(targetMinutes)}`;

/** Names one logged entry of a `duration` Habit. */
export interface EntryRef {
  date: string;
  habit: string;
  id: number;
}

/** The durations with one entry removed; the rest keep their order. */
export const withoutEntry = (durations: Durations, { date, habit, id }: EntryRef): Durations => ({
  ...durations,
  [date]: {
    ...durations[date],
    [habit]: (durations[date]?.[habit] ?? []).filter((entry) => entry.id !== id),
  },
});
