import { daysFrom, isoAt, torontoDay, torontoTime } from "./calendar";
import { habitDays, type DayRecords } from "./habit-day";
import { habitTime, type Habit, type Target } from "./habits-view";

/** Opt-out needs fixed due days: a `weekly` or `monthly` Habit has none, and a `bad` Habit is never done by default. */
export const canOptOut = ({
  kind,
  target,
}: Pick<Habit, "kind"> & { target: Pick<Target, "type"> }) =>
  kind === "good" &&
  (target.type === "daily" || target.type === "days" || target.type === "interval");

/** One day an Opt-out Habit counts as done: a check, or for a `duration` Habit one entry of `minutes`. */
export interface OptOutLog {
  date: string;
  habit: string;
  startTime: string;
  /** The usual length; null unless the Habit is a `duration` Habit. */
  minutes: number | null;
}

const UNTIMED_START = "00:00";

// A timed day counts from its time on; an untimed one only once the day is over.
function hasPassed(day: string, time: string | null, now: Date) {
  const today = torontoDay(now);

  return day < today || (day === today && time !== null && torontoTime(now) >= time);
}

/**
 * Each due day from when the Habit became Opt-out up to `now` that has passed with nothing stored: no check,
 * no Skip and no Duration entry. Empty for a Habit that isn't Opt-out.
 */
export function optOutLogs(habit: Habit, records: DayRecords, now: Date): OptOutLog[] {
  const { optOutFrom } = habit;

  if (optOutFrom === null) return [];
  const first = habit.startDate > optOutFrom ? habit.startDate : optOutFrom;
  const time = habitTime(habit);
  const days = habitDays(habit, records);
  const minutes = habit.record === "duration" ? habit.usualMinutes : null;

  return daysFrom(first, torontoDay(now)).flatMap((date) => {
    const day = days.on(new Date(isoAt(date)));
    const answered = day.count !== 0 || (day.timed?.sessions ?? 0) > 0;

    return !answered && day.due && hasPassed(date, time, now)
      ? { date, habit: habit.id, startTime: time ?? UNTIMED_START, minutes }
      : [];
  });
}

// A counted day before the server stores it has no row id yet.
const UNSAVED_ENTRY = -1;

function withLog(
  { counts, durations }: DayRecords,
  { date, habit, startTime, minutes }: OptOutLog,
): DayRecords {
  if (minutes === null)
    return { counts: { ...counts, [date]: { ...counts[date], [habit]: 1 } }, durations };

  const entry = { id: UNSAVED_ENTRY, startTime, minutes };

  return { counts, durations: { ...durations, [date]: { ...durations[date], [habit]: [entry] } } };
}

/** The records with every Opt-out day that has passed counted, as the server stores them on its next read. */
export const withOptOutDays = (habits: Habit[], records: DayRecords, now: Date): DayRecords =>
  habits
    .flatMap((habit) => optOutLogs(habit, records, now))
    .reduce((next, log) => withLog(next, log), records);
