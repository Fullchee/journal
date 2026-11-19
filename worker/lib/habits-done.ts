import { habitsDone } from "@/core";
import type { Env } from "@worker/lib/env";
import { readHabits, readRecords } from "@worker/lib/habit-records";

/** Each day a Habit was done between `from` and `to`, inclusive, oldest first; with no `to` it runs to the latest row. */
export async function readHabitsDone(env: Env, from: string, to = "9999-12-31") {
  const [habits, records] = await Promise.all([
    readHabits(env),
    readRecords(env, from, new Date()),
  ]);

  return habitsDone(habits, records, from, to);
}
