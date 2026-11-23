import {
  targetLabel,
  torontoDay,
  type GoalTarget,
  type GoalTargetDraft,
  type TargetView,
} from "@/core";
import { Button, DateField, Text } from "@/ui";
import { useState } from "react";
import { TextInput, View } from "react-native";

import { ChoiceRow, type Choice } from "@/components/choice-row";
import { EditButton, INPUT_CLASS, SaveButtons, SaveStatus } from "@/components/note-body";
import { Section } from "@/components/screen";
import { ScreenTimeDays, UsageAccessPrompt } from "@/components/screen-time";
import { useHabitTracker } from "@/lib/data/habits";
import { useRemoveTarget, useSaveTarget, useTargets } from "@/lib/data/targets";

const MEASURES: Choice<GoalTarget["measure"]>[] = [
  { value: "times", label: "Times" },
  { value: "minutes", label: "Minutes" },
  { value: "intensity-minutes", label: "Intensity minutes" },
  { value: "sleep", label: "Sleep" },
  { value: "screen-time", label: "Screen time" },
];

const NUMBER_UNITS: Record<GoalTarget["measure"], string> = {
  times: "times",
  minutes: "minutes",
  "intensity-minutes": "intensity minutes",
  sleep: "minutes a night",
  "screen-time": "minutes a day",
};

const DIRECTIONS: Choice<GoalTarget["direction"]>[] = [
  { value: "minimum", label: "Minimum" },
  { value: "limit", label: "Limit" },
];

const PERIODS: Choice<GoalTarget["period"]>[] = [
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "deadline", label: "Deadline" },
];

interface Draft {
  measure: GoalTarget["measure"];
  number: string;
  direction: GoalTarget["direction"];
  period: GoalTarget["period"];
  deadline: string;
}

const draftOf = (target: GoalTarget | null): Draft => ({
  measure: target?.measure ?? "minutes",
  number: target?.number?.toString() ?? "",
  direction: target?.direction ?? "minimum",
  period: target?.period ?? "week",
  deadline: target?.period === "deadline" ? target.deadline : "",
});

/** A whole number above 0. */
export const WHOLE_NUMBER = /^[1-9]\d*$/;

/** The Target the draft describes, or null while it can't be saved: a number must be whole and above 0, a deadline set. */
function targetOf({ measure, number, direction, period, deadline }: Draft): GoalTargetDraft | null {
  const trimmed = number.trim();

  if (trimmed !== "" && !WHOLE_NUMBER.test(trimmed)) return null;
  const measured = { measure, direction, number: trimmed === "" ? null : Number(trimmed) };

  if (period !== "deadline") return { ...measured, period };

  return deadline === "" ? null : { ...measured, period, deadline };
}

interface TargetFormProps {
  initial: GoalTarget | null;
  saving: boolean;
  onSave: (target: GoalTargetDraft) => void;
  onCancel: () => void;
}

function TargetForm({ initial, saving, onSave, onCancel }: TargetFormProps) {
  const [draft, setDraft] = useState(() => draftOf(initial));
  const [today] = useState(() => torontoDay(new Date()));
  const target = targetOf(draft);

  return (
    <View className="gap-3">
      <ChoiceRow
        legend="Measure"
        choices={MEASURES}
        selected={draft.measure}
        onPick={(measure) => setDraft({ ...draft, measure })}
      />
      <View className="gap-1">
        <Text nativeID="target-number" variant="muted">
          Number of {NUMBER_UNITS[draft.measure]} (optional)
        </Text>
        <TextInput
          aria-labelledby="target-number"
          className={INPUT_CLASS}
          keyboardType="number-pad"
          value={draft.number}
          onChangeText={(number) => setDraft({ ...draft, number })}
        />
        <Text variant="muted">With no number, it shows as a trend.</Text>
      </View>
      <ChoiceRow
        legend="The number is a"
        choices={DIRECTIONS}
        selected={draft.direction}
        onPick={(direction) => setDraft({ ...draft, direction })}
      />
      <ChoiceRow
        legend="Period"
        choices={PERIODS}
        selected={draft.period}
        onPick={(period) => setDraft({ ...draft, period })}
      />
      {draft.period === "deadline" && (
        <View className="gap-1">
          <Text variant="muted">Deadline</Text>
          <DateField
            label="Deadline"
            value={draft.deadline}
            min={today}
            onChange={(deadline) => setDraft({ ...draft, deadline })}
          />
        </View>
      )}
      <SaveButtons
        disabled={saving || target === null}
        onSave={() => target && onSave(target)}
        onCancel={onCancel}
      />
    </View>
  );
}

