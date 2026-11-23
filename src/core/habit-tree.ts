import { shiftDay, torontoDay } from "./calendar";
import type { Habit, TreeSpan } from "./habits-view";
import type { RestPeriod } from "./rest-mode";
import type { Season } from "./season";

/** Only a recurring good Habit has a Stage; One-offs, Reference Habits and bad Habits have none. */
export const hasStage = ({ kind, target }: Pick<Habit, "kind" | "target">) =>
  kind === "good" && target.type !== "once" && target.type !== "none";

type TreeFacts = Pick<Habit, "kind" | "target" | "trees" | "seasons">;

const earliest = (days: (string | null)[]) =>
  days.reduce<string | null>(
    (first, day) => (day !== null && (first === null || day < first) ? day : first),
    null,
  );

// The first Rest mode day after `start`, up to today.
function restDayAfter(restPeriods: RestPeriod[], start: string, today: string) {
  const after = shiftDay(start, 1);

  return earliest(
    restPeriods.map((period) => {
      const day = period.start > after ? period.start : after;

      return day <= period.end && day <= today ? day : null;
    }),
  );
}

// The first Season start after `start`, up to today.
const seasonStartAfter = (seasons: Season[], start: string, today: string) =>
  earliest(
    seasons.map((season) => (season.start > start && season.start <= today ? season.start : null)),
  );

/**
 * Each tree span up to today as it really ran: it ends at Slipped, or sooner at the first Rest mode day or Season
 * start after it began, since a changed context is what breaks a habit (ADR 0016). A Habit without a Stage has none.
 */
export function treeSpans(habit: TreeFacts, restPeriods: RestPeriod[], today: string): TreeSpan[] {
  if (!hasStage(habit)) return [];

  return habit.trees
    .filter(({ start }) => start <= today)
    .map(({ start, end }) => ({
      start,
      end: earliest([
        end,
        restDayAfter(restPeriods, start, today),
        seasonStartAfter(habit.seasons, start, today),
      ]),
    }));
}

/** A span's `end` is its first Day back from being a tree. */
export const isTreeOn = (spans: TreeSpan[], day: string) =>
  spans.some(({ start, end }) => start <= day && (end === null || day < end));

/** A tree doesn't ring and leaves Today's due list, but stays loggable on the Habits tab. */
export function isTree(habit: TreeFacts, restPeriods: RestPeriod[], now: Date) {
  const today = torontoDay(now);

  return isTreeOn(treeSpans(habit, restPeriods, today), today);
}
