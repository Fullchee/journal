import {
  AMOUNTS,
  ENERGY,
  LEVELS,
  PLEASANTNESS,
  SELF,
  feelingsFor,
  torontoDay,
  weekdayOf,
  type CheckInDraft,
  type EditField,
  type PartRef,
} from "@/core";
import * as React from "react";
import { View } from "react-native";

import { Button } from "./button";
import { DateField } from "./date-field";
import { Input } from "./input";
import { Text } from "./text";
import { TimeField } from "./time-field";
import { cn } from "@/ui/lib/utils";

const LEGENDS: Record<EditField, string> = {
  time: "When?",
  zone: "How's the weather?",
  place: "Where were you?",
  doing: "What were you doing?",
  feelings: "How were you feeling?",
  note: "What does it feel like?",
  tense: "Tense or on edge?",
  low: "Sad or down?",
  tired: "Tired or drained?",
};

/** Draws "New part…" on the Check-in; `select` picks the Part it creates. */
type NewPartSlot = (select: (part: PartRef) => void) => React.ReactNode;

function Chip({
  on,
  label,
  onPress,
  className,
}: {
  on: boolean;
  label: string;
  onPress: () => void;
  className?: string;
}) {
  return (
    <Button
      size="sm"
      variant={on ? "default" : "outline"}
      aria-pressed={on}
      accessibilityLabel={label}
      className={cn("min-h-12", className)}
      onPress={onPress}
    >
      <Text>{label}</Text>
    </Button>
  );
}

// "Other" reveals a text box for a value no chip names; a saved value no chip names opens with it shown.
function PickOrOther({
  label,
  options,
  value,
  placeholder,
  onPick,
}: {
  label: string;
  options: string[];
  value: string;
  placeholder: string;
  onPick: (value: string) => void;
}) {
  const [typing, setTyping] = React.useState(false);
  const other = typing || (value !== "" && !options.includes(value));

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <Chip
            key={option}
            label={option}
            on={!other && value === option}
            onPress={() => {
              setTyping(false);
              onPick(value === option ? "" : option);
            }}
          />
        ))}
        <Chip
          label="Other"
          on={other}
          onPress={() => {
            setTyping(!other);
            onPick("");
          }}
        />
      </View>
      {other && (
        <Input
          autoFocus
          accessibilityLabel={label}
          placeholder={placeholder}
          value={value}
          onChangeText={onPick}
        />
      )}
    </View>
  );
}

// The amount is the chip's index; a re-tap clears the row back to untouched, which is not None.
function Amount({
  value,
  onPick,
}: {
  value: number | null;
  onPick: (value: number | null) => void;
}) {
  return (
    <View className="flex-row gap-2">
      {AMOUNTS.map((label, n) => (
        <Chip
          key={label}
          label={label}
          on={value === n}
          className="flex-1"
          onPress={() => onPick(value === n ? null : n)}
        />
      ))}
    </View>
  );
}

// A segmented control, so the two axes read as filters rather than feelings.
function Axis<O extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly O[];
  value: O | null;
  onPick: (value: O | null) => void;
}) {
  return (
    <View role="radiogroup" aria-label={label} className="gap-1">
      <Text variant="label" className="text-muted-foreground">
        {label}
      </Text>
      <View className="border-border flex-row self-start rounded-full border p-0.5">
        {options.map((option) => (
          <Button
            key={option}
            size="sm"
            role="radio"
            aria-checked={value === option}
            accessibilityLabel={option}
            variant={value === option ? "default" : "ghost"}
            className="min-h-12 rounded-full"
            onPress={() => onPick(value === option ? null : option)}
          >
            <Text>{option}</Text>
          </Button>
        ))}
      </View>
    </View>
  );
}

type Quadrant = Pick<CheckInDraft, "pleasantness" | "feelingEnergy">;

function Feelings({
  value,
  quadrant: { pleasantness, feelingEnergy },
  onChange,
  onQuadrant,
}: {
  value: string[];
  quadrant: Quadrant;
  onChange: (feelings: string[]) => void;
  onQuadrant: (quadrant: Partial<Quadrant>) => void;
}) {
  const quadrant = feelingsFor(pleasantness ?? "", feelingEnergy ?? "");
  // Picked feelings stay on offer when a filter would hide them, so they can be unpicked.
  const offered = [...new Set([...value, ...quadrant])];

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-4">
        <Axis
          label="Pleasantness"
          options={PLEASANTNESS}
          value={pleasantness}
          onPick={(next) => onQuadrant({ pleasantness: next })}
        />
        <Axis
          label="Energy"
          options={ENERGY}
          value={feelingEnergy}
          onPick={(next) => onQuadrant({ feelingEnergy: next })}
        />
      </View>
      <View className="border-border gap-2 border-t pt-3">
        {quadrant.length === 0 && (
          <Text variant="muted">
            Pick pleasant or unpleasant, and high or low, to see feelings.
          </Text>
        )}
        <View className="flex-row flex-wrap gap-2">
          {offered.map((feeling) => (
            <Chip
              key={feeling}
              label={feeling}
              on={value.includes(feeling)}
              onPress={() =>
                onChange(
                  value.includes(feeling)
                    ? value.filter((f) => f !== feeling)
                    : [...value, feeling],
                )
              }
            />
          ))}
        </View>
      </View>
    </View>
  );
}

