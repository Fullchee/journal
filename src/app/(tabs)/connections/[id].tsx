import { circleNames, type ConnectionRef } from "@/core";
import { Button, Input, Markdown, ReachedOut, Text } from "@/ui";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { AddImageButton, useAddImage } from "@/components/add-image";
import { ConnectionDetails } from "@/components/connection-details";
import { ConnectionForm } from "@/components/connection-form";
import { ConnectionInteractions } from "@/components/connection-interactions";
import { Screen, Section } from "@/components/screen";
import { StatusText } from "@/components/status-text";
import { useDiscardGuard } from "@/hooks/use-discard-guard";
import { useContactPhoto } from "@/lib/contacts/contact-photo";
import { useIsOnline } from "@/lib/data/data-provider";
import {
  useConnection,
  useConnections,
  useLogInteraction,
  useSaveConnectionNotes,
  useUpdateConnection,
  type ConnectionDetail,
  type ConnectionDraft,
} from "@/lib/data/connections";

const draftOf = ({
  name,
  closeness,
  circles,
  cadenceDays,
  followUps,
  howWeMet,
  growCloser,
  meetups,
  dates,
  contactId,
  metThrough,
  links,
}: ConnectionDetail): ConnectionDraft => ({
  name,
  closeness,
  metThroughId: metThrough?.id ?? null,
  links: links.map(({ id, label }) => ({ id, label })),
  circles,
  cadenceDays,
  followUps,
  howWeMet,
  growCloser,
  meetups,
  dates,
  contactId,
});

const PHOTO_SIZE = 56;

function ContactPhoto({ contactId, name }: { contactId: string | null; name: string }) {
  const uri = useContactPhoto(contactId);

  // Memory only: the photo stays on the phone, never in a disk cache.
  return uri === null ? null : (
    <Image
      source={{ uri }}
      alt={`Photo of ${name}`}
      cachePolicy="memory"
      contentFit="cover"
      style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: PHOTO_SIZE / 2 }}
    />
  );
}

function NotesEditor({
  text,
  onChangeText,
}: {
  text: string;
  onChangeText: (text: string) => void;
}) {
  const images = useAddImage(text, onChangeText);

  return (
    <>
      <Input
        aria-label="Notes"
        multiline
        rows={7}
        className="min-h-48"
        textAlignVertical="top"
        value={text}
        onChangeText={onChangeText}
        onSelectionChange={images.onSelectionChange}
      />
      <AddImageButton images={images} />
    </>
  );
}

interface NotesProps {
  connection: ConnectionDetail;
  isOnline: boolean;
  /** The notes being edited, held by the page so Edit details doesn't drop them; null while reading. */
  text: string | null;
  setText: (text: string | null) => void;
}

function Notes({ connection, isOnline, text, setText }: NotesProps) {
  const save = useSaveConnectionNotes(connection.id);

  if (text === null)
    return (
      <Section title="Notes">
        {connection.body.trim() === "" ? (
          <Text variant="muted">No notes yet.</Text>
        ) : (
          <Markdown markdown={connection.body} />
        )}
        <Button
          variant="outline"
          className="h-11 self-start"
          disabled={!isOnline}
          onPress={() => setText(connection.body)}
        >
          <Text>Edit notes</Text>
        </Button>
      </Section>
    );

  return (
    <Section title="Notes">
      <NotesEditor text={text} onChangeText={setText} />
      <View className="flex-row gap-2">
        <Button
          className="h-11 flex-1"
          disabled={!isOnline || save.isPending}
          onPress={() => save.mutate(text, { onSuccess: () => setText(null) })}
        >
          <Text>Save notes</Text>
        </Button>
        <Button variant="outline" className="h-11 flex-1" onPress={() => setText(null)}>
          <Text>Cancel</Text>
        </Button>
      </View>
      {save.isError ? (
        <StatusText tone="error">Couldn&apos;t save the notes. Try again.</StatusText>
      ) : null}
    </Section>
  );
}

// Everyone but this person; the detail's own refs keep names known while the list loads.
function useOthers(connection: ConnectionDetail): ConnectionRef[] {
  const { data } = useConnections();

  const refs = [
    ...(data?.connections ?? []),
    ...connection.links,
    ...(connection.metThrough ? [connection.metThrough] : []),
  ];

  const byId = new Map(refs.map(({ id, name }) => [id, { id, name }]));

  byId.delete(connection.id);

  return [...byId.values()].toSorted((a, b) => a.name.localeCompare(b.name));
}

/** The details and notes being edited; leaving asks first when either differs from the saved Connection. */
function useEdits(connection: ConnectionDetail) {
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const detailsChanged =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(draftOf(connection));

  const notesChanged = notes !== null && notes !== connection.body;

  useDiscardGuard(
    detailsChanged || notesChanged,
    `Your edits to ${connection.name} are not saved.`,
  );

  return { draft, setDraft, notes, setNotes };
}

function ConnectionPage({ connection }: { connection: ConnectionDetail }) {
  const isOnline = useIsOnline();
  const others = useOthers(connection);
  const logInteraction = useLogInteraction();
  const update = useUpdateConnection();
  const { data } = useConnections();
  const { draft, setDraft, notes, setNotes } = useEdits(connection);

  return (
    <Screen>
      <View className="flex-row items-center gap-3">
        <ContactPhoto contactId={connection.contactId} name={connection.name} />
        <Text aria-level={1} variant="headline" className="flex-1">
          {connection.name}
        </Text>
      </View>
      {isOnline ? null : <Text variant="muted">Editing needs a connection.</Text>}
      {draft ? (
        <ConnectionForm
          draft={draft}
          knownCircles={circleNames(data?.connections ?? [])}
          onChange={setDraft}
          canSave={isOnline && !update.isPending}
          people={others}
          onCancel={() => setDraft(null)}
          onSave={() =>
            update.mutate({ id: connection.id, patch: draft }, { onSuccess: () => setDraft(null) })
          }
        />
      ) : (
        <>
          <View className="flex-row flex-wrap items-start gap-2">
            <ReachedOut
              name={connection.name}
              onReachedOut={(interaction) => logInteraction([connection.id], interaction)}
            />
            <Button
              variant="outline"
              className="h-11"
              disabled={!isOnline}
              onPress={() => setDraft(draftOf(connection))}
            >
              <Text>Edit details</Text>
            </Button>
          </View>
          <ConnectionDetails connection={connection} />
          <ConnectionInteractions
            connectionId={connection.id}
            interactions={connection.interactions}
            isOnline={isOnline}
          />
          <Notes connection={connection} isOnline={isOnline} text={notes} setText={setNotes} />
        </>
      )}
      {update.isError ? (
        <StatusText tone="error">Couldn&apos;t save. Check the name isn&apos;t taken.</StatusText>
      ) : null}
    </Screen>
  );
}

export default function ConnectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connection, isError } = useConnection(Number(id));

  if (connection) return <ConnectionPage key={connection.id} connection={connection} />;

  return (
    <Screen>
      <Text variant="muted">{isError ? "Couldn't load this Connection." : "Loading…"}</Text>
    </Screen>
  );
}
