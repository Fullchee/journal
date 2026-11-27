import { clockLabel, dayOfWeek, shiftDay, torontoDay } from "./calendar";
import { habitDays, type HabitDay, type HabitRecords } from "./habit-day";
import { isTree } from "./habit-tree";
import { withOptOutDays } from "./opt-out";
import {
  dayMonthLabel,
  habitTime,
  isOneOff,
  isReference,
  WEEKDAYS,
  type Habit,
} from "./habits-view";

/**
 * `time` is the Habit's time of day as HH:MM, or null when it has none.
 * `dueDate` is a One-off's ISO due date (null for a repeating Habit); `overdue` is true while that date has passed unanswered.
 * `planned` is an Opt-out Habit's day before it counts: it turns done with no tap unless I Skip.
 */
export interface DueHabit {
  habit: Habit;
  day: HabitDay;
  time: string | null;
  dueDate: string | null;
  overdue: boolean;
  planned: boolean;
}

// HH:MM and ISO dates sort as text; a missing one goes after every other.
const byText = (a: string | null, b: string | null) => {
  if (a === b) return 0;

  if (a === null) return 1;

  if (b === null) return -1;

  return a.localeCompare(b);
};

// Overdue One-offs come first, oldest first; then open Habits by time of day; settled ones last.
function byDue(a: DueHabit, b: DueHabit) {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;

  if (a.overdue) return byText(a.dueDate, b.dueDate);

  const settled = Number(a.day.status !== "empty") - Number(b.day.status !== "empty");

  return settled === 0 ? byText(a.time, b.time) : settled;
}

const isOptOutOn = ({ optOutFrom }: Habit, day: string) => optOutFrom !== null && optOutFrom <= day;

/**
 * Today's tracked good Habits and One-offs, leaving out auto-logged ones and trees: overdue One-offs first, then by time of day, with the ones already settled (done or missed) last.
 * A `weekly` Habit stops being due once its week is full, so a Habit done today stays listed either way.
 */
export function dueToday(
  habits: Habit[],
  { counts, durations, restPeriods }: Omit<HabitRecords, "skips">,
  today = new Date(),
): DueHabit[] {
  const records = withOptOutDays(habits, { counts, durations }, today);

  return habits
    .filter(
      (habit) =>
        habit.active &&
        !habit.autoLogged &&
        habit.kind === "good" &&
        !isReference(habit) &&
        !isTree(habit, restPeriods, today),
    )
    .flatMap((habit) => {
      const day = habitDays(habit, records).on(today);
      const dueDate = isOneOff(habit) ? habit.startDate : null;
      const overdue = day.due && dueDate !== null && dueDate < day.date;
      const planned = isOptOutOn(habit, day.date) && day.status === "empty";

      return day.status === "done" || day.due
        ? { habit, day, time: habitTime(habit), dueDate, overdue, planned }
        : [];
    })
    .toSorted(byDue);
}

/** What a Today row's box shows: an overdue One-off's weekday ("Mon"), or "28 Oct" a week or more back; otherwise its time. */
export function dueBox({ time, dueDate, overdue }: DueHabit, today: Date) {
  if (!overdue || dueDate === null) return time === null ? null : clockLabel(time);

  return dueDate > shiftDay(torontoDay(today), -7)
    ? WEEKDAYS[dayOfWeek(dueDate)]
    : dayMonthLabel(dueDate);
}

/** The first date a One-off can move to: a Reschedule must change its date and can't go back before today. */
export function earliestReschedule({ startDate }: Pick<Habit, "startDate">, today: Date) {
  const day = torontoDay(today);

  return startDate < day ? day : shiftDay(startDate, 1);
}
