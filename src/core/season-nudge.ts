import { shiftDay } from "./calendar";
import { TRACKED_TARGET_TYPES, type Habit } from "./habits-view";
import { openSeason } from "./season";

const NUDGE_LEAD_DAYS = 14;

const NUDGE_EVERY_DAYS = 7;

// Date.UTC rolls Feb 29 over to Mar 1 in a year without it.
function sameDayIn(year: number, day: string) {
  const ms = Date.UTC(year, Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

  return new Date(ms).toISOString().slice(0, 10);
}

const yearOf = (day: string) => Number(day.slice(0, 4));

const isRecurring = ({ target }: Pick<Habit, "target">) =>
  TRACKED_TARGET_TYPES.some((type) => type === target.type);

/**
 * Today's "Has <Habit> season started?", from 14 days before last year's start day until a Season starts this year
 * (or one is typed in ahead); Not yet and Not this year quiet it through `seasonQuietUntil`.
 */
export function seasonNudge(
  habit: Pick<Habit, "name" | "active" | "target" | "seasons" | "seasonQuietUntil">,
  today: string,
) {
  const { seasons, seasonQuietUntil } = habit;
  const year = yearOf(today);
  const lastYear = seasons.findLast(({ start }) => yearOf(start) === year - 1);

  if (lastYear === undefined || !habit.active || !isRecurring(habit)) return null;

  const isQuiet = seasonQuietUntil !== null && today <= seasonQuietUntil;
  const started = seasons.some(({ start }) => yearOf(start) === year);

  if (isQuiet || started || openSeason(seasons, today) !== null) return null;

  return today < shiftDay(sameDayIn(year, lastYear.start), -NUDGE_LEAD_DAYS)
    ? null
    : `Has ${habit.name} season started?`;
}

/** Not yet: Today asks again a week later. */
export const notYet = (today: string): Pick<Habit, "seasonQuietUntil"> => ({
  seasonQuietUntil: shiftDay(today, NUDGE_EVERY_DAYS - 1),
});

/** Not this year: Today stops asking until next year. */
export const notThisYear = (today: string): Pick<Habit, "seasonQuietUntil"> => ({
  seasonQuietUntil: `${yearOf(today)}-12-31`,
});
