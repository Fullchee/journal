import { followingCircle, type Habit } from "@/core";
import { Text } from "@/ui";
import { View } from "react-native";

import { NewSeasonCircleOffer } from "@/components/habits/habit-circle";
import type { HabitsBody } from "@/lib/data/habits";
import { useCircles } from "@/lib/data/circles";

// Today offers this year's Circle only in a Season's first week; the Habit page offers it all Season.
const OFFER_DAYS = 7;

/** "Who you'll see" under a due Habit a Circle follows: its members, never an attendance question. */
export function WhoYoullSee({ habit }: { habit: Habit }) {
  const { data } = useCircles();
  const circle = data ? followingCircle(data.circles, habit.id) : null;

  if (circle === null || circle.members.length === 0) return null;

  return (
    <Text variant="muted" className="mb-2 text-sm" aria-label={`Who you'll see at ${habit.name}`}>
      {`Who you'll see: ${circle.members.map(({ name }) => name).join(", ")}`}
    </Text>
  );
}

/** Each Habit whose Season just started gets one optional tap to start this year's Circle. */
export function SeasonCircleOffers({ body, today }: { body: HabitsBody; today: Date }) {
  return (
    <View className="gap-2">
      {body.habits.map((habit) => (
        <NewSeasonCircleOffer key={habit.id} habit={habit} today={today} withinDays={OFFER_DAYS} />
      ))}
    </View>
  );
}
