import { PART_ROLES, ROLE_LABELS, type PartDraft } from "@/core";
import { Button, Input, Text } from "@/ui";
import { useState } from "react";
import { View } from "react-native";

import { ChoiceRow } from "@/components/choice-row";
import { ApiError } from "@/lib/api/errors";

const ROLE_CHOICES = PART_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

const CONFLICT = 409;

/** The server's refusal as a sentence the form can show. */
export const partSaveError = (error: Error | null) => {
  if (error === null) return null;

  return error instanceof ApiError && error.status === CONFLICT
    ? "A part with that name exists."
    : "Couldn't save the part. Try again.";
};

interface PartFormProps {
  initial: PartDraft;
  disabled: boolean;
  error: string | null;
  onSave: (draft: PartDraft) => void;
  onCancel?: () => void;
}

// The IFS worksheet's questions, each a free-text answer.
const QUESTIONS: { field: "wants" | "fears" | "feltIn"; label: string; placeholder: string }[] = [
  { field: "wants", label: "What does it want for me?", placeholder: "To keep me safe" },
  {
    field: "fears",
    label: "What does it fear would happen if it stopped?",
    placeholder: "I'd be rejected",
  },
  { field: "feltIn", label: "Where do I feel it in my body?", placeholder: "Tight chest" },
];

const MAX_ANSWER = 2000;

/** A Part's name, role, the IFS questions and a description; the Check-in's "New part…" and the Part page share it. */
export function PartForm({ initial, disabled, error, onSave, onCancel }: PartFormProps) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<PartDraft>) => setDraft({ ...draft, ...patch });
  const named = draft.name.trim() !== "";

  return (
    <View className="gap-4">
      <View className="gap-1.5">
        <Text variant="muted">Name</Text>
        <Input
          aria-label="Name"
          placeholder="Inner critic"
          maxLength={100}
          value={draft.name}
          onChangeText={(name) => set({ name })}
        />
      </View>
      <ChoiceRow
        legend="Role"
        choices={ROLE_CHOICES}
        selected={draft.role}
        onPick={(role) => set({ role })}
      />
      {QUESTIONS.map(({ field, label, placeholder }) => (
        <View key={field} className="gap-1.5">
          <Text variant="muted">{label}</Text>
          <Input
            aria-label={label}
            placeholder={placeholder}
            maxLength={MAX_ANSWER}
            value={draft[field]}
            onChangeText={(answer) => set({ [field]: answer })}
          />
        </View>
      ))}
      <View className="gap-1.5">
        <Text variant="muted">How does it show up?</Text>
        <Input
          aria-label="Description"
          multiline
          rows={5}
          className="min-h-32"
          textAlignVertical="top"
          value={draft.description}
          onChangeText={(description) => set({ description })}
        />
      </View>
      {error === null ? null : <Text role="alert">{error}</Text>}
      <View className="flex-row gap-2">
        <Button className="h-11 flex-1" disabled={!named || disabled} onPress={() => onSave(draft)}>
          <Text>Save part</Text>
        </Button>
        {onCancel ? (
          <Button variant="outline" className="h-11 flex-1" onPress={onCancel}>
            <Text>Cancel</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
