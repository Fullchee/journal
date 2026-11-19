import { inTracker, repairPrompt } from "@/core";
import { Text } from "@/ui";
import { View } from "react-native";

import type { HabitsBody } from "@/lib/data/habits";
import { useHabitStreaks } from "@/lib/data/streaks";

/** One line per Habit whose latest break can still be repaired; each goes silently once its window closes. */
export function RepairPrompts({ body, today }: { body: HabitsBody; today: Date }) {
  const streakOf = useHabitStreaks(body, today);

  const prompts = body.habits.flatMap((habit) => {
    const streak = habit.active && inTracker(habit) ? streakOf(habit) : null;
    const prompt = streak === null ? null : repairPrompt(habit.name, streak);

    return prompt === null ? [] : { id: habit.id, prompt };
  });

  if (prompts.length === 0) return null;

  return (
    <View role="list" aria-label="Repairs" className="gap-1 pb-2">
      {prompts.map(({ id, prompt }) => (
        <Text key={id} role="listitem" variant="muted">
          {prompt}
        </Text>
      ))}
    </View>
  );
}
