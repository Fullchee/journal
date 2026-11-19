import { STAGES, type HabitFilters } from "@/core";
import { View } from "react-native";

import { ChoiceChips } from "@/components/habits/form-fields";

const KIND_CHOICES = [
  { id: "", label: "All" },
  { id: "good", label: "Good" },
  { id: "bad", label: "Bad" },
] as const;

const STAGE_CHOICES = [{ id: "", label: "Any stage" } as const, ...STAGES];

interface Props {
  filters: HabitFilters;
  onChange: (next: Partial<HabitFilters>) => void;
  /** A phone stacks the chip groups above the list; a wide screen gives them a column. Chips wrap, so 200% text never clips. */
  isWide: boolean;
}

export function HabitFilterBar({ filters, onChange, isWide }: Props) {
  return (
    <View className={isWide ? "w-56 gap-4" : "gap-2"}>
      <ChoiceChips
        label="Kind"
        options={KIND_CHOICES}
        isSelected={(id) => filters.kind === id}
        onPick={(kind) => onChange({ kind })}
      />
      <ChoiceChips
        label="Stage"
        options={STAGE_CHOICES}
        isSelected={(id) => filters.stage === id}
        onPick={(stage) => onChange({ stage })}
      />
    </View>
  );
}