interface FieldProps {
  field: EditField;
  draft: CheckInDraft;
  places: string[];
  /** "What were you doing?" offers these as chips for the draft's place. */
  habitNames: (place: string) => string[];
  /** "What does it feel like?" offers these IFS Parts as chips, by name. */
  partNames: PartRef[];
  /** Left out offline: a Part is created on the server, so "New part…" is disabled. */
  newPart?: NewPartSlot | undefined;
  /** "What were you doing?" also goes to the log box, so it asks when it started and ended. */
  logsDoing?: boolean;
  onChange: (draft: CheckInDraft) => void;
}

interface EditorProps {
  draft: CheckInDraft;
  places: string[];
  habitNames: (place: string) => string[];
  partNames: PartRef[];
  newPart?: NewPartSlot | undefined;
  logsDoing?: boolean;
  set: (patch: Partial<CheckInDraft>) => void;
}

// `when` is a datetime-local value; the Check-in card edits it before a Check-in exists.
// Android's own date and clock dialogs; a Check-in can't be in the future, so the last day is today.
function TimeInput({ when, onChange }: { when: string; onChange: (when: string) => void }) {
  const [date = "", time = ""] = when.split("T", 2);
  const [today] = React.useState(() => torontoDay(new Date()));

  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <DateField
          label="Date"
          value={date}
          max={today}
          onChange={(next) => onChange(`${next}T${time}`)}
        />
        <TimeField label="Time" value={time} onChange={(next) => onChange(`${date}T${next}`)} />
      </View>
      <Text variant="muted" aria-live="polite">
        {weekdayOf(when)}
      </Text>
    </View>
  );
}

function TimeEditor({ draft, set }: EditorProps) {
  return <TimeInput when={draft.when} onChange={(when) => set({ when })} />;
}

function ZoneEditor({ draft, set }: EditorProps) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {LEVELS.map((l) => (
        <Chip
          key={l.score}
          label={`${l.zone}, ${l.half} half`}
          on={draft.score === l.score}
          onPress={() => set({ score: l.score })}
        />
      ))}
    </View>
  );
}

// A place with one fitting activity, such as the Gym, fills an empty "What were you doing?" with it.
function PlaceEditor({ draft, places, habitNames, set }: EditorProps) {
  const pick = (place: string) => {
    const options = habitNames(place);
    const only = options.length === 1 ? options[0] : undefined;

    set(only === undefined || draft.doing !== "" ? { place } : { place, doing: only });
  };

  return (
    <PickOrOther
      label="Other place"
      options={places}
      value={draft.place}
      placeholder="Other place"
      onPick={pick}
    />
  );
}

