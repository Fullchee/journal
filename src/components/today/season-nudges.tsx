import { notThisYear, notYet, seasonNudge, startSeason, torontoDay, type Habit } from "@/core";
import { Button, Text } from "@/ui";
import { View } from "react-native";

import { useIsOnline } from "@/lib/data/data-provider";
import { useSaveHabit, type HabitsBody } from "@/lib/data/habits";

const ANSWERS = [
  {
    label: "Started today",
    patch: (habit: Habit, today: string) => ({ seasons: startSeason(habit.seasons, today) }),
  },
  { label: "Not yet", patch: (_habit: Habit, today: string) => notYet(today) },
  { label: "Not this year", patch: (_habit: Habit, today: string) => notThisYear(today) },
] as const;

/** "Has <Habit> season started?" for each Habit whose Season usually starts about now; online-only. */
export function SeasonNudges({ body, today }: { body: HabitsBody; today: Date }) {
  const save = useSaveHabit();
  const isOnline = useIsOnline();

  const day = torontoDay(today);

  const nudges = body.habits.flatMap((habit) => {
    const question = seasonNudge(habit, day);

    return question === null ? [] : { habit, question };
  });

  if (nudges.length === 0) return null;

  return (
    <View role="list" aria-label="Seasons" className="gap-2 pb-2">
      {nudges.map(({ habit, question }) => (
        <View key={habit.id} role="listitem" className="gap-1">
          <Text>{question}</Text>
          <View className="flex-row flex-wrap gap-2">
            {ANSWERS.map(({ label, patch }) => (
              <Button
                key={label}
                variant="outline"
                size="sm"
                disabled={!isOnline || save.isPending}
                onPress={() => save.mutate({ ...habit, ...patch(habit, day) })}
              >
                <Text>{label}</Text>
              </Button>
            ))}
          </View>
        </View>
      ))}
      {save.isError && <Text className="text-destructive">{"Couldn't save. Try again."}</Text>}
    </View>
  );
}
