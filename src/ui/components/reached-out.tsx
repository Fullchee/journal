import { INTERACTION_KINDS, INTERACTION_KIND_LABELS, type InteractionKind } from "@/core";
import { useId, useState } from "react";
import { View } from "react-native";

import { Button } from "./button";
import { Input } from "./input";
import { Text } from "./text";

const MAX_NOTE = 500;

/** What a person types for an Interaction; `minutes` stays text until saved. */
export interface InteractionDraft {
  kind: InteractionKind;
  note: string;
  minutes: string;
}

export interface InteractionInput {
  kind: InteractionKind;
  note: string;
  minutes: number | null;
}

/** Minutes count only in person, and only as a whole positive number. */
export function interactionOf({ kind, note, minutes }: InteractionDraft): InteractionInput {
  const count = Number(minutes.trim());

  return {
    kind,
    note: note.trim(),
    minutes: kind === "in-person" && Number.isSafeInteger(count) && count > 0 ? count : null,
  };
}

/** The kind, note and (in person) minutes of an Interaction; "Reached out" and the edit form share it. */
export function InteractionInputs({
  draft,
  onChange,
  noteLabel,
  onSubmit,
}: {
  draft: InteractionDraft;
  onChange: (draft: InteractionDraft) => void;
  noteLabel: string;
  onSubmit?: () => void;
}) {
  const labelId = useId();

  return (
    <View className="gap-2">
      <View role="radiogroup" aria-label="Kind" className="flex-row flex-wrap gap-2">
        {INTERACTION_KINDS.map((kind) => (
          <Button
            key={kind}
            size="sm"
            className="h-11"
            role="radio"
            aria-checked={draft.kind === kind}
            variant={draft.kind === kind ? "default" : "outline"}
            onPress={() => onChange({ ...draft, kind })}
          >
            <Text>{INTERACTION_KIND_LABELS[kind]}</Text>
          </Button>
        ))}
      </View>
      <Text nativeID={labelId} variant="muted">
        {noteLabel}
      </Text>
      <Input
        aria-labelledby={labelId}
        maxLength={MAX_NOTE}
        placeholder="e.g. her move"
        value={draft.note}
        onChangeText={(note) => onChange({ ...draft, note })}
        onSubmitEditing={onSubmit}
      />
      {draft.kind === "in-person" ? (
        <Input
          aria-label="Minutes together"
          inputMode="numeric"
          placeholder="Minutes together (optional)"
          value={draft.minutes}
          onChangeText={(minutes) => onChange({ ...draft, minutes })}
        />
      ) : null}
    </View>
  );
}

const NEW_DRAFT: InteractionDraft = { kind: "message", note: "", minutes: "" };

interface ReachedOutProps {
  name: string;
  onReachedOut: (interaction: InteractionInput) => void;
}

/** Logs an Interaction: a message unless another kind is picked, with an optional note. */
export function ReachedOut({ name, onReachedOut }: ReachedOutProps) {
  const [draft, setDraft] = useState<InteractionDraft | null>(null);
  const [logged, setLogged] = useState(false);

  if (draft) {
    const log = () => {
      onReachedOut(interactionOf(draft));
      setDraft(null);
      setLogged(true);
    };

    return (
      <View className="gap-2">
        <InteractionInputs
          draft={draft}
          onChange={setDraft}
          noteLabel={`What did you talk about with ${name}? (optional)`}
          onSubmit={log}
        />
        <View className="flex-row gap-2">
          <Button className="h-11 flex-1" onPress={log}>
            <Text>Log</Text>
          </Button>
          <Button variant="outline" className="h-11 flex-1" onPress={() => setDraft(null)}>
            <Text>Cancel</Text>
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <Button
        variant="outline"
        className="h-11"
        onPress={() => {
          setDraft(NEW_DRAFT);
          setLogged(false);
        }}
      >
        <Text>Reached out</Text>
      </Button>
      {logged ? <Text variant="muted">Logged. Nice one.</Text> : null}
    </View>
  );
}