function DoingEditor({ draft, habitNames, logsDoing = false, set }: EditorProps) {
  return (
    <View className="gap-2">
      <PickOrOther
        label="Other activity"
        options={habitNames(draft.place)}
        value={draft.doing}
        placeholder="walked 20 min, read a book"
        onPick={(doing) => set({ doing })}
      />
      {logsDoing && draft.doing !== "" && (
        <View className="flex-row flex-wrap gap-4">
          <View className="gap-1">
            <Text variant="muted">Started</Text>
            <TimeField
              label="Started"
              value={draft.doingStart}
              onChange={(doingStart) => set({ doingStart })}
            />
          </View>
          <View className="gap-1">
            <Text variant="muted">Ended</Text>
            <TimeField
              label="Ended"
              value={draft.doingEnd}
              onChange={(doingEnd) => set({ doingEnd })}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function FeelingsEditor({ draft, set }: EditorProps) {
  return (
    <Feelings
      value={draft.feelings}
      quadrant={draft}
      onChange={(feelings) => set({ feelings })}
      onQuadrant={set}
    />
  );
}

// A Part is created on the server, so offline the Check-in picks only Parts that exist.
function OfflineNewPart() {
  return (
    <View className="flex-row items-center gap-2">
      <Button variant="outline" size="sm" disabled>
        <Text>New part…</Text>
      </Button>
      <Text variant="muted">Needs a connection</Text>
    </View>
  );
}

// A Part already on the Check-in stays on offer, such as a retired one, so it can be unpicked.
const offeredParts = (options: PartRef[], picked: PartRef[]) => [
  ...options,
  ...picked.filter((part) => options.every((option) => option.id !== part.id)),
];

function InControl({
  options,
  value,
  onPick,
}: {
  options: PartRef[];
  value: CheckInDraft["inControl"];
  onPick: (inControl: CheckInDraft["inControl"]) => void;
}) {
  const part = value === null || value === SELF ? [] : [value];

  return (
    <View className="flex-row flex-wrap gap-2">
      <Chip label={SELF} on={value === SELF} onPress={() => onPick(value === SELF ? null : SELF)} />
      {offeredParts(options, part).map((option) => {
        const on = part[0]?.id === option.id;

        return (
          <Chip
            key={option.id}
            label={option.name}
            on={on}
            onPress={() => onPick(on ? null : option)}
          />
        );
      })}
    </View>
  );
}

function PartsPresent({
  options,
  value,
  newPart,
  onChange,
}: {
  options: PartRef[];
  value: PartRef[];
  newPart: NewPartSlot | undefined;
  onChange: (parts: PartRef[]) => void;
}) {
  const isPicked = (part: PartRef) => value.some((picked) => picked.id === part.id);

  const select = (part: PartRef) => {
    if (!isPicked(part)) onChange([...value, part]);
  };

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {offeredParts(options, value).map((part) => (
          <Chip
            key={part.id}
            label={part.name}
            on={isPicked(part)}
            onPress={() =>
              onChange(isPicked(part) ? value.filter((p) => p.id !== part.id) : [...value, part])
            }
          />
        ))}
      </View>
      {newPart ? newPart(select) : <OfflineNewPart />}
    </View>
  );
}

const NOTE_LABEL = "Anything else? (optional)";

// IFS: who is in control (Self or a part) and who else is present, then the note.
function NoteEditor({ draft, partNames, newPart, set }: EditorProps) {
  return (
    <View className="gap-3">
      <View role="group" aria-label="Who's in control?" className="gap-2">
        <Text variant="label" className="text-muted-foreground">
          Who's in control?
        </Text>
        <InControl
          options={partNames}
          value={draft.inControl}
          onPick={(inControl) => set({ inControl })}
        />
      </View>
      <View role="group" aria-label="Who else is present?" className="gap-2">
        <Text variant="label" className="text-muted-foreground">
          Who else is present?
        </Text>
        <PartsPresent
          options={partNames}
          value={draft.parts}
          newPart={newPart}
          onChange={(parts) => set({ parts })}
        />
      </View>
      <View className="gap-2">
        <Text variant="label" className="text-muted-foreground">
          {NOTE_LABEL}
        </Text>
        <Input
          multiline
          rows={3}
          className="min-h-24"
          textAlignVertical="top"
          accessibilityLabel={NOTE_LABEL}
          placeholder="A thought, a worry, what helped"
          value={draft.note}
          onChangeText={(note) => set({ note })}
        />
      </View>
    </View>
  );
}

function TenseEditor({ draft, set }: EditorProps) {
  return <Amount value={draft.tense} onPick={(tense) => set({ tense })} />;
}

function LowEditor({ draft, set }: EditorProps) {
  return <Amount value={draft.low} onPick={(low) => set({ low })} />;
}

function TiredEditor({ draft, set }: EditorProps) {
  return <Amount value={draft.tired} onPick={(tired) => set({ tired })} />;
}

const EDITORS: Record<EditField, (props: EditorProps) => React.ReactNode> = {
  time: TimeEditor,
  zone: ZoneEditor,
  place: PlaceEditor,
  doing: DoingEditor,
  feelings: FeelingsEditor,
  note: NoteEditor,
  tense: TenseEditor,
  low: LowEditor,
  tired: TiredEditor,
};

function FieldInput({ field, draft, onChange, ...options }: FieldProps) {
  const Editor = EDITORS[field];

  return <Editor draft={draft} {...options} set={(patch) => onChange({ ...draft, ...patch })} />;
}

type CheckInFieldsProps = Omit<FieldProps, "field"> & {
  /** Several fields share one form, each under its own legend; one field shows alone. */
  fields: EditField[];
};

// The inputs for a Check-in's time, zone and details, used by the Check-in form and the list's edits.
function CheckInFields({ fields, ...props }: CheckInFieldsProps) {
  const [only] = fields;

  if (only !== undefined && fields.length === 1) return <FieldInput field={only} {...props} />;

  return (
    <View className="gap-4">
      {fields.map((field) => (
        <View key={field} role="group" aria-label={LEGENDS[field]} className="gap-2">
          <Text variant="muted">{LEGENDS[field]}</Text>
          <FieldInput field={field} {...props} />
        </View>
      ))}
    </View>
  );
}

export { CheckInFields, TimeInput };

export type { CheckInFieldsProps, NewPartSlot };
