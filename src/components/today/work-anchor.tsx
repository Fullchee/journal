import { isJobHours, torontoDay } from "@/core";
import { Input, Text } from "@/ui";
import { useState } from "react";
import { View } from "react-native";

import { EditButton, SaveButtons, SaveStatus } from "@/components/note-body";
import { Section } from "@/components/screen";
import { useAnchor, useSetAnchor } from "@/lib/data/work-anchor";

type AnchorSave = ReturnType<typeof useSetAnchor>;

function AnchorDraft({
  day,
  anchor,
  save,
  onClose,
}: {
  day: string;
  anchor: string;
  save: AnchorSave;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(anchor);

  const submit = () => save.mutate({ day, anchor: draft.trim() }, { onSuccess: onClose });

  return (
    <>
      <Input
        aria-label="Anchor"
        placeholder="The smallest open work task"
        autoFocus
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={submit}
      />
      <SaveButtons disabled={save.isPending} onSave={submit} onCancel={onClose} />
    </>
  );
}

function AnchorEditor({ day, anchor }: { day: string; anchor: string }) {
  const save = useSetAnchor();
  const [editing, setEditing] = useState(false);

  const edit = () => {
    save.reset();
    setEditing(true);
  };

  return (
    <View className="gap-3">
      <SaveStatus save={save} />
      {editing ? (
        <AnchorDraft day={day} anchor={anchor} save={save} onClose={() => setEditing(false)} />
      ) : (
        <>
          <Text variant={anchor === "" ? "muted" : "default"}>
            {anchor === "" ? "No Anchor yet." : anchor}
          </Text>
          <EditButton label={anchor === "" ? "Set Anchor" : "Change Anchor"} onPress={edit} />
        </>
      )}
    </View>
  );
}

function AnchorSection({ day }: { day: string }) {
  const { data: anchor, isError } = useAnchor(day);

  if (anchor === undefined && !isError) return null;

  return (
    <Section title="Anchor">
      {anchor === undefined ? (
        // Today's other sections stay usable, so a failed read waits for pull to refresh.
        <Text variant="muted">{"Couldn't load the Anchor. Pull to refresh."}</Text>
      ) : (
        <AnchorEditor day={day} anchor={anchor} />
      )}
    </Section>
  );
}

/** The Work day's Anchor, shown only in job hours so it stays out of the evening and weekend. */
// eslint-disable-next-line eslint-react/purity -- whether it is job hours reads the clock on each render
export function WorkAnchor({ now = new Date() }: { now?: Date }) {
  return isJobHours(now) ? <AnchorSection day={torontoDay(now)} /> : null;
}
