/** What just happened: a Habit action, a new Check-in or a Streak milestone. */
export type Moment = "done" | "skip" | "not-done" | "reschedule" | "check-in" | "milestone";

/** The moments that earn a celebration; the rest earn none. */
export type CelebrationKind = Extract<Moment, "done" | "check-in" | "milestone">;

export type Drawing = "sprout" | "leaf";

/** The mini one is a short tick on the row; the big one replaces it with a whole drawing. */
export type Celebration = { size: "mini" } | { size: "big"; drawing: Drawing };

// Variable rewards: the owner's odds (#103). They never depend on zone, score or which Habit.
const BIG_ODDS: Record<Moment, number> = {
  "check-in": 1 / 3,
  done: 1 / 5,
  milestone: 1,
  skip: 0,
  "not-done": 0,
  reschedule: 0,
};

/** `random` answers in [0, 1), like Math.random; the first draw picks the size, the second the drawing. */
export function pickCelebration(kind: CelebrationKind, random?: () => number): Celebration;
export function pickCelebration(moment: Moment, random?: () => number): Celebration | null;
export function pickCelebration(
  moment: Moment,
  random: () => number = Math.random,
): Celebration | null {
  const odds = BIG_ODDS[moment];

  if (odds === 0) return null;

  if (random() >= odds) return { size: "mini" };

  return { size: "big", drawing: random() < 0.5 ? "sprout" : "leaf" };
}
