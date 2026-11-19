import * as z from "zod/mini";

import { shiftDay } from "./calendar";
import type { Habit } from "./habits-view";
import { openSeason } from "./season";

const CircleMember = z.object({ id: z.number(), name: z.string() });

/**
 * A community I share with Connections. One that follows a recurring Habit (`habitId`) has an Interaction on each of
 * its counted days from `followsFrom` on; `members` are A to Z.
 */
export const Circle = z.object({
  id: z.number(),
  name: z.string(),
  habitId: z.nullable(z.string()),
  followsFrom: z.nullable(z.string()),
  members: z.array(CircleMember),
});

export type Circle = z.infer<typeof Circle>;

export const CirclesBody = z.object({ circles: z.array(Circle) });

type CirclesBody = z.infer<typeof CirclesBody>;

/** A Habit follows the newest Circle linked to it, so last year's team stays as history. */
export const followingCircle = (circles: Circle[], habitId: string): Circle | null =>
  circles.filter((circle) => circle.habitId === habitId).toSorted((a, b) => b.id - a.id)[0] ?? null;

const TRAILING_YEAR = / \d{4}$/;

/** This year's name for a seasonal team: "Shockwave dragon boat 2026" or "Shockwave dragon boat" become "… 2027". */
export const circleNameFor = (name: string, year: string) =>
  `${name.replace(TRAILING_YEAR, "")} ${year}`;

export interface NewSeasonCircle {
  from: Circle;
  name: string;
}

/**
 * The optional "new Circle for this Season": offered while a Season is open that began after the followed Circle
 * did. `withinDays` limits it to the Season's first days, for Today.
 */
export function newSeasonCircle(
  habit: Pick<Habit, "id" | "seasons">,
  circles: Circle[],
  today: string,
  withinDays = Infinity,
): NewSeasonCircle | null {
  const season = openSeason(habit.seasons, today);
  const from = followingCircle(circles, habit.id);
  const followsFrom = from?.followsFrom ?? null;

  if (season === null || from === null || followsFrom === null || followsFrom >= season.start)
    return null;

  if (withinDays !== Infinity && season.start < shiftDay(today, -withinDays + 1)) return null;
  const name = circleNameFor(from.name, today.slice(0, 4));

  return name.toLowerCase() === from.name.toLowerCase() ? null : { from, name };
}
