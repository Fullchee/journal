import {
  plainTaskName,
  type Choices,
  type Disposition,
  type PlanTask,
  type Proposal,
} from "@/core";
import { Button, Markdown, Text } from "@/ui";
import { View } from "react-native";

const OPTIONS: { value: Disposition; label: string }[] = [
  { value: "keep", label: "Keep" },
  { value: "postpone", label: "Postpone" },
  { value: "drop", label: "Drop" },
];

interface TriageListProps {
  tasks: PlanTask[];
  proposals: Record<string, Proposal> | null;
  choices: Choices;
  onChoose: (id: string, choice: Disposition) => void;
}

/** Each task with Keep / Postpone / Drop as a segmented control and the model's reason. */
export function TriageList({ tasks, proposals, choices, onChoose }: TriageListProps) {
  return (
    <View className="gap-4">
      {!proposals && (
        <Text variant="muted">Suggestions are unavailable, so every task starts on keep.</Text>
      )}
      {tasks.map((task) => {
        const reason = proposals?.[task.id]?.reason ?? "";

        return (
          <View key={task.id} className="gap-1">
            <Markdown markdown={task.content} testID={`triage-${task.id}`} />
            <Text variant="muted">
              {task.dueDate ?? "no date"}
              {reason === "" ? "" : ` · ${reason}`}
            </Text>
            <View
              role="radiogroup"
              aria-label={`Disposition for ${plainTaskName(task.content)}`}
              className="border-border mt-1 flex-row self-start overflow-hidden rounded-md border"
            >
              {OPTIONS.map(({ value, label }) => {
                const selected = choices[task.id] === value;

                return (
                  <Button
                    key={value}
                    role="radio"
                    aria-checked={selected}
                    variant={selected ? "default" : "ghost"}
                    // oxlint-disable-next-line shadcn/no-restyle -- a segmented radio row joins its buttons edge to edge
                    className="h-11 rounded-none"
                    onPress={() => onChoose(task.id, value)}
                  >
                    <Text>{label}</Text>
                  </Button>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}
