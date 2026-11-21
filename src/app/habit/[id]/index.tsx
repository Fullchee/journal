import {
  LogEntry,
  NewHabit,
  cueMissing,
  draftOfNewHabit,
  dueDateLabel,
  canFixDate,
  hasHistory,
  isOneOff,
  torontoDay,
  newHabitDraft,
  withDetails,
  type Draft,
  type Goal,
  type Habit,
  type HabitDetails,
  type Kind,
  type Reschedule,
  causeLine,
} from "@/core";
import { Button, Icon, Text } from "@/ui";
import { router, useLocalSearchParams, usePreventRemove } from "expo-router";
import { Archive, ArchiveRestore, CalendarPlus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { HabitCircle } from "@/components/habits/habit-circle";
import { HabitForm, type DetailsStatus } from "@/components/habits/habit-form";
import { CalendarLinks } from "@/components/habits/calendar-links";
import { HistorySummary } from "@/components/habits/habit-history";
import { DurationImports } from "@/components/habits/duration-imports";
import { FitbitImport } from "@/components/habits/fitbit-import";
import { ModalFrame } from "@/components/modal-frame";
import { dismissModal } from "@/components/modal-header";
import { ApiError } from "@/lib/api/errors";
import { confirm } from "@/lib/confirm";
import { useIsOnline } from "@/lib/data/data-provider";
import { useHabitDetails } from "@/lib/data/habit-draft";
import {
  missingHabitText,
  useDeleteHabit,
  useHabitTracker,
  useSaveHabit,
  type HabitsBody,
} from "@/lib/data/habits";
import { useHabitHistory } from "@/lib/data/streaks";

const saveError = (error: Error) =>
  error instanceof ApiError
    ? "Couldn't save. Check the name and try again."
    : "Couldn't reach the server. Try again.";

// The log box passes what the sentence said was done in `?entry`, to log once the Habit exists.
function sentenceEntry(entry: string | undefined) {
  if (entry === undefined) return null;

  try {
    return LogEntry.safeParse(JSON.parse(entry)).data ?? null;
  } catch {
    return null;
  }
}

// A miss never shows red: avoidance reads in the same muted line as an outside cause.
function RescheduleRow({ from, to, cause, note }: Reschedule) {
  return (
    <View role="listitem" className="gap-0.5">
      <Text>{`${dueDateLabel(from)} → ${dueDateLabel(to)}`}</Text>
      <Text variant="muted">{causeLine({ cause, note })}</Text>
    </View>
  );
}

function RescheduleHistory({ reschedules }: { reschedules: Reschedule[] }) {
  return (
    <View className="border-border gap-2 border-t pt-4">
      <Text aria-level={2} variant="headline">
        Reschedules
      </Text>
      {reschedules.length === 0 ? (
        <Text variant="muted">Never rescheduled.</Text>
      ) : (
        <View role="list" aria-label="Reschedules" className="gap-3">
          {reschedules.map((reschedule) => (
            <RescheduleRow key={reschedule.createdAt} {...reschedule} />
          ))}
        </View>
      )}
    </View>
  );
}

// Discard asks only when something changed; Save and Delete call the returned leave, which closes without asking.
function useDiscardGuard(changed: boolean) {
  const [closing, setClosing] = useState(false);

  const allowClose = usePreventRemove(changed && !closing, ({ repeat }) => {
    void confirm({
      title: "Discard changes?",
      message: "Your edits to this Habit are not saved.",
      action: "Discard",
    }).then((discard) => {
      if (!discard) return;

      setClosing(true);
      repeat();
    });
  });

  return () => {
    setClosing(true);
    allowClose();
  };
}

function detailsStatusOf({
  isLoading,
  isError,
}: {
  isLoading: boolean;
  isError: boolean;
}): DetailsStatus {
  if (isLoading) return "loading";

  return isError ? "failed" : "idle";
}

/**
 * The form's opening and current Habit. A proposed Habit's details arrive after the form opens and fill only blank
 * fields; they go into `start` too, so they don't count as an edit that Cancel asks about.
 */
function useEditorDrafts(opened: Draft, proposed: NewHabit | null, text: string | undefined) {
  // A refetch while the form is open must not count as an edit.
  const [start, setStart] = useState(() => structuredClone(opened));
  const [draft, setDraft] = useState(start);
  const query = useHabitDetails(proposed, text);
  const [applied, setApplied] = useState<HabitDetails>();

  if (query.data !== undefined && query.data !== applied) {
    const details = query.data;

    setApplied(details);
    setStart((current) => withDetails(current, details));
    setDraft((current) => withDetails(current, details));
  }

  return { start, draft, setDraft, detailsStatus: detailsStatusOf(query) };
}

// A new Habit started in the past has days to log, and History is where past Days are tapped.
const landsOnHistory = (draft: Draft, today: string) =>
  draft.id === undefined && hasHistory(draft) && draft.startDate !== "" && draft.startDate < today;

const locksDate = (start: Draft, reschedules: Reschedule[]) =>
  start.id !== undefined &&
  isOneOff(start) &&
  !canFixDate(start, reschedules, torontoDay(new Date()));

function Editor({
  opened,
  proposed,
  habits,
  goals,
  reschedules,
}: {
  opened: Draft;
  proposed: NewHabit | null;
  habits: Habit[];
  goals: Goal[];
  reschedules: Reschedule[];
}) {
  const params = useLocalSearchParams<{ entry?: string; text?: string }>();
  const [entry] = useState(() => sentenceEntry(params.entry));
  const { start, draft, setDraft, detailsStatus } = useEditorDrafts(opened, proposed, params.text);
  const [isDateLocked] = useState(() => locksDate(start, reschedules));
  const isOnline = useIsOnline();
  const save = useSaveHabit();
  const remove = useDeleteHabit();
  const leave = useDiscardGuard(JSON.stringify(draft) !== JSON.stringify(start));
  const savedId = draft.id;

  const close = () => {
    leave();
    dismissModal();
  };

  // The log form takes this screen's place, so closing it returns to where the sentence was typed.
  const afterSave = (id: string) => {
    if (entry) {
      leave();
      router.replace({
        pathname: "/log-entry",
        params: { text: params.text ?? "", draft: JSON.stringify([{ ...entry, habit: id }]) },
      });

      return;
    }

    if (landsOnHistory(draft, torontoDay(new Date()))) {
      leave();
      router.replace({ pathname: "/habit/[id]/history", params: { id } });

      return;
    }

    close();
  };

  const deleteHabit = async (id: string) => {
    const sure = await confirm({
      title: `Delete "${draft.name}"?`,
      message: "Its history goes with it.",
      action: "Delete",
    });

    if (sure) remove.mutate(id, { onSuccess: close });
  };

  const busy = save.isPending || remove.isPending;

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4"
        keyboardShouldPersistTaps="handled"
      >
        <HistoryLink id={start.id} />
        {!isOnline && <Text className="text-destructive">Editing needs a connection.</Text>}
        <HabitForm
          draft={draft}
          update={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          habits={habits}
          goals={goals}
          isDateLocked={isDateLocked}
          detailsStatus={detailsStatus}
          circle={<HabitCircle draft={draft} />}
        />
        {savedId !== undefined && <SavedHabitImports id={savedId} record={start.record} />}
        {savedId !== undefined && (
          <SavedHabitActions
            draft={draft}
            reschedules={reschedules}
            canDelete={isOnline && !busy}
            onToggleActive={() => setDraft((current) => ({ ...current, active: !current.active }))}
            onDelete={() => void deleteHabit(savedId)}
          />
        )}
      </ScrollView>
      <EditorFooter
        saveFailure={save.error}
        isDeleteFailed={remove.isError}
        canSave={isOnline && !busy && cueMissing(draft) === null}
        saveLabel={entry ? "Save and log" : "Save"}
        onSave={() => save.mutate(draft, { onSuccess: afterSave })}
      />
    </View>
  );
}

// Imports log to a saved Habit by its id, so a new Habit gets them after its first save.
function SavedHabitImports({ id, record }: { id: string; record: Draft["record"] }) {
  return (
    <>
      {record === "duration" && <DurationImports habit={id} />}
      <FitbitImport habit={id} record={record} />
      <CalendarLinks habit={id} />
    </>
  );
}

function EditorFooter({
  saveFailure,
  isDeleteFailed,
  canSave,
  saveLabel,
  onSave,
}: {
  saveFailure: Error | null;
  isDeleteFailed: boolean;
  canSave: boolean;
  saveLabel: string;
  onSave: () => void;
}) {
  return (
    <View className="border-border gap-2 border-t p-4">
      {saveFailure && <Text className="text-destructive">{saveError(saveFailure)}</Text>}
      {isDeleteFailed && <Text className="text-destructive">{"Couldn't delete. Try again."}</Text>}
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={dismissModal}>
          <Text>Cancel</Text>
        </Button>
        <Button className="flex-1" disabled={!canSave} onPress={onSave}>
          <Text>{saveLabel}</Text>
        </Button>
      </View>
    </View>
  );
}

// A One-off has a Reschedule history instead of a backlog.
function SavedHabitActions({
  draft,
  reschedules,
  canDelete,
  onToggleActive,
  onDelete,
}: {
  draft: Draft;
  reschedules: Reschedule[];
  canDelete: boolean;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const oneOff = isOneOff(draft);

  return (
    <>
      {oneOff && <RescheduleHistory reschedules={reschedules} />}
      <View className="border-border mt-4 flex-row flex-wrap gap-2 border-t pt-4">
        {!oneOff && (
          <Button variant="outline" className="flex-1" onPress={onToggleActive}>
            <Icon as={draft.active ? Archive : ArchiveRestore} />
            <Text>{draft.active ? "Move to backlog" : "Move out of backlog"}</Text>
          </Button>
        )}
        <Button variant="destructive" className="flex-1" disabled={!canDelete} onPress={onDelete}>
          <Icon as={Trash2} className="text-white" />
          <Text>Delete habit</Text>
        </Button>
      </View>
    </>
  );
}

/** A saved recurring Habit's History summary; a new Habit, a One-off and a Reference Habit have none. */
function HistoryLink({ id }: { id: string | undefined }) {
  const { data } = useHabitTracker();
  const habit = data?.habits.find((h) => h.id === id);

  return data !== undefined && habit !== undefined && hasHistory(habit) ? (
    <HistorySummaryLink habit={habit} body={data} />
  ) : null;
}

// The editor opened from History goes back to it; opened anywhere else, History takes its place.
function HistorySummaryLink({ habit, body }: { habit: Habit; body: HabitsBody }) {
  const [now] = useState(() => new Date());
  const history = useHabitHistory(habit, body, now);

  if (history === null) return null;

  const openHistory = () =>
    router.dismissTo({ pathname: "/habit/[id]/history", params: { id: habit.id } });

  return (
    <View className="gap-2">
      <Pressable
        role="link"
        aria-label={`History of ${habit.name}`}
        className="border-border rounded-md border p-3"
        onPress={openHistory}
      >
        <HistorySummary history={history} />
      </Pressable>
      <View className="flex-row">
        <Button
          variant="outline"
          size="sm"
          aria-label={`Log a past day for ${habit.name}`}
          onPress={openHistory}
        >
          <Icon as={CalendarPlus} />
          <Text>Log a past day</Text>
        </Button>
      </View>
    </View>
  );
}

const KINDS: readonly Kind[] = ["good", "bad"];

// The log box's guesses arrive as JSON in `?draft`; one that doesn't parse opens a blank editor.
function proposedHabit(draft: string | undefined) {
  if (draft === undefined) return null;

  try {
    return NewHabit.safeParse(JSON.parse(draft)).data ?? null;
  } catch {
    return null;
  }
}

const newDraft = (kind: string | undefined, proposed: NewHabit | null): Draft =>
  proposed ? draftOfNewHabit(proposed) : newHabitDraft(KINDS.find((k) => k === kind) ?? "good");

/**
 * `/habit/new` opens an empty editor (`?kind=bad` starts a bad one, `?draft=` fills in the log box's guesses,
 * `?entry=` and `?text=` log the sentence after Save); any other id edits that Habit.
 */
export default function HabitEditorScreen() {
  const { id, kind, draft } = useLocalSearchParams<{ id: string; kind?: string; draft?: string }>();
  const isNew = id === "new";
  const { data, isError } = useHabitTracker();
  const habit = data?.habits.find((h) => h.id === id);
  const proposed = isNew ? proposedHabit(draft) : null;
  const start: Draft | undefined = isNew ? newDraft(kind, proposed) : habit;

  return (
    <ModalFrame title={isNew ? "New habit" : "Edit habit"} variant="side-sheet">
      {data && start ? (
        <Editor
          key={id}
          opened={start}
          proposed={proposed}
          habits={data.habits}
          goals={data.goals ?? []}
          reschedules={data.reschedules?.[id] ?? []}
        />
      ) : (
        <Text variant="muted" className="m-4">
          {missingHabitText(data !== undefined, isError)}
        </Text>
      )}
    </ModalFrame>
  );
}