/** "Measures: Run, Ride", from the Habits the Target sums; a Signal measures no Habit. */
function MeasuredHabits({ ids }: { ids: string[] }) {
  const habits = useHabitTracker().data?.habits ?? [];
  const names = habits.filter(({ id }) => ids.includes(id)).map(({ name }) => name);

  return names.length === 0 ? null : <Text variant="muted">Measures: {names.join(", ")}</Text>;
}

function TargetEditor({
  goalId,
  target,
  onDone,
}: {
  goalId: number;
  target: GoalTarget | null;
  onDone: () => void;
}) {
  const save = useSaveTarget(goalId);
  const remove = useRemoveTarget(goalId);

  return (
    <View className="gap-3">
      <SaveStatus save={save} />
      <SaveStatus save={remove} />
      <TargetForm
        initial={target}
        saving={save.isPending || remove.isPending}
        onSave={(draft) => save.mutate(draft, { onSuccess: onDone })}
        onCancel={onDone}
      />
      {target !== null && (
        <Button
          variant="outline"
          className="self-start"
          disabled={remove.isPending}
          onPress={() => remove.mutate(undefined, { onSuccess: onDone })}
        >
          <Text>Remove target</Text>
        </Button>
      )}
    </View>
  );
}

/** A Goal's Target on its page: progress only, never pass or fail. */
export function GoalTargetSection({ goalId }: { goalId: number }) {
  const [today] = useState(() => torontoDay(new Date()));
  const { data } = useTargets(today);
  const [editing, setEditing] = useState(false);

  if (data === undefined) return null;
  const view = data.targets.find((target) => target.goalId === goalId);

  return (
    <Section title="Target">
      {editing ? (
        <TargetEditor
          goalId={goalId}
          target={view?.target ?? null}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          {view === undefined ? (
            <Text variant="muted">No target: this Goal is a direction.</Text>
          ) : (
            <>
              <Text>{targetLabel(view, today)}</Text>
              <MeasuredHabits ids={view.habits} />
              {view.target.measure === "screen-time" && (
                <>
                  <ScreenTimeDays today={today} />
                  <UsageAccessPrompt />
                </>
              )}
            </>
          )}
          <EditButton
            label={view === undefined ? "Set a target" : "Edit target"}
            onPress={() => setEditing(true)}
          />
        </>
      )}
    </Section>
  );
}

/** The Targets of active Goals that measure this Habit, on its History. */
export function HabitTargets({ habitId }: { habitId: string }) {
  const [today] = useState(() => torontoDay(new Date()));

  const measuring = (useTargets(today).data?.targets ?? []).filter(
    ({ state, habits }) => state === "active" && habits.includes(habitId),
  );

  if (measuring.length === 0) return null;

  return (
    <Section title="Targets">
      {measuring.map((view) => (
        <TargetLine key={view.goalId} view={view} today={today} />
      ))}
    </Section>
  );
}

export function TargetLine({ view, today }: { view: TargetView; today: string }) {
  return (
    <View className="gap-0.5">
      <Text className="font-sans-bold">{view.title}</Text>
      <Text>{targetLabel(view, today)}</Text>
    </View>
  );
}
