import type { HabitDay } from "./habit-day";
import { MISSED } from "./habit-day";
import { isOneOff, type Counts, type Habit } from "./habits-view";

/** One answer a tap writes: the Day it lands on, the Habit and the count. A clear is a count of 0. */
export interface HabitAnswer {
  date: string;
  habit: string;
  count: number;
}

/** What a tap answered: the Habit and the Day the screen shows for it. */
interface AnswerTarget {
  habit: Habit;
  day: Pick<HabitDay, "date" | "status">;
}

/**
 * The Day an answer lands on: a One-off's Done on the Day it is tapped and its Not done on its due date;
 * a clear goes where the answer is; any other Habit answers today.
 */
function answerDate({ habit, day }: AnswerTarget, count: number, today: string) {
  if (count === 0) return day.date;

  return count === MISSED && isOneOff(habit) ? habit.startDate : today;
}

/** The checks one tap writes: a One-off holds one answer, so a new answer on another Day clears the old one. */
export function answerChecks(
  target: AnswerTarget,
  count: number,
  today: string,
): [HabitAnswer, ...HabitAnswer[]] {
  const { habit, day } = target;
  const date = answerDate(target, count, today);
  const check = { date, habit: habit.id, count };
  const movesAnswer = count !== 0 && day.status !== "empty" && day.date !== date;

  return movesAnswer ? [{ date: day.date, habit: habit.id, count: 0 }, check] : [check];
}

/** A done or missed check on or after its date answers a One-off; until then it is upcoming or overdue. */
export const isAnswered = ({ id, startDate }: Habit, counts: Counts) =>
  Object.entries(counts).some(([day, byHabit]) => day >= startDate && (byHabit[id] ?? 0) !== 0);
