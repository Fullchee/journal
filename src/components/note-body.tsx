import { Button, Markdown, Text, type MarkdownProps } from "@/ui";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { Linking, Platform, TextInput, View } from "react-native";

import { AddImageButton, useAddImage } from "@/components/add-image";
import { StatusText } from "@/components/status-text";
import { useDiscardGuard } from "@/hooks/use-discard-guard";
import { useIsOnline } from "@/lib/data/data-provider";
import { OFFLINE_EDIT, saveErrorMessage } from "@/lib/notes";

export const INPUT_CLASS =
  "rounded-md border border-input bg-background px-3 py-2 font-sans text-base text-foreground";

// Notes link to each other by path (a Health plan line to its Health record); those stay in the app.
const openLink = (url: string) =>
  url.startsWith("/")
    ? // SAFETY: a path written in a note may name any route; an unknown one shows the not-found screen.
      router.push(url as Href)
    : void Linking.openURL(url);

const NOTHING_WRITTEN = "Nothing written yet.";

export function NoteMarkdown({
  markdown,
  size = "default",
  testID,
}: Pick<MarkdownProps, "markdown" | "size" | "testID">) {
  return markdown.trim() === "" ? (
    <Text variant="muted">{NOTHING_WRITTEN}</Text>
  ) : (
    <Markdown
      markdown={markdown}
      size={size}
      onLinkPress={openLink}
      {...(testID !== undefined && { testID })}
    />
  );
}

/** Offline, the button stays visible but disabled, with the reason beside it. */
export function EditButton({ label = "Edit", onPress }: { label?: string; onPress: () => void }) {
  const isOnline = useIsOnline();

  return (
    <View className="gap-1">
      <Button variant="outline" className="self-start" disabled={!isOnline} onPress={onPress}>
        <Text>{label}</Text>
      </Button>
      {isOnline ? null : <Text variant="muted">{OFFLINE_EDIT}</Text>}
    </View>
  );
}

export function SaveButtons({
  disabled,
  onSave,
  onCancel,
}: {
  disabled: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isOnline = useIsOnline();

  return (
    <View className="gap-1">
      <View className="flex-row gap-2">
        <Button className="flex-1" disabled={disabled || !isOnline} onPress={onSave}>
          <Text>Save</Text>
        </Button>
        <Button variant="outline" className="flex-1" onPress={onCancel}>
          <Text>Cancel</Text>
        </Button>
      </View>
      {isOnline ? null : <Text variant="muted">{OFFLINE_EDIT}</Text>}
    </View>
  );
}

export function SaveStatus({ save }: { save: Pick<UseMutationResult, "status" | "error"> }) {
  if (save.status === "error")
    return <StatusText tone="error">{saveErrorMessage(save.error)}</StatusText>;

  return save.status === "success" ? <StatusText variant="muted">Saved.</StatusText> : null;
}

interface NoteBodyProps {
  body: string;
  save: UseMutationResult<unknown, Error, string>;
  size?: MarkdownProps["size"];
  editLabel?: string;
}

function MarkdownEditor({
  text,
  onChangeText,
}: {
  text: string;
  onChangeText: (text: string) => void;
}) {
  const images = useAddImage(text, onChangeText);

  return (
    <>
      <TextInput
        aria-label="Markdown"
        className={`${INPUT_CLASS} min-h-80`}
        multiline
        rows={Platform.OS === "web" ? 12 : undefined}
        textAlignVertical="top"
        autoFocus
        value={text}
        onChangeText={onChangeText}
        onSelectionChange={images.onSelectionChange}
      />
      <AddImageButton images={images} />
    </>
  );
}

/** Markdown to read; Edit swaps in a plain TextInput holding the source. */
export function NoteBody({ body, save, size = "default", editLabel = "Edit" }: NoteBodyProps) {
  const [draft, setDraft] = useState<string | null>(null);

  useDiscardGuard(draft !== null && draft !== body, "Your edits to this note are not saved.");

  const submit = (text: string) => save.mutate(text, { onSuccess: () => setDraft(null) });

  const edit = () => {
    save.reset();
    setDraft(body);
  };

  const empty = body.trim() === "";

  return (
    <View className="gap-3">
      <SaveStatus save={save} />
      {draft === null ? (
        <>
          {empty ? <Text variant="muted">{NOTHING_WRITTEN}</Text> : null}
          <EditButton label={empty ? "Write it" : editLabel} onPress={edit} />
          {empty ? null : <NoteMarkdown markdown={body} size={size} />}
        </>
      ) : (
        <>
          <MarkdownEditor text={draft} onChangeText={setDraft} />
          <SaveButtons
            disabled={save.isPending}
            onSave={() => submit(draft)}
            onCancel={() => setDraft(null)}
          />
        </>
      )}
    </View>
  );
}

/** Cached data shows whatever the network does; only a first load with nothing cached waits or fails. */
export function QueryView<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.data !== undefined) return children(query.data);

  if (query.isError)
    return (
      <View className="gap-2">
        <StatusText tone="error">{"Couldn't load. Check the connection, then retry."}</StatusText>
        <Button variant="outline" className="h-11 self-start" onPress={() => void query.refetch()}>
          <Text>Retry</Text>
        </Button>
      </View>
    );

  if (query.fetchStatus === "paused")
    return <Text variant="muted">Not on this device yet: open it once while online.</Text>;

  return <Text variant="muted">Loading…</Text>;
}
