import { Button, Text } from "@/ui";
import { View } from "react-native";

export interface Choice<T> {
  value: T;
  label: string;
}

/** One labelled row of radio buttons; the picked one is filled. */
export function ChoiceRow<T>({
  legend,
  choices,
  selected,
  onPick,
}: {
  legend: string;
  choices: Choice<T>[];
  selected: T;
  onPick: (value: T) => void;
}) {
  return (
    <View role="radiogroup" aria-label={legend} className="gap-1.5">
      <Text variant="muted">{legend}</Text>
      <View className="flex-row flex-wrap gap-2">
        {choices.map(({ value, label }) => (
          <Button
            key={label}
            size="sm"
            className="h-11"
            role="radio"
            aria-checked={value === selected}
            variant={value === selected ? "default" : "outline"}
            onPress={() => onPick(value)}
          >
            <Text>{label}</Text>
          </Button>
        ))}
      </View>
    </View>
  );
}
