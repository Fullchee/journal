import { isNoteType, type NoteType } from "@/core";
import { Text } from "@/ui";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { GoalForm } from "@/components/goal-form";
import { GoalTargetSection } from "@/components/goal-target";
import { EditButton, NoteBody, QueryView, SaveStatus } from "@/components/note-body";
import { Screen, Section } from "@/components/screen";
import { NavRow } from "@/components/nav-row";
import { useHabitTracker } from "@/lib/data/habits";
import {
  GOAL_STATES,
  useNote,
  useNoteList,
  useSaveGoal,
  useSaveNoteBody,
  type Note,
  type NoteRow,
} from "@/lib/data/notes";

const asGoalState = (detail: string) => GOAL_STATES.find((state) => state === detail) ?? "active";

// The Habits that serve a Goal; each Habit names its Goals, so the link is read from the Habits side.
function LinkedHabits({ goalId }: { goalId: number }) {
  const linked = useHabitTracker().data?.habits.filter(({ goals }) => goals.includes(goalId));

  return (
    <Section title="Habits">
      {linked !== undefined && linked.length > 0 ? (
        linked.map(({ id, name }) => <Text key={id}>• {name}</Text>)
      ) : (
        <Text variant="muted">No Habits serve this Goal yet.</Text>
      )}
    </Section>
  );
}

const goalLink = ({ id, title }: NoteRow) => (
  <NavRow
    key={id}
    href={{ pathname: "/notes/[type]/[id]", params: { type: "goals", id: String(id) } }}
    label={title}
  />
);

// Where a Goal sits in the hierarchy: the Goal it serves and the Goals it is broken into.
function GoalFamily({ goal, goals }: { goal: Note; goals: NoteRow[] }) {
  const parent = goals.find(({ id }) => id === goal.parentId);

  const children = goals
    .filter(({ parentId }) => parentId === goal.id)
    .toSorted((a, b) => a.title.localeCompare(b.title));

  return (
    <>
      {parent === undefined ? null : <Section title="Serves">{goalLink(parent)}</Section>}
      {children.length === 0 ? null : (
        <Section title="Broken into">{children.map((child) => goalLink(child))}</Section>
      )}
    </>
  );
}

// A Goal's body holds "what movement looks like" as prose; its number lives in its Target.
function GoalHeader({ goal, goals }: { goal: Note; goals: NoteRow[] }) {
  const save = useSaveGoal(String(goal.id));
  const [editing, setEditing] = useState(false);

  if (editing)
    return (
      <View className="gap-3">
        <SaveStatus save={save} />
        <GoalForm
          goalId={goal.id}
          goals={goals}
          initial={{
            title: goal.title,
            why: goal.why ?? "",
            state: asGoalState(goal.detail),
            parentId: goal.parentId ?? null,
          }}
          saving={save.isPending}
          onSave={(draft) => save.mutate(draft, { onSuccess: () => setEditing(false) })}
          onCancel={() => setEditing(false)}
        />
      </View>
    );

  return (
    <View className="gap-3">
      <SaveStatus save={save} />
      <Text variant="headline" aria-level={1}>
        {goal.title}
      </Text>
      <Text variant="muted">{goal.detail}</Text>
      {(goal.why ?? "").trim() === "" ? null : <Text>{goal.why}</Text>}
      <EditButton
        label="Edit goal"
        onPress={() => {
          save.reset();
          setEditing(true);
        }}
      />
    </View>
  );
}

// The Goals list places this Goal in the hierarchy and feeds its form's "Serves" choices.
function GoalSections({ goal }: { goal: Note }) {
  const goals = useNoteList("goals").data?.items ?? [];

  return (
    <>
      <GoalHeader goal={goal} goals={goals} />
      <GoalFamily goal={goal} goals={goals} />
      <GoalTargetSection goalId={goal.id} />
      <LinkedHabits goalId={goal.id} />
    </>
  );
}

function NoteView({ type, id }: { type: NoteType; id: string }) {
  const save = useSaveNoteBody(type, id);

  return (
    <QueryView query={useNote(type, id)}>
      {({ item }) => (
        <View className="gap-6">
          <Stack.Screen options={{ title: item.title }} />
          {type === "goals" ? <GoalSections goal={item} /> : null}
          <NoteBody
            body={item.body}
            save={save}
            editLabel={type === "goals" ? "Edit notes" : "Edit"}
          />
        </View>
      )}
    </QueryView>
  );
}

export default function NoteScreen() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();

  return (
    <Screen>
      {isNoteType(type) ? <NoteView type={type} id={id} /> : <Text>Unknown note type.</Text>}
    </Screen>
  );
}
