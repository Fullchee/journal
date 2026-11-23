import { daysBetween, shiftDay, torontoDay } from "./calendar";
import type { StreakRecords } from "./habit-day";
import { habitStrength } from "./habit-strength";
import { hasStage, isTree, treeSpans } from "./habit-tree";
import type { Habit, Stage } from "./habits-view";

// Strength bands from ADR 0016: below 50% seed, 50–80% sprout, 80% and up plant.
const SPROUT_FROM = 0.5;
const PLANT_FROM = 0.8;

// A tree needs near-perfect consistency over at least 66 days, the median time to automaticity (Lally 2010).
const TREE_STRENGTH = 0.95;
const TREE_AGE_DAYS = 66;

/** Not yet, or a fall back from tree, hides the tree question for this many days. */
export const TREE_WAIT_DAYS = 30;

// No counted period yet reads as seed.
function strengthStage(strength: number | null): Stage {
  if (strength === null || strength < SPROUT_FROM) return "seed";

  return strength < PLANT_FROM ? "sprout" : "plant";
}

/**
 * A Habit's Stage: tree while a yes holds, otherwise its Strength band. Null for a Habit without a Stage. The one
 * source for every screen, alarm, filter and the Worker.
 */
export function habitStage(habit: Habit, records: StreakRecords, now: Date): Stage | null {
  if (!hasStage(habit)) return null;

  if (isTree(habit, records.restPeriods, now)) return "tree";

  return strengthStage(habitStrength(habit, records, now));
}

// Not yet's Day, or 30 days after the latest tree span ended, whichever is later.
function asksFrom(habit: Habit, records: StreakRecords, today: string) {
  const ended = treeSpans(habit, records.restPeriods, today).at(-1)?.end ?? null;
  const afterFall = ended === null ? "" : shiftDay(ended, TREE_WAIT_DAYS);
  const notYet = habit.treeAskFrom ?? "";

  return notYet > afterFall ? notYet : afterFall;
}

/** The card asks "Do you do this without thinking?" once Strength reaches 95% and the Habit is 66 days old. */
export function asksTreeQuestion(habit: Habit, records: StreakRecords, now: Date) {
  // The cheap checks go first: Strength replays the Habit's whole History.
  if (!hasStage(habit) || !habit.active || habit.startDate === "") return false;

  const today = torontoDay(now);

  if (
    daysBetween(habit.startDate, today) < TREE_AGE_DAYS ||
    today < asksFrom(habit, records, today) ||
    isTree(habit, records.restPeriods, now)
  )
    return false;

  return (habitStrength(habit, records, now) ?? 0) >= TREE_STRENGTH;
}

export const TREE_ANSWERS = ["yes", "not-yet", "slipped"] as const;

export type TreeAnswer = (typeof TREE_ANSWERS)[number];

/**
 * The tree fields after an answer: yes makes it a tree from today, Not yet hides the question for 30 days and
 * Slipped ends the tree today. Null when the card wouldn't offer that answer now.
 */
export function answerTree(
  habit: Habit,
  answer: TreeAnswer,
  records: StreakRecords,
  now: Date,
): Pick<Habit, "trees" | "treeAskFrom"> | null {
  const today = torontoDay(now);
  const { trees, treeAskFrom } = habit;

  if (answer === "slipped")
    return isTree(habit, records.restPeriods, now)
      ? {
          trees: trees.map((span) => (span.end === null ? { ...span, end: today } : span)),
          treeAskFrom,
        }
      : null;

  if (!asksTreeQuestion(habit, records, now)) return null;

  return answer === "yes"
    ? { trees: [...trees, { start: today, end: null }], treeAskFrom }
    : { trees, treeAskFrom: shiftDay(today, TREE_WAIT_DAYS) };
}
