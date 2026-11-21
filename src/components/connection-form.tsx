import {
  CADENCES,
  CLOSENESSES,
  MEETUP_LEAD_MINUTES,
  WEEKDAYS,
  cadenceForCloseness,
  closenessLabel,
  torontoDay,
  toggleDay,
  type ConnectionDate,
  type Meetup,
  dayOfYearless,
  hasYear,
  withYear,
  type ConnectionRef,
} from "@/core";
import { Button, DateField, Input, Switch, Text, TimeField } from "@/ui";
import { useState } from "react";
import { View } from "react-native";

import { ChoiceRow, type Choice } from "@/components/choice-row";
import type { ConnectionDraft } from "@/lib/data/connections";

import { LinksField, MetThroughField } from "@/components/connection-people-fields";

const CLOSENESS_CHOICES: Choice<ConnectionDraft["closeness"]>[] = [
  { value: "", label: "None" },
  ...CLOSENESSES.map((c) => ({ value: c, label: closenessLabel(c) })),
];

const CADENCE_CHOICES: Choice<number | null>[] = [
  { value: null, label: "No reminder" },
  ...CADENCES.map((c) => ({ value: c.days, label: c.label })),
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text variant="muted">{label}</Text>
      {children}
    </View>
  );
}

const replaceAt = <T,>(items: T[], index: number, item: T) =>
  items.map((old, i) => (i === index ? item : old));

function MeetupFields({
  meetup,
  onChange,
  onRemove,
}: {
  meetup: Meetup;
  onChange: (m: Meetup) => void;
  onRemove: () => void;
}) {
  return (
    <View className="border-border gap-2 border-b pb-3">
      <View className="flex-row gap-2">
        <Input
          aria-label="Where you see them"
          className="flex-1"
          placeholder="Dragon boat practice"
          maxLength={100}
          value={meetup.label}
          onChangeText={(label) => onChange({ ...meetup, label })}
        />
        <Button variant="ghost" className="h-11" onPress={onRemove}>
          <Text>Remove</Text>
        </Button>
      </View>
      <View role="group" aria-label="Weekdays" className="flex-row gap-1">
        {WEEKDAYS.map((name, day) => (
          <Button
            key={name}
            size="sm"
            // oxlint-disable-next-line shadcn/no-restyle -- seven day toggles share one row, so each drops its side padding
            className="h-11 flex-1 px-0"
            aria-pressed={meetup.days.includes(day)}
            variant={meetup.days.includes(day) ? "default" : "outline"}
            onPress={() => onChange({ ...meetup, days: toggleDay(meetup.days, day) })}
          >
            <Text>{name}</Text>
          </Button>
        ))}
      </View>
      <View className="flex-row items-center gap-2">
        <Text variant="muted">Starts at</Text>
        <TimeField
          label="Starts at"
          value={meetup.time ?? ""}
          onChange={(time) => onChange({ ...meetup, time })}
        />
        {meetup.time !== undefined && meetup.time !== "" && (
          <Button
            variant="ghost"
            className="h-11"
            aria-label="Clear start time"
            onPress={() => onChange({ ...meetup, time: "" })}
          >
            <Text>Clear</Text>
          </Button>
        )}
      </View>
      <Text variant="muted">
        {meetup.days.length > 0
          ? `Optional. The Android app reminds you ${MEETUP_LEAD_MINUTES} minutes before.`
          : "Pick weekdays to get a reminder before it."}
      </Text>
    </View>
  );
}

const thisYear = () => torontoDay(new Date()).slice(0, 4);

// A one-off date needs a year, so a yearless one takes this year when it stops repeating.
const withRepeat = (date: ConnectionDate, yearly: boolean): ConnectionDate =>
  yearly || hasYear(date.date)
    ? { ...date, yearly }
    : { ...date, yearly, date: withYear(date.date, thisYear()) };

