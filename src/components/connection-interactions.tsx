import { interactionLabel, interactionWith, torontoDay, type Interaction } from "@/core";
import {
  Button,
  DateField,
  InteractionInputs,
  Text,
  interactionOf,
  type InteractionDraft,
} from "@/ui";
import { useState } from "react";
import { View } from "react-native";

import { Section } from "@/components/screen";
import { useDeleteInteraction, useEditInteraction } from "@/lib/data/connections";

type EditDraft = InteractionDraft & { day: string };

const draftOf = ({ day, kind, note, minutes }: Interaction): EditDraft => ({
  day,
  kind,
  note,
  minutes: minutes === null ? "" : String(minutes),
});

function InteractionEditor({
  interaction,
  today,
  onDone,
}: {
  interaction: Interaction;
  today: string;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(interaction));
  const edit = useEditInteraction();

  return (
    <View className="gap-2">
      <DateField
        label="Day"
        value={draft.day}
        max={today}
        onChange={(day) => setDraft({ ...draft, day })}
      />
      <InteractionInputs
        draft={draft}
        onChange={(fields) => setDraft({ ...fields, day: draft.day })}
        noteLabel="What did you talk about?"
      />
      <View className="flex-row gap-2">
        <Button
          className="h-11 flex-1"
          disabled={edit.isPending}
          onPress={() =>
            edit.mutate(
              { id: interaction.id, edit: { ...interactionOf(draft), day: draft.day } },
              { onSuccess: onDone },
            )
          }
        >
          <Text>Save</Text>
        </Button>
        <Button variant="outline" className="h-11 flex-1" onPress={onDone}>
          <Text>Cancel</Text>
        </Button>
      </View>
      {edit.isError ? <Text role="alert">Couldn&apos;t save. Try again.</Text> : null}
    </View>
  );
}

function InteractionRow({
  interaction,
  connectionId,
  isOnline,
  today,
}: {
  interaction: Interaction;
  connectionId: number;
  isOnline: boolean;
  today: string;
}) {
  const [editing, setEditing] = useState(false);
  const remove = useDeleteInteraction();
  const withWhom = interactionWith(interaction, connectionId);

  if (editing)
    return (
      <InteractionEditor interaction={interaction} today={today} onDone={() => setEditing(false)} />
    );

  return (
    <View role="listitem" className="border-border gap-1 border-b pb-3">
      <Text>{interactionLabel(interaction, today)}</Text>
      {interaction.note === "" ? null : <Text variant="muted">{interaction.note}</Text>}
      {withWhom === null ? null : <Text variant="muted">{withWhom}</Text>}
      <View className="flex-row gap-2">
        <Button
          variant="ghost"
          className="h-11"
          disabled={!isOnline}
          onPress={() => setEditing(true)}
        >
          <Text>Edit</Text>
        </Button>
        <Button
          variant="ghost"
          className="h-11"
          disabled={!isOnline || remove.isPending}
          onPress={() => remove.mutate(interaction.id)}
        >
          <Text>Delete</Text>
        </Button>
      </View>
    </View>
  );
}

/** A person's Interactions, newest first; edits and deletes save online only. */
export function ConnectionInteractions({
  connectionId,
  interactions,
  isOnline,
}: {
  connectionId: number;
  interactions: Interaction[];
  isOnline: boolean;
}) {
  // eslint-disable-next-line eslint-react/purity -- labels show the year only for another year than this one
  const today = torontoDay(new Date());

  return (
    <Section title="Interactions">
      {interactions.length === 0 ? (
        <Text variant="muted">None yet.</Text>
      ) : (
        <View role="list" aria-label="Interactions" className="gap-3">
          {interactions.map((interaction) => (
            <InteractionRow
              key={interaction.id}
              interaction={interaction}
              connectionId={connectionId}
              isOnline={isOnline}
              today={today}
            />
          ))}
        </View>
      )}
    </Section>
  );
}
