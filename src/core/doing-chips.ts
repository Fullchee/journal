import type { CheckIn } from "./check-in-view";
import { fitsPlace } from "./habit-places";
import { isTimed, type Habit } from "./habits-view";

const key = (name: string) => name.trim().toLowerCase();

/**
 * "What were you doing?" offers only active Timed Habits: a quick `check` Habit (meds) is not an activity.
 * Only the ones that fit the Check-in's place, or all of them when none fits.
 * Most named in past Check-ins first; ties keep the Habits' own order.
 */
export function doingHabitNames(
  habits: Habit[],
  checkIns: Pick<CheckIn, "doing">[],
  place: string,
) {
  const uses = new Map<string, number>();

  for (const { doing } of checkIns) uses.set(key(doing), (uses.get(key(doing)) ?? 0) + 1);

  const usesOf = (h: Habit) => uses.get(key(h.name)) ?? 0;
  const timed = habits.filter((h) => h.active && isTimed(h));
  const fitting = timed.filter((h) => fitsPlace(h, place));

  return (fitting.length > 0 ? fitting : timed)
    .toSorted((a, b) => usesOf(b) - usesOf(a))
    .map((h) => h.name);
}
