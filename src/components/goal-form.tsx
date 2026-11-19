import { buildGoalTree, flattenGoalTree, goalSubtreeIds } from "@/core";
import { Button, Text } from "@/ui";
import { useState } from "react";
import { Platform, TextInput, View } from "react-native";

import { INPUT_CLASS, SaveButtons } from "@/components/note-body";
import { GOAL_STATES, type GoalDraft, type NoteRow } from "@/lib/data/notes";

interface GoalFormProps {
  goalId: number;
  /** Every Goal, from the Goals list, to pick the one this Goal serves. */
  goals: NoteRow[];
  initial: GoalDraft;
  saving: boolean;
  onSave: (goal: GoalDraft) => void;
  onCancel: () => void;
}

/**
 * A Goal can serve any active Goal outside its own subtree, which would make a cycle. Its current parent stays
 * listed even once achieved or retired, so the checked choice is always visible.
 */
function parentChoices(goals: NoteRow[], goalId: number, parentId: number | null) {
  const tree = buildGoalTree(goals);
  const subtree = goalSubtreeIds(tree, goalId);

  return flattenGoalTree(tree)
    .map(({ goal }) => goal)
    .filter(({ id, detail }) => !subtree.has(id) && (detail === "active" || id === parentId));
}

/**
 * Mirrors journal's GoalForm: a Goal is its direction, felt why, state and the Goal it serves; its notes have
 * their own editor.
 */
export function GoalForm({ goalId, goals, initial, saving, onSave, onCancel }: GoalFormProps) {
  const [draft, setDraft] = useState(initial);

  const choices = [
    { id: null, title: "None (top-level)" },
    ...parentChoices(goals, goalId, initial.parentId),
  ];

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text nativeID="goal-title">Direction</Text>
        <TextInput
          aria-labelledby="goal-title"
          className={INPUT_CLASS}
          maxLength={200}
          value={draft.title}
          onChangeText={(title) => setDraft({ ...draft, title })}
        />
      </View>
      <View className="gap-1">
        <Text nativeID="goal-why">Why</Text>
        <TextInput
          aria-labelledby="goal-why"
          className={`${INPUT_CLASS} min-h-24`}
          multiline
          rows={Platform.OS === "web" ? 3 : undefined}
          textAlignVertical="top"
          value={draft.why}
          onChangeText={(why) => setDraft({ ...draft, why })}
        />
      </View>
      <View className="gap-1" role="radiogroup" aria-label="State">
        <Text>State</Text>
        <View className="flex-row flex-wrap gap-2">
          {GOAL_STATES.map((state) => (
            <Button
              key={state}
              size="sm"
              role="radio"
              aria-checked={draft.state === state}
              variant={draft.state === state ? "default" : "outline"}
              onPress={() => setDraft({ ...draft, state })}
            >
              <Text>{state}</Text>
            </Button>
          ))}
        </View>
      </View>
      <View className="gap-1" role="radiogroup" aria-label="Serves">
        <Text>Serves</Text>
        <View className="flex-row flex-wrap gap-2">
          {choices.map(({ id, title }) => (
            <Button
              key={title}
              size="sm"
              role="radio"
              aria-checked={draft.parentId === id}
              variant={draft.parentId === id ? "default" : "outline"}
              onPress={() => setDraft({ ...draft, parentId: id })}
            >
              <Text>{title}</Text>
            </Button>
          ))}
        </View>
      </View>
      <SaveButtons
        disabled={saving || draft.title.trim() === ""}
        onSave={() => onSave({ ...draft, title: draft.title.trim() })}
        onCancel={onCancel}
      />
    </View>
  );
}
