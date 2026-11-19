import { useEffect } from "react";

import { useTodayHabits } from "@/lib/data/habits";
import { habitWidgets } from "@/lib/widgets/habit-widgets";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../modules/journal-android";

/**
 * Mount once inside the signed-in app. Pushes today's open Habits and the tile's timed Habit to Android on launch
 * (from the persisted cache) and whenever a check, a save or a new Day changes the Habits.
 */
export function useHabitWidgets() {
  const { data } = useTodayHabits();

  useEffect(() => {
    if (!data) return;
    const pushed = habitWidgets(data, new Date());

    JournalAndroid.setHabits(JSON.stringify(pushed));
  }, [data]);
}
