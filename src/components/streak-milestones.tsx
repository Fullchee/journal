import { reachedMilestone } from "@/core";
import { useEffect, useRef } from "react";

import { useCelebrate } from "@/components/celebration";
import { useHabitTracker } from "@/lib/data/habits";
import { useCheckInStreak, useHabitStreaks } from "@/lib/data/streaks";

const CHECK_IN = "check-in";

// The Habits tab's query, so a tap's optimistic count moves the Streak at once.
function useCurrentStreaks(now: Date) {
  const { data } = useHabitTracker();
  const streakOf = useHabitStreaks(data ?? { habits: [] }, now);
  const checkIn = useCheckInStreak(now);
  const currents = new Map<string, number>();
  const habits = data?.habits ?? [];

  for (const habit of habits) {
    const streak = streakOf(habit);

    if (streak) currents.set(habit.id, streak.current);
  }

  if (checkIn) currents.set(CHECK_IN, checkIn.current);

  return currents;
}

/**
 * Plays the big celebration when a Habit's Streak or the Check-in Streak reaches 7, 30, 100 or 365.
 * Mounted once under the tabs, so a tap on Today or the Habits tab celebrates once. A Streak seen for the first time
 * never celebrates: loading isn't reaching.
 */
export function StreakMilestones() {
  const { celebrate } = useCelebrate();
  // eslint-disable-next-line eslint-react/purity -- Streaks count up to today, so each render reads the clock
  const currents = useCurrentStreaks(new Date());
  const seenRef = useRef(new Map<string, number>());

  useEffect(() => {
    for (const [id, after] of currents) {
      const before = seenRef.current.get(id);

      if (before !== undefined && reachedMilestone(before, after) !== null)
        celebrate({ kind: "milestone", target: id });
    }

    seenRef.current = currents;
  }, [currents, celebrate]);

  return null;
}
