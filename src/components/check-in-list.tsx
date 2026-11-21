import {
  byDay,
  checkInRows,
  draftOf,
  listOf,
  patchForFields,
  type CheckInDraft,
  type CheckInPatch,
  type DetailRow,
  type EditField,
  type PartRef,
  formatDay,
  clockLabel,
  torontoTime,
} from "@/core";
import { Button, CheckInFields, Text, cn } from "@/ui";
import { useState, type ReactNode } from "react";
import { Pressable, View, type HostInstance } from "react-native";

import { newPartButton } from "@/components/new-part-button";
import { checkInKey, type ShownCheckIn } from "@/lib/data/check-ins";
import { useIsOnline } from "@/lib/data/data-provider";

const timeOf = (c: ShownCheckIn) => clockLabel(torontoTime(c.checkedInAt));

const dayLabel = (day: string) =>
  formatDay(day, { weekday: "long", month: "short", day: "numeric" });

interface Editing {
  fields: EditField[];
  draft: CheckInDraft;
}

// A row the owner taps to edit, named for TalkBack by what it edits.
function Row({
  label,
  editLabel,
  onEdit,
  children,
}: {
  label: ReactNode;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onEdit}
      role="button"
      aria-label={editLabel}
      className="active:bg-accent min-h-12 flex-row items-baseline gap-3 py-2.5"
    >
      <View className="w-24">{label}</View>
      <View className="flex-1">{children}</View>
    </Pressable>
  );
}

function DetailValue({ c, row }: { c: ShownCheckIn; row: DetailRow }) {
  if (row.field !== "feelings") return <Text>{row.value}</Text>;

  return (
    <View className="flex-row flex-wrap gap-1.5" aria-label="Feelings">
      {listOf(c.thought).map((feeling) => (
        <View key={feeling} className="border-border rounded-sm border px-2 py-0.5">
          <Text className="text-sm">{feeling}</Text>
        </View>
      ))}
    </View>
  );
}

interface EntryProps {
  c: ShownCheckIn;
  places: string[];
  habitNames: (place: string) => string[];
  partNames: PartRef[];
  selected: boolean;
  onEdit: (c: ShownCheckIn, patch: CheckInPatch) => void;
  /** Hands the card's view to the screen, so a tap on the chart can scroll to it. */
  cardRef: (view: HostInstance | null) => void;
}

// One Check-in: its time and zone, then its filled details; a tap on any of them edits it in place.
function CheckInEntry({ c, places, habitNames, partNames, selected, onEdit, cardRef }: EntryProps) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const isOnline = useIsOnline();
  const shown = checkInRows(c);
  const edit = (fields: EditField[]) => setEditing({ fields, draft: draftOf(c) });

  const save = ({ fields, draft }: Editing) => {
    const patch = patchForFields(fields, c, draft);

    if (Object.keys(patch).length > 0) onEdit(c, patch);
    setEditing(null);
  };

  return (
    <View
      ref={cardRef}
      testID={`check-in-${c.id}`}
      className={cn(
        "rounded-md border bg-card px-4",
        selected ? "border-2 border-primary" : "border-border",
      )}
    >
      {editing ? (
        <View className="gap-4 py-4">
          <CheckInFields
            fields={editing.fields}
            draft={editing.draft}
            places={places}
            habitNames={habitNames}
            partNames={partNames}
            newPart={isOnline ? newPartButton : undefined}
            onChange={(draft) => setEditing({ ...editing, draft })}
          />
          <View className="flex-row gap-2">
            <Button onPress={() => save(editing)}>
              <Text>Save</Text>
            </Button>
            <Button variant="outline" onPress={() => setEditing(null)}>
              <Text>Cancel</Text>
            </Button>
          </View>
        </View>
      ) : (
        <View>
          <Row
            editLabel={`Edit time and zone, ${timeOf(c)}: ${shown.zone}`}
            onEdit={() => edit(["time", "zone"])}
            label={<Text className="font-caption text-lg">{timeOf(c)}</Text>}
          >
            <Text>{shown.zone}</Text>
          </Row>
          {shown.rows.map((row) => (
            <Row
              key={row.label}
              editLabel={`Edit ${row.label}, ${timeOf(c)}: ${row.value}`}
              onEdit={() => edit([row.field])}
              label={<Text variant="muted">{row.label}</Text>}
            >
              <DetailValue c={c} row={row} />
            </Row>
          ))}
          {shown.missing.length > 0 && (
            <Button variant="ghost" className="mb-2 self-start" onPress={() => edit(shown.missing)}>
              <Text>Add details</Text>
            </Button>
          )}
        </View>
      )}
    </View>
  );
}

type CheckInListProps = Omit<EntryProps, "c" | "selected" | "cardRef"> & {
  checkIns: ShownCheckIn[];
  selectedKey?: number | string | undefined;
  cardRef: (key: number | string, view: HostInstance | null) => void;
};

/** The Check-ins grouped by local day, newest first. */
export function CheckInList({ checkIns, selectedKey, cardRef, ...props }: CheckInListProps) {
  return (
    <View className="gap-5">
      {byDay(checkIns).map((d) => (
        <View key={d.day} className="gap-2">
          <Text aria-level={3} variant="title">
            {dayLabel(d.day)}
          </Text>
          {d.checkIns.map((c) => (
            <CheckInEntry
              key={c.clientId ?? c.id}
              c={c}
              selected={checkInKey(c) === selectedKey}
              cardRef={(view) => cardRef(checkInKey(c), view)}
              {...props}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
