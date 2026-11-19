import { dayOfWeek, daysFrom, formatDay, isoAt, shiftDay } from "./calendar";
import {
  habitDayReader,
  habitDays,
  type DayReading,
  type HabitDay,
  type StreakRecords,
} from "./habit-day";
import type { Habit, Skip } from "./habits-view";

/**
 * How one Day of a Habit's month reads. Each state has its own shape in the calendar, so none relies on colour,
 * and a miss is a neutral tint, never red.
 */
export type CalendarState =
  | "before-start"
  | "future"
  | "done"
  | "missed"
  | "skipped"
  | "rest"
  | "off-season"
  | "not-due"
  | "empty";

export interface CalendarDay {
  date: string;
  state: CalendarState;
  /** The stored count, so a count Habit's sheet starts from it. */
  count: number;
  /** The stored count after one tap, the same cycle as the week row. */
  next: number;
  /** Null unless the Habit is a `duration` Habit. */
  minutes: number | null;
  /** The Skip's cause, only while the Day is still Not done. */
  skip: Skip | null;
}

/** "2026-11" for any Day in November 2026. */
export const monthOf = (day: string) => day.slice(0, 7);

/** The month `by` months after `month`; negative goes back. */
export function shiftMonth(month: string, by: number) {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * The months the calendar can show: from the start date's month to today's, or only today's before the start
 * or with no start date.
 */
export function monthBounds(startDate: string, today: string) {
  const last = monthOf(today);

  return { first: startDate === "" || startDate > today ? last : monthOf(startDate), last };
}

/** "November 2026". */
export const monthLabel = (month: string) =>
  formatDay(`${month}-01`, { month: "long", year: "numeric" });

/** The month's Days in Monday-to-Sunday weeks, with null before the 1st and after the last Day. */
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const days = daysFrom(first, shiftDay(`${shiftMonth(month, 1)}-01`, -1));
  const lead: null[] = Array.from({ length: (dayOfWeek(first) + 6) % 7 }, () => null);
  const cells = [...lead, ...days];
  const trail: null[] = Array.from({ length: (7 - (cells.length % 7)) % 7 }, () => null);
  const padded = [...cells, ...trail];

  return Array.from({ length: padded.length / 7 }, (_, week) =>
    padded.slice(week * 7, week * 7 + 7),
  );
}

// A Day with no done or Not done answer: Rest mode and Seasons read before whether it was due.
function unansweredState(reading: DayReading, { timed }: HabitDay): CalendarState {
  if (reading.rest) return "rest";

  if (!reading.inSeason) return "off-season";

  // A timed day short of its bar still shows its minutes.
  const logged = (timed?.sessions ?? 0) > 0;

  return logged || reading.due ? "empty" : "not-due";
}

// A Rest day and a day outside a Season can still hold a Record, so a done or Not done answer reads first.
function stateOf(
  reading: DayReading,
  habitDay: HabitDay,
  skip: Skip | null,
  today: string,
): CalendarState {
  if (reading.beforeStart) return "before-start";

  if (habitDay.date > today) return "future";

  if (habitDay.status === "done") return "done";

  if (habitDay.status === "missed") return skip === null ? "missed" : "skipped";

  return unansweredState(reading, habitDay);
}

/** Reads each Day of a Habit's month calendar from the same records as its Streak and History; builds the Habit's days once. */
export function calendarReader(
  habit: Habit,
  records: StreakRecords,
  today: string,
): (day: string) => CalendarDay {
  const days = habitDays(habit, records);
  const read = habitDayReader(habit, records);

  return (day) => {
    const habitDay = days.on(new Date(isoAt(day)));
    const reading = read(day);
    const skip = habitDay.status === "missed" ? reading.skip : null;

    return {
      date: day,
      state: stateOf(reading, habitDay, skip, today),
      count: habitDay.count,
      next: habitDay.next,
      minutes: habitDay.timed?.minutes ?? null,
      skip,
    };
  };
}
