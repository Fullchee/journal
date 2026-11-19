import type { Habit } from "@/core";
import { Button, Icon, Text } from "@/ui";
import { Minus, Plus } from "lucide-react-native";
import { View } from "react-native";

import { DaySheet } from "@/components/habits/habit-day-detail";

/** A count Habit's past Day: steps its count up or down, or clears it; each change saves at once. */
export function CountDaySheet({
  habit,
  date,
  count,
  onChange,
  onClose,
}: {
  habit: Habit;
  date: string;
  /** The stored count; a Not done reads as none. */
  count: number;
  onChange: (count: number) => void;
  onClose: () => void;
}) {
  const shown = Math.max(0, count);

  return (
    <DaySheet name={habit.name} date={date} onClose={onClose}>
      <View className="flex-row items-center justify-center gap-6">
        <Button
          variant="outline"
          size="icon"
          aria-label="Fewer"
          className="size-11"
          disabled={shown === 0}
          onPress={() => onChange(shown - 1)}
        >
          <Icon as={Minus} />
        </Button>
        <Text variant="title" aria-label={`Count ${String(shown)}`}>
          {String(shown)}
        </Text>
        <Button
          variant="outline"
          size="icon"
          aria-label="More"
          className="size-11"
          onPress={() => onChange(shown + 1)}
        >
          <Icon as={Plus} />
        </Button>
      </View>
      <View className="flex-row gap-2">
        <Button
          variant="outline"
          className="flex-1"
          disabled={count === 0}
          onPress={() => onChange(0)}
        >
          <Text>Clear</Text>
        </Button>
        <Button className="flex-1" onPress={onClose}>
          <Text>Done</Text>
        </Button>
      </View>
    </DaySheet>
  );
}
