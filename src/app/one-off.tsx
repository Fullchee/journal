import { torontoDay, newOneOffOf, oneOffProblem, openOneOff, type OneOffForm } from "@/core";
import { Button, Text, DateField, TimeField } from "@/ui";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { TextField } from "@/components/habits/form-fields";
import { LogReceipt } from "@/components/log-receipt";
import { LogSaveFooter } from "@/components/log-save-footer";
import { ModalFrame } from "@/components/modal-frame";
import { useDiscardGuard } from "@/hooks/use-discard-guard";
import { useIsOnline } from "@/lib/data/data-provider";
import { useSaveOneOff } from "@/lib/data/log";

const TITLE = "New One-off";

const OFFLINE = "Adding a One-off needs a connection.";

function UsualWhen({
  usualWhen,
  onChange,
}: {
  usualWhen: string;
  onChange: (usualWhen: string) => void;
}) {
  return (
    <View className="gap-1">
      <Text variant="muted">Usual when</Text>
      <View className="flex-row items-center gap-2">
        <TimeField label="Usual when" value={usualWhen} onChange={onChange} />
        {usualWhen !== "" && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Clear usual when"
            onPress={() => onChange("")}
          >
            <Text>Clear</Text>
          </Button>
        )}
      </View>
    </View>
  );
}

function OneOffDraftForm({ text, draft }: { text: string; draft: string | undefined }) {
  // One "today" for the whole form, so the picker's earliest day and Save agree.
  const [today] = useState(() => torontoDay(new Date()));
  const [opened] = useState(() => openOneOff(draft));
  const [form, setForm] = useState(opened);
  const isOnline = useIsOnline();
  const save = useSaveOneOff();

  useDiscardGuard(
    !save.data && JSON.stringify(form) !== JSON.stringify(opened),
    "This One-off is not saved.",
  );

  if (save.data) return <LogReceipt logged={save.data} undone={`Removed ${form.name.trim()}.`} />;
  const problem = oneOffProblem(form, today);
  const canSave = isOnline && !save.isPending && problem === null;
  const update = (patch: Partial<OneOffForm>) => setForm((current) => ({ ...current, ...patch }));

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4"
        keyboardShouldPersistTaps="handled"
      >
        {text !== "" && <Text variant="muted">“{text}”</Text>}
        <TextField
          label="Name"
          value={form.name}
          maxLength={200}
          onChangeText={(name) => update({ name })}
        />
        <View className="gap-1">
          <Text variant="muted">Day</Text>
          <DateField
            label="Day"
            value={form.date}
            min={today}
            onChange={(date) => update({ date })}
          />
        </View>
        <TextField
          label="Why"
          multiline
          rows={3}
          placeholder="Optional"
          value={form.why}
          onChangeText={(why) => update({ why })}
        />
        <UsualWhen usualWhen={form.usualWhen} onChange={(usualWhen) => update({ usualWhen })} />
      </ScrollView>
      <LogSaveFooter
        error={save.error}
        reason={isOnline ? problem : OFFLINE}
        disabled={!canSave}
        onSave={() => save.mutate({ text, one_off: newOneOffOf(form) })}
      />
    </View>
  );
}

/** `?draft=` holds the log box's proposed One-off and `?text=` the sentence it came from. */
export default function OneOffScreen() {
  const { draft, text = "" } = useLocalSearchParams<{ draft?: string; text?: string }>();

  return (
    <ModalFrame title={TITLE} variant="side-sheet">
      <OneOffDraftForm text={text} draft={draft} />
    </ModalFrame>
  );
}
