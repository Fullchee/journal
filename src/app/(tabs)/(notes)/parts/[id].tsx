import { SELF, type CheckIn, type Part, type PartBody, TIME_ZONE } from "@/core";
import { Button, Text, showUndoToast } from "@/ui";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { QueryView } from "@/components/note-body";
import { partSaveError, PartForm } from "@/components/part-form";
import { Screen, Section } from "@/components/screen";
import { StatusText } from "@/components/status-text";
import { useIsOnline } from "@/lib/data/data-provider";
import { useDeletePart, usePart, useRestorePart, useUpdatePart } from "@/lib/data/parts";

const DELETE_TOAST = "part-delete";

// The page is gone by the time Undo is pressed, so a failed Undo offers itself again in a toast.
function useUndoDelete({ name, role, wants, fears, feltIn, description, retired }: Part) {
  const { mutateAsync } = useRestorePart();

  const undo = () => {
    mutateAsync({ name, role, wants, fears, feltIn, description, retired }).catch(() =>
      showUndoToast({ id: DELETE_TOAST, message: `Couldn't undo · ${name}`, onUndo: undo }),
    );
  };

  return () => showUndoToast({ id: DELETE_TOAST, message: `Deleted · ${name}`, onUndo: undo });
}

// A Part a Check-in names keeps its history, so it can only be retired; an unused one can be deleted, with Undo.
function DeletePart({ part, disabled }: { part: Part; disabled: boolean }) {
  const remove = useDeletePart(part.id);
  const offerUndo = useUndoDelete(part);

  const onDeleted = () => {
    router.replace("/parts");
    offerUndo();
  };

  return (
    <View className="border-border mt-6 gap-2 border-t pt-6">
      {remove.isError ? (
        <StatusText tone="error">{"Couldn't delete the part. Try again."}</StatusText>
      ) : null}
      <Button
        variant="destructive"
        className="h-11 self-start"
        disabled={disabled || remove.isPending}
        onPress={() => remove.mutate(undefined, { onSuccess: onDeleted })}
      >
        <Text>Delete part</Text>
      </Button>
    </View>
  );
}

function PartEditor({ part, used }: { part: Part; used: boolean }) {
  const isOnline = useIsOnline();
  const update = useUpdatePart(part.id);
  const { name, role, wants, fears, feltIn, description } = part;

  return (
    <View className="gap-4">
      {isOnline ? null : <Text variant="muted">Editing needs a connection.</Text>}
      <PartForm
        initial={{ name, role, wants, fears, feltIn, description }}
        disabled={!isOnline || update.isPending}
        error={partSaveError(update.error)}
        onSave={(draft) => update.mutate(draft)}
      />
      {update.isSuccess ? <StatusText>Saved.</StatusText> : null}
      <Button
        variant="outline"
        className="h-11 self-start"
        disabled={!isOnline || update.isPending}
        onPress={() => update.mutate({ retired: !part.retired })}
      >
        <Text>{part.retired ? "Bring back" : "Retire part"}</Text>
      </Button>
      {used ? null : <DeletePart part={part} disabled={!isOnline} />}
    </View>
  );
}

const checkInLabel = (checkIn: CheckIn, part: Part) => {
  const at = new Date(checkIn.checkedInAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });

  const inControl =
    checkIn.inControl !== null && checkIn.inControl !== SELF && checkIn.inControl.id === part.id;

  const how = inControl ? "In control" : "Present";

  return `${at} · ${checkIn.zone} · ${how}`;
};

function PartPage({ part, checkIns, used }: PartBody) {
  return (
    <>
      <View className="gap-1">
        <Text aria-level={1} variant="headline">
          {part.name}
        </Text>
        {part.retired ? <Text variant="muted">Retired: hidden from the Check-in.</Text> : null}
      </View>
      <PartEditor key={part.id} part={part} used={used} />
      <Section title="Recent Check-ins">
        {checkIns.length === 0 ? (
          <Text variant="muted">No Check-in names this part yet.</Text>
        ) : (
          checkIns.map((checkIn) => (
            <View key={checkIn.id} className="border-border gap-1 border-b py-2">
              <Text>{checkInLabel(checkIn, part)}</Text>
              {checkIn.note === "" ? null : <Text variant="muted">{checkIn.note}</Text>}
            </View>
          ))
        )}
      </Section>
    </>
  );
}

/** One Part: its form, then the Check-ins that named it. */
export default function PartScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen>
      <QueryView query={usePart(Number(id))}>{(body) => <PartPage {...body} />}</QueryView>
    </Screen>
  );
}
