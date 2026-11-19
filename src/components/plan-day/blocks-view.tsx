import {
  formatDuration,
  plainTaskName,
  poolOf,
  type PlanTask,
  type PoolPlan,
  type Span,
} from "@/core";
import { Markdown, Text } from "@/ui";
import type { ReactNode } from "react";
import { TextInput, View } from "react-native";

import { DayTimeline } from "@/components/plan-day/day-timeline";
import { useIsWide } from "@/hooks/use-is-wide";

interface BlocksViewProps {
  tasks: PlanTask[];
  minutes: Record<string, string>;
  onMinutes: (id: string, value: string) => void;
  /** The calendar's answer: the timeline once busy times are read, else a status or error. */
  calendar: ReactNode;
}

/** Kept tasks with editable minutes beside (web) or above (phone) the day they fill. */
export function BlocksView({ tasks, minutes, onMinutes, calendar }: BlocksViewProps) {
  const isWide = useIsWide();

  return (
    <View className={isWide ? "flex-row gap-6" : "gap-6"}>
      <View className={isWide ? "flex-1 gap-2" : "gap-2"}>
        {tasks.map((task) => (
          <View key={task.id} className="flex-row items-center gap-3">
            <View className="flex-1">
              <Markdown markdown={task.content} testID={`block-task-${task.id}`} />
            </View>
            <TextInput
              aria-label={`Minutes for ${plainTaskName(task.content)}`}
              keyboardType="number-pad"
              inputMode="numeric"
              value={minutes[task.id] ?? ""}
              onChangeText={(value) => onMinutes(task.id, value)}
              className="border-input text-foreground h-11 w-20 rounded-md border px-3 font-sans text-base"
            />
          </View>
        ))}
      </View>
      <View className={isWide ? "flex-1 gap-3" : "gap-3"}>{calendar}</View>
    </View>
  );
}

/** The proposed blocks per pool on the timeline, with whatever didn't fit. */
export function ProposedDay({ pools, busy }: { pools: PoolPlan[]; busy: Span[] }) {
  return (
    <>
      {pools.map(
        (plan) =>
          plan.over > 0 && (
            <Text key={plan.pool} role="alert" className="text-destructive">
              {overMessage(plan)}
            </Text>
          ),
      )}
      <DayTimeline pools={pools} busy={busy} />
    </>
  );
}

function overMessage({ pool, unplaced, over }: PoolPlan) {
  const names = unplaced.flatMap((b) => b.tasks.map((t) => t.content)).join(", ");
  const firstTask = unplaced[0]?.tasks[0];
  const jobHours = firstTask !== undefined && poolOf(firstTask) === "job";

  return [
    `${pool === "job" ? "Job" : "Personal"}: ${formatDuration(over)} over: ${names} fit nowhere.`,
    jobHours && "Job hours are 09:00–17:00 on weekdays.",
    "Lower an estimate or go back and postpone one.",
  ]
    .filter(Boolean)
    .join(" ");
}