function DateFields({
  date,
  onChange,
  onRemove,
}: {
  date: ConnectionDate;
  onChange: (d: ConnectionDate) => void;
  onRemove: () => void;
}) {
  const known = hasYear(date.date);

  return (
    <View className="border-border gap-2 border-b pb-3">
      <View className="flex-row gap-2">
        <Input
          aria-label="What's the date"
          className="flex-1"
          placeholder="Birthday"
          maxLength={100}
          value={date.label}
          onChangeText={(label) => onChange({ ...date, label })}
        />
        <DateField
          label="Date"
          value={dayOfYearless(date.date)}
          onChange={(day) => onChange({ ...date, date: known ? day : withYear(day, null) })}
        />
      </View>
      <View className="flex-row items-center justify-between gap-2">
        <Switch
          aria-label="Every year"
          checked={date.yearly}
          onCheckedChange={(yearly) => onChange(withRepeat(date, yearly))}
        >
          Every year
        </Switch>
        {date.yearly ? (
          <Switch
            aria-label="Year known"
            checked={known}
            onCheckedChange={(on) =>
              onChange({ ...date, date: withYear(date.date, on ? thisYear() : null) })
            }
          >
            Year known
          </Switch>
        ) : null}
        <Button variant="ghost" className="h-11" onPress={onRemove}>
          <Text>Remove</Text>
        </Button>
      </View>
    </View>
  );
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Toggles the Circles someone is in; a typed name joins a known Circle in any case, or makes a new one. */
function CirclePicker({
  circles,
  known,
  onChange,
}: {
  circles: string[];
  known: string[];
  onChange: (circles: string[]) => void;
}) {
  const [typed, setTyped] = useState("");
  const shown = [...known, ...circles.filter((c) => !known.includes(c))];
  const isIn = (name: string) => circles.includes(name);

  const add = () => {
    const name = typed.trim();
    const existing = shown.find((c) => sameName(c, name)) ?? name;

    if (name !== "" && !isIn(existing)) onChange([...circles, existing]);
    setTyped("");
  };

  return (
    <Field label="Circles">
      {shown.length > 0 ? (
        <View role="group" aria-label="Circles" className="flex-row flex-wrap gap-2">
          {shown.map((name) => (
            <Button
              key={name}
              size="sm"
              className="h-11"
              role="checkbox"
              aria-checked={isIn(name)}
              variant={isIn(name) ? "default" : "outline"}
              onPress={() =>
                onChange(isIn(name) ? circles.filter((c) => c !== name) : [...circles, name])
              }
            >
              <Text>{name}</Text>
            </Button>
          ))}
        </View>
      ) : null}
      <View className="flex-row gap-2">
        <Input
          aria-label="New Circle"
          className="flex-1"
          placeholder="Shockwave dragon boat"
          maxLength={100}
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={add}
        />
        <Button variant="outline" className="h-11" disabled={typed.trim() === ""} onPress={add}>
          <Text>Add Circle</Text>
        </Button>
      </View>
    </Field>
  );
}

interface ConnectionFormProps {
  draft: ConnectionDraft;
  /** Every Circle anyone is in, to pick from. */
  knownCircles: string[];
  onChange: (draft: ConnectionDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Saving is online only. */
  canSave: boolean;
  /** Everyone else, to pick who introduced us and whom to link. */
  people: ConnectionRef[];
}

/** Edits a Connection's fields in place; saving sends the whole draft. */
export function ConnectionForm({
  draft,
  knownCircles,
  onChange,
  onSave,
  onCancel,
  canSave,
  people,
}: ConnectionFormProps) {
  const set = (patch: Partial<ConnectionDraft>) => onChange({ ...draft, ...patch });

  return (
    <View className="gap-4">
      <Field label="Name">
        <Input
          aria-label="Name"
          maxLength={200}
          value={draft.name}
          onChangeText={(name) => set({ name })}
        />
      </Field>
      <Field label="How we met">
        <Input
          aria-label="How we met"
          maxLength={500}
          placeholder="Dragon boat, 2024"
          value={draft.howWeMet}
          onChangeText={(howWeMet) => set({ howWeMet })}
        />
        <MetThroughField
          metThroughId={draft.metThroughId}
          people={people}
          onChange={(metThroughId) => set({ metThroughId })}
        />
      </Field>
      <Field label="Linked people">
        <LinksField links={draft.links} people={people} onChange={(links) => set({ links })} />
      </Field>
      <ChoiceRow
        legend="Closeness"
        choices={CLOSENESS_CHOICES}
        selected={draft.closeness}
        onPick={(closeness) =>
          set({ closeness, cadenceDays: cadenceForCloseness(closeness, draft.cadenceDays) })
        }
      />
      <CirclePicker
        circles={draft.circles}
        known={knownCircles}
        onChange={(circles) => set({ circles })}
      />
      <ChoiceRow
        legend="Reach out"
        choices={CADENCE_CHOICES}
        selected={draft.cadenceDays}
        onPick={(cadenceDays) => set({ cadenceDays })}
      />
      <Switch
        aria-label="Grow closer"
        checked={draft.growCloser}
        onCheckedChange={(growCloser) => set({ growCloser })}
      >
        Grow closer: prompt me to make plans
      </Switch>
      <Field label="Usually see them">
        {draft.meetups.map((meetup, i) => (
          <MeetupFields
            // eslint-disable-next-line eslint-react/no-array-index-key -- meetups have no id and their fields keep no state, so position is the identity
            key={i}
            meetup={meetup}
            onChange={(m) => set({ meetups: replaceAt(draft.meetups, i, m) })}
            onRemove={() => set({ meetups: draft.meetups.filter((_, j) => j !== i) })}
          />
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-11 self-start"
          onPress={() => set({ meetups: [...draft.meetups, { label: "", days: [] }] })}
        >
          <Text>Add where you see them</Text>
        </Button>
      </Field>
      <Field label="Ask about next time">
        <Input
          aria-label="Ask about next time"
          multiline
          rows={3}
          className="min-h-24"
          textAlignVertical="top"
          placeholder="- How the new job is going"
          value={draft.followUps}
          onChangeText={(followUps) => set({ followUps })}
        />
      </Field>
      <Field label="Important dates">
        {draft.dates.map((date, i) => (
          <DateFields
            // eslint-disable-next-line eslint-react/no-array-index-key -- dates have no id and their fields keep no state, so position is the identity
            key={i}
            date={date}
            onChange={(d) => set({ dates: replaceAt(draft.dates, i, d) })}
            onRemove={() => set({ dates: draft.dates.filter((_, j) => j !== i) })}
          />
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-11 self-start"
          onPress={() =>
            set({
              dates: [...draft.dates, { label: "", date: torontoDay(new Date()), yearly: true }],
            })
          }
        >
          <Text>Add a date</Text>
        </Button>
      </Field>
      <View className="flex-row gap-2">
        <Button className="h-11 flex-1" disabled={!canSave} onPress={onSave}>
          <Text>Save</Text>
        </Button>
        <Button variant="outline" className="h-11 flex-1" onPress={onCancel}>
          <Text>Cancel</Text>
        </Button>
      </View>
    </View>
  );
}
