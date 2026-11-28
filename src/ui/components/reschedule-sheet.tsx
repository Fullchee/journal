import type { Reschedule, Skip } from "@/core";
import { useState, type ReactNode } from "react";
import { View } from "react-native";

import { BottomSheet } from "./bottom-sheet";
import { Button } from "./button";
import { Input } from "./input";
import { Text } from "./text";

export type RescheduleChange = Pick<Reschedule, "to" | "cause" | "note">;

export interface RescheduleDateField {
  label: string;
  /** YYYY-MM-DD. */
  value: string;
  min: string;
  onChange: (value: string) => void;
}

export interface RescheduleSheetProps {
  name: string;
  /** YYYY-MM-DD the date starts at. */
  defaultDate: string;
  /** The earliest YYYY-MM-DD the One-off can move to. */
  min: string;
  /** The platform's date picker; Android and web each have their own. */
  renderDateField: (field: RescheduleDateField) => ReactNode;
  offline?: boolean;
  pending?: boolean;
  failed?: boolean;
  onSave: (change: RescheduleChange) => void;
  onClose: () => void;
}

const CAUSES: { cause: Reschedule["cause"]; label: string }[] = [
  { cause: "outside", label: "Couldn't — outside" },
  { cause: "avoidance", label: "Put it off" },
];

// The server keeps a note of at most 2000 characters.
const MAX_NOTE = 2000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Cause = Reschedule["cause"];

function NoteField({ note, onNote }: { note: string; onNote: (note: string) => void }) {
  return (
    <Input
      aria-label="Note"
      placeholder="Note (optional)"
      maxLength={MAX_NOTE}
      multiline
      rows={2}
      value={note}
      onChangeText={onNote}
    />
  );
}

/** "Why?" for a Reschedule: the outside or avoidance cause and an optional note, saved with the new date. */
function CausePicker({
  cause,
  note,
  onCause,
  onNote,
}: {
  cause: Cause | null;
  note: string;
  onCause: (cause: Cause) => void;
  onNote: (note: string) => void;
}) {
  return (
    <>
      <Text variant="muted">Why?</Text>
      <View className="flex-row flex-wrap gap-2">
        {CAUSES.map((option) => (
          <Button
            key={option.cause}
            variant={cause === option.cause ? "default" : "outline"}
            role="radio"
            aria-checked={cause === option.cause}
            onPress={() => onCause(option.cause)}
          >
            <Text>{option.label}</Text>
          </Button>
        ))}
      </View>
      <NoteField note={note} onNote={onNote} />
    </>
  );
}

/** Moves a One-off to a new date with a cause and an optional note; the old date stays in its history. */
export function RescheduleSheet({
  name,
  defaultDate,
  min,
  renderDateField,
  offline = false,
  pending = false,
  failed = false,
  onSave,
  onClose,
}: RescheduleSheetProps) {
  const [to, setTo] = useState(defaultDate);
  const [cause, setCause] = useState<Cause | null>(null);
  const [note, setNote] = useState("");
  const dateOk = ISO_DATE.test(to) && to >= min;

  return (
    <BottomSheet label={`Reschedule ${name}`} onClose={onClose}>
      <Text variant="title">{`Reschedule ${name}`}</Text>
      {renderDateField({ label: "New date", value: to, min, onChange: setTo })}
      {!dateOk && <Text className="text-sm text-destructive">{`Pick ${min} or later.`}</Text>}
      <CausePicker cause={cause} note={note} onCause={setCause} onNote={setNote} />
      {offline && <Text variant="muted">Rescheduling needs a connection.</Text>}
      {failed && <Text className="text-destructive">{"Couldn't reschedule. Try again."}</Text>}
      <View className="flex-row justify-end gap-2">
        <Button variant="outline" onPress={onClose}>
          <Text>Cancel</Text>
        </Button>
        <Button
          disabled={cause === null || !dateOk || offline || pending}
          onPress={() => cause !== null && onSave({ to, cause, note: note.trim() })}
        >
          <Text>Reschedule</Text>
        </Button>
      </View>
    </BottomSheet>
  );
}

export interface SkipSheetProps {
  name: string;
  onSave: (skip: Skip) => void;
  /** The day is already skipped, so closing keeps the Skip with no cause. */
  onClose: () => void;
}

/**
 * Asks why a Habit was skipped: one tap on a cause saves it, with a note if one was added. The answer is optional,
 * and it queues offline like the Skip itself.
 */
export function SkipSheet({ name, onSave, onClose }: SkipSheetProps) {
  // Null until "Add note" opens the field.
  const [note, setNote] = useState<string | null>(null);

  return (
    <BottomSheet label={`Skipped ${name}`} onClose={onClose}>
      <Text variant="title">{`Skipped ${name}`}</Text>
      <Text variant="muted">Why?</Text>
      <View className="flex-row flex-wrap gap-2">
        {CAUSES.map((option) => (
          <Button
            key={option.cause}
            variant="outline"
            onPress={() => onSave({ cause: option.cause, note: note?.trim() ?? "" })}
          >
            <Text>{option.label}</Text>
          </Button>
        ))}
      </View>
      {note === null ? (
        <Button variant="ghost" className="self-start" onPress={() => setNote("")}>
          <Text>Add note</Text>
        </Button>
      ) : (
        <NoteField note={note} onNote={setNote} />
      )}
      <View className="flex-row justify-end gap-2">
        <Button variant="outline" onPress={onClose}>
          <Text>Not now</Text>
        </Button>
      </View>
    </BottomSheet>
  );
}
