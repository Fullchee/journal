import { clockLabel, formatMinutes } from "@/core";
import { View } from "react-native";

import { Button } from "./button";
import { Text } from "./text";

/** Minutes after midnight, with each task's title. */
export interface PlanNextBlock {
  start: number;
  end: number;
  tasks: string[];
}

export interface PlanNextProps {
  blocks: PlanNextBlock[];
  /** Set when the plan is for a later day than today. */
  day?: string | null;
  /** Offline, the blocks come from the stored plan and may be out of date. */
  offline?: boolean;
  onOpenPlan: () => void;
}

/** Today's summary of the day plan: the next one or two blocks, or a way in to plan the day. */
export function PlanNext({ blocks, day, offline = false, onOpenPlan }: PlanNextProps) {
  if (blocks.length === 0) {
    return (
      <Button variant="outline" className="self-start" onPress={onOpenPlan}>
        <Text>Plan the day</Text>
      </Button>
    );
  }

  return (
    <View className="gap-2">
      <Text variant="muted">
        {day === undefined || day === null || day === ""
          ? "Next on the plan"
          : `Planned for ${day}`}
      </Text>
      {blocks.map((block) => (
        <View
          key={block.start}
          className="border-border bg-card flex-row gap-3 rounded-md border p-3"
        >
          <Text className="font-sans-bold">
            {clockLabel(formatMinutes(block.start))}–{clockLabel(formatMinutes(block.end))}
          </Text>
          <Text className="flex-1">{block.tasks.join(", ")}</Text>
        </View>
      ))}
      {offline && <Text variant="muted">Offline: this is the plan as last saved.</Text>}
      <Button variant="link" className="self-start px-0" onPress={onOpenPlan}>
        <Text>Open the plan</Text>
      </Button>
    </View>
  );
}
