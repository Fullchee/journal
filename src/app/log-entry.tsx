import {
  blankEntry,
  torontoDay,
  logForm,
  loggableHabits,
  openEntries,
  type Durations,
  type FormEntry,
  type Habit,
  type LogFormRow,
} from "@/core";
import { Button, Icon, Text, DateField, TimeField } from "@/ui";
import { useLocalSearchParams } from "expo-router";
import { Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { ChoiceChips, TextField } from "@/components/habits/form-fields";
import { LogReceipt } from "@/components/log-receipt";
import { LogSaveFooter } from "@/components/log-save-footer";
import { ModalFrame } from "@/components/modal-frame";
import { useDiscardGuard } from "@/hooks/use-discard-guard";
import { useIsOnline } from "@/lib/data/data-provider";
import { useTodayHabits } from "@/lib/data/habits";
import { useSaveEntries } from "@/lib/data/log";

interface RowProps {
  row: LogFormRow;
  habits: Habit[];
  now: Date;
  update: (patch: Partial<FormEntry>) => void;
  remove: (() => void) | null;
}

function EntryRow({ row: { entry, habit, overlap }, habits, now, update, remove }: RowProps) {
  return (
    <View className="border-border gap-3 rounded-lg border p-3">
      <ChoiceChips
        label="Habit"
        options={habits.map(({ id, name }) => ({ id, label: name }))}
        isSelected={(id) => id === entry.habit}
        onPick={(id) => update({ habit: id })}
      />
      <View className="gap-1">
        <Text variant="muted">Day</Text>
        <DateField
          label="Day"
          value={entry.date}
          max={torontoDay(now)}
          onChange={(date) => update({ date })}
        />
      </View>
      {habit?.record === "duration" && (
        <View className="flex-row gap-2">
          <View className="flex-1 gap-1">
            <Text variant="muted">Started at</Text>
            <TimeField
              label="Started at"
              value={entry.startTime}
              onChange={(startTime) => update({ startTime })}
            />
          </View>
          <View className="flex-1">
            <TextField
              label="Minutes"
              keyboardType="number-pad"
              value={entry.minutes}
              onChangeText={(minutes) => update({ minutes })}
            />
          </View>
        </View>
      )}
      {habit?.record === "count" && (
        <TextField
          label="How many times"
          keyboardType="number-pad"
          value={entry.count}
          onChangeText={(count) => update({ count })}
        />
      )}
      {overlap !== null && <Text className="text-destructive text-sm">{overlap}</Text>}
      {remove && (
        <Button variant="ghost" size="sm" className="self-start" onPress={remove}>
          <Icon as={Trash2} />
          <Text>Remove</Text>
        </Button>
      )}
    </View>
  );
}

interface FormProps {
  text: string;
  draft: string | undefined;
  habits: Habit[];
  durations: Durations;
}

// Save is off while any row has a problem; the first is named beside Save, by number when there are several.
function saveReason(rows: LogFormRow[], isOnline: boolean) {
  if (!isOnline) return "Logging needs a connection.";

  const problems = rows.flatMap(({ problem }, index) => {
    if (problem === null) return [];

    return [rows.length > 1 ? `Entry ${index + 1}: ${problem}` : problem];
  });

  return problems[0] ?? null;
}

function EntriesForm({ text, draft, habits, durations }: FormProps) {
  // One clock for the whole form, so "today" and "hasn't come yet" agree between rows and Save.
  const [now] = useState(() => new Date());
  const [opened] = useState(() => openEntries(draft, now));
  const [entries, setEntries] = useState(opened);
  const isOnline = useIsOnline();
  const save = useSaveEntries();
  useDiscardGuard(
    !save.data && JSON.stringify(entries) !== JSON.stringify(opened),
    "These Habit logs are not saved.",
  );

  if (save.data) return <LogReceipt logged={save.data} undone="Removed these logs." />;

  const { rows, items } = logForm(entries, { habits, durations, now });
  const canSave = isOnline && !save.isPending && items !== null;

  const updateAt = (index: number) => (patch: Partial<FormEntry>) =>
    setEntries((current) =>
      current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );

  // Save is disabled while `items` is null, so a press always has items to send.
  const submit = () => {
    if (items !== null) save.mutate({ text, log: items });
  };

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4"
        keyboardShouldPersistTaps="handled"
      >
        {text !== "" && <Text variant="muted">“{text}”</Text>}
        {rows.map((row, index) => (
          <EntryRow
            // Rows have no id of their own; removing one remounts the rows after it, which hold no state.
            // eslint-disable-next-line eslint-react/no-array-index-key -- see above
            key={index}
            row={row}
            habits={habits}
            now={now}
            update={updateAt(index)}
            remove={
              entries.length > 1
                ? () => setEntries((current) => current.filter((_, i) => i !== index))
                : null
            }
          />
        ))}
        <Button
          variant="outline"
          className="self-start"
          onPress={() => setEntries((current) => [...current, blankEntry(now)])}
        >
          <Icon as={Plus} />
          <Text>Add another</Text>
        </Button>
      </ScrollView>
      <LogSaveFooter
        error={save.error}
        reason={saveReason(rows, isOnline)}
        disabled={!canSave}
        onSave={submit}
      />
    </View>
  );
}

/** `?draft=` holds the log box's proposed entries and `?text=` the sentence they came from. */
export default function LogEntryScreen() {
  const { draft, text = "" } = useLocalSearchParams<{ draft?: string; text?: string }>();
  // The week's logged entries are enough to warn about overlaps: an older day is rarely logged by hand.
  const { data, isError } = useTodayHabits();

  return (
    <ModalFrame title="Log habits" variant="side-sheet">
      {data ? (
        <EntriesForm
          text={text}
          draft={draft}
          habits={loggableHabits(data.habits)}
          durations={data.durations ?? {}}
        />
      ) : (
        <Text variant="muted" className="p-4">
          {isError ? "Couldn't load Habits." : "Loading…"}
        </Text>
      )}
    </ModalFrame>
  );
}
