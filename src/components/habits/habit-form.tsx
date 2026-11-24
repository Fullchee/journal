import {
  KIND_COPY,
  PRIORITIES,
  WEEKDAYS,
  alarmNote,
  canOptOut,
  habitTime,
  cueChoices,
  cueMissing,
  dueDateLabel,
  hasHistory,
  isCountedTarget,
  torontoDay,
  isOneOff,
  loopSentence,
  normalizePlaces,
  samePlace,
  scheduleSummary,
  stackCandidates,
  targetCountRange,
  toggleDay,
  withPast,
  withTargetType,
  type CountedTargetType,
  type Alarm,
  type CueType,
  type Draft,
  type Goal,
  type Habit,
} from "@/core";
import { Button, Icon, Switch, Text, DateField, TimeField } from "@/ui";
import { ChevronDown, ChevronRight, Minus, Plus } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { AddImageButton, useAddImage } from "@/components/add-image";
import { pickAlarmSound, useAlarmSound } from "@/lib/alarms/alarm-sound";
import { useCheckInPlaces } from "@/lib/data/check-ins";
import { useHabitStage } from "@/lib/data/streaks";
import { ChoiceChips, TextField, type Choice } from "@/components/habits/form-fields";
import { SeasonFields } from "@/components/habits/season-fields";
import { TinyVersionField } from "@/components/habits/tiny-version-field";

type Update = (patch: Partial<Draft>) => void;

interface SectionProps {
  draft: Draft;
  update: Update;
}

const KINDS = [
  { id: "good", label: "Good" },
  { id: "bad", label: "Bad" },
] as const;

const TARGETS = [
  { id: "daily", label: "Every day" },
  { id: "weekly", label: "N× a week" },
  { id: "monthly", label: "N× a month" },
  { id: "days", label: "Fixed weekdays" },
  { id: "interval", label: "Every N days" },
  { id: "once", label: "Once" },
  { id: "none", label: "Reference (never due)" },
] as const;

const RECORDS = [
  { id: "check", label: "Once a day" },
  { id: "count", label: "Each time" },
  { id: "duration", label: "Minutes" },
] as const;

const NOTIFY = [
  { id: "off", label: "None" },
  { id: "persistent", label: "Persistent notification" },
  { id: "alarm", label: "Alarm" },
] as const;

const DAY_CHOICES = WEEKDAYS.map((label, id) => ({ id, label }));

// The count stepper's words for each counted Frequency: "3 times a week", "Every 3 days".
const COUNT_COPY: Record<
  CountedTargetType,
  { group: string; unit: string; lead: string; tail: string }
> = {
  weekly: { group: "Times per week", unit: "times", lead: "", tail: "times a week" },
  monthly: { group: "Times per month", unit: "times", lead: "", tail: "times a month" },
  interval: { group: "Days apart", unit: "days", lead: "Every", tail: "days" },
};

const DEFAULT_TIME = "08:00";

const NONE = "";

function MissingAlert({ children }: { children: string }) {
  return (
    <Text role="alert" className="text-destructive text-sm">
      {children}
    </Text>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text aria-level={2} variant="title" className="mt-2">
      {children}
    </Text>
  );
}

// "None" plus one chip per Habit; picking the selected one again keeps it.
function HabitPicker({
  label,
  habits,
  value,
  onPick,
}: {
  label: string;
  habits: Habit[];
  value: string | null;
  onPick: (id: string | null) => void;
}) {
  const options: Choice<string>[] = [
    { id: NONE, label: "None" },
    ...habits.map((habit) => ({ id: habit.id, label: habit.name })),
  ];

  return (
    <ChoiceChips
      label={label}
      options={options}
      isSelected={(id) => id === (value ?? NONE)}
      onPick={(id) => onPick(id === NONE ? null : id)}
    />
  );
}

/** Where the log box's second call for a new Habit's details stands; `idle` when none is running or it answered. */
export type DetailsStatus = "idle" | "loading" | "failed";

// The details only fill blank fields, so the form stays usable while they load or after they fail.
function DetailsNote({ status }: { status: DetailsStatus }) {
  const spinnerColor = useCSSVariable("--color-muted-foreground");

  if (status === "idle") return null;

  return status === "loading" ? (
    <View className="flex-row items-center gap-2">
      <ActivityIndicator size="small" color={spinnerColor} />
      <Text variant="muted">Filling in details…</Text>
    </View>
  ) : (
    <Text variant="muted">{"Couldn't suggest details; fill them in yourself."}</Text>
  );
}

function Basics({ draft, update, detailsStatus }: SectionProps & { detailsStatus: DetailsStatus }) {
  return (
    <>
      <TextField
        label="Name"
        value={draft.name}
        maxLength={200}
        onChangeText={(name) => update({ name })}
      />
      <DetailsNote status={detailsStatus} />
      {!isOneOff(draft) && (
        <ChoiceChips
          label="Kind"
          options={KINDS}
          isSelected={(id) => draft.kind === id}
          onPick={(kind) => update({ kind })}
        />
      )}
    </>
  );
}

// What the Habit comes after: a stacked cue names the Habit, and a Scheduled cue's time is in the Frequency block.
function Cue({ draft, update, habits }: SectionProps & { habits: Habit[] }) {
  const pickCue = (cueType: CueType) =>
    update(cueType === "stacked" ? { cueType } : { cueType, stackedAfter: null });

  return (
    <>
      <ChoiceChips
        label="After what?"
        options={cueChoices(draft.kind, draft.cueType)}
        isSelected={(id) => draft.cueType === id}
        onPick={pickCue}
      />
      {draft.cueType === "stacked" && (
        <HabitPicker
          label="Comes after habit"
          habits={stackCandidates(
            habits.filter((habit) => habit.id !== draft.id),
            draft.id,
          )}
          value={draft.stackedAfter}
          onPick={(stackedAfter) => update({ stackedAfter })}
        />
      )}
      {cueMissing(draft) === "stacked" && (
        <MissingAlert>Choose the habit this one comes after.</MissingAlert>
      )}
    </>
  );
}

function HabitLoop({ draft, update, habits }: SectionProps & { habits: Habit[] }) {
  const nameOf = (id: string) => habits.find((habit) => habit.id === id)?.name ?? id;
  const sentence = loopSentence(draft, nameOf);

  return (
    <>
      <SectionTitle>Habit loop</SectionTitle>
      <Cue draft={draft} update={update} habits={habits} />
      <Places draft={draft} update={update} />
      <Text variant="muted">
        {sentence === "" ? "Pick what it comes after to see it as a sentence." : sentence}
      </Text>
    </>
  );
}

// Places are never blank, so the blank id can only be the "Other" chip.
const OTHER_PLACE = "";

// The Check-in's place list plus any Place only this Habit holds; "Other" types a new one.
function Places({ draft, update }: SectionProps) {
  const [isTyping, setIsTyping] = useState(false);
  const [text, setText] = useState("");
  const isOn = (place: string) => draft.places.some((own) => samePlace(own, place));

  const options: Choice<string>[] = [
    ...withPast(useCheckInPlaces(), draft.places).map((place) => ({ id: place, label: place })),
    { id: OTHER_PLACE, label: "Other" },
  ];

  const toggle = (place: string) =>
    update({
      places: isOn(place)
        ? draft.places.filter((own) => !samePlace(own, place))
        : [...draft.places, place],
    });

  const add = () => {
    update({ places: normalizePlaces([...draft.places, text]) });
    setText("");
    setIsTyping(false);
  };

  return (
    <>
      <ChoiceChips
        label="Places"
        options={options}
        isSelected={(id) => (id === OTHER_PLACE ? isTyping : isOn(id))}
        onPick={(id) => (id === OTHER_PLACE ? setIsTyping(!isTyping) : toggle(id))}
      />
      {draft.places.length === 0 && <Text variant="muted">Anywhere</Text>}
      {isTyping && (
        <TextField
          autoFocus
          label="Other place"
          value={text}
          maxLength={200}
          returnKeyType="done"
          submitBehavior="submit"
          onChangeText={setText}
          onSubmitEditing={add}
        />
      )}
    </>
  );
}

function TargetCount({ draft, update, type }: SectionProps & { type: CountedTargetType }) {
  const { count } = draft.target;
  const { min, max } = targetCountRange(type);
  const copy = COUNT_COPY[type];

  const step = (by: number) =>
    update({ target: { ...draft.target, count: Math.min(max, Math.max(min, count + by)) } });

  return (
    <View className="flex-row items-center gap-2" role="group" aria-label={copy.group}>
      {copy.lead !== "" && <Text variant="muted">{copy.lead}</Text>}
      <Button
        variant="outline"
        size="icon"
        aria-label={`Fewer ${copy.unit}`}
        disabled={count <= min}
        onPress={() => step(-1)}
      >
        <Icon as={Minus} />
      </Button>
      <Text className="w-8 text-center">{String(count)}</Text>
      <Button
        variant="outline"
        size="icon"
        aria-label={`More ${copy.unit}`}
        disabled={count >= max}
        onPress={() => step(1)}
      >
        <Icon as={Plus} />
      </Button>
      <Text variant="muted">{copy.tail}</Text>
    </View>
  );
}

// A tree doesn't ring and a plant notifies only after a miss, so the note follows today's Stage.
function AlarmNote({ draft, alarm }: { draft: Draft; alarm: Alarm }) {
  // eslint-disable-next-line eslint-react/purity -- the Stage today reads the clock
  const stage = useHabitStage(draft, new Date());

  return <Text variant="muted">{alarmNote({ ...draft, alarm }, stage)}</Text>;
}

// A Habit's time lives in `usualWhen` as HH:MM, and in its alarm too when it notifies.
function Time({ draft, update }: SectionProps) {
  const time = habitTime(draft);

  if (time === null)
    return (
      <View className="flex-row">
        <Button variant="outline" size="sm" onPress={() => update({ usualWhen: DEFAULT_TIME })}>
          <Text>Add time</Text>
        </Button>
      </View>
    );

  return (
    <>
      <View className="flex-row items-center gap-2">
        <Text variant="muted">Time</Text>
        <TimeField
          label="Time"
          value={time}
          onChange={(picked) =>
            update({ usualWhen: picked, alarm: draft.alarm && { ...draft.alarm, time: picked } })
          }
        />
        <Button
          variant="ghost"
          size="sm"
          aria-label="Clear time"
          onPress={() => update({ usualWhen: "", alarm: null })}
        >
          <Text>Clear</Text>
        </Button>
      </View>
      <ChoiceChips
        label="Notify"
        options={NOTIFY}
        isSelected={(id) => (draft.alarm?.kind ?? "off") === id}
        onPick={(kind) =>
          update({ usualWhen: time, alarm: kind === "off" ? null : { time, kind } })
        }
      />
      {draft.alarm && <AlarmNote draft={draft} alarm={draft.alarm} />}
      {draft.alarm?.kind === "alarm" && <AlarmSound />}
    </>
  );
}

// The phone keeps one sound for every alarm, so a pick here changes them all.
function AlarmSound() {
  const sound = useAlarmSound();

  if (!sound) return null;

  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="muted">{`Sound for all alarms: ${sound.title}`}</Text>
      <Button variant="outline" size="sm" onPress={() => void pickAlarmSound()}>
        <Text>Change sound</Text>
      </Button>
    </View>
  );
}

// Today lists good Habits only, a One-off is answered once (done or not done), and it has no Backlog.
const oneOffPatch = ({ startDate }: Draft): Partial<Draft> => ({
  target: { type: "once", count: 1, days: [] },
  kind: "good",
  record: "check",
  active: true,
  startDate: startDate === "" ? torontoDay(new Date()) : startDate,
});

function OneOffDate({ draft, update, isDateLocked }: SectionProps & { isDateLocked: boolean }) {
  return isDateLocked ? (
    <>
      <Text>Date: {dueDateLabel(draft.startDate)}</Text>
      <Text variant="muted">To move it, use Reschedule on Today.</Text>
    </>
  ) : (
    <View className="flex-row items-center gap-2">
      <Text variant="muted">Date</Text>
      <DateField
        label="Date"
        value={draft.startDate}
        onChange={(startDate) => update({ startDate })}
      />
    </View>
  );
}

function TargetChips({ draft, update }: SectionProps) {
  return (
    <ChoiceChips
      label={KIND_COPY[draft.kind].target}
      options={TARGETS}
      isSelected={(id) => draft.target.type === id}
      onPick={(type) =>
        update(
          type === "once" ? oneOffPatch(draft) : { target: withTargetType(draft.target, type) },
        )
      }
    />
  );
}

function RecordFields({ draft, update }: SectionProps) {
  return (
    <>
      <ChoiceChips
        label="Record"
        options={RECORDS}
        isSelected={(id) => draft.record === id}
        onPick={(record) => update({ record })}
      />
      {draft.record === "duration" && (
        <TextField
          label="Minutes a day"
          keyboardType="number-pad"
          value={draft.targetMinutes === null ? "" : String(draft.targetMinutes)}
          onChangeText={(text) =>
            update({ targetMinutes: /^\d+$/.test(text) ? Number(text) : null })
          }
        />
      )}
      <Switch
        aria-label="Auto-logged"
        checked={draft.autoLogged}
        onCheckedChange={(autoLogged) => update({ autoLogged })}
      >
        Auto-logged: an import logs it, so Today hides it
      </Switch>
    </>
  );
}

// Switching on starts counting today, so past empty days never turn done; a timed Habit's usual length starts at its bar.
function OptOut({ draft, update }: SectionProps) {
  const on = draft.optOutFrom !== null;

  return (
    <>
      <Switch
        aria-label="Opt-out"
        checked={on}
        onCheckedChange={(checked) =>
          update(
            checked
              ? {
                  optOutFrom: torontoDay(new Date()),
                  usualMinutes: draft.usualMinutes ?? draft.targetMinutes,
                }
              : { optOutFrom: null },
          )
        }
      >
        Opt-out: done on each due day unless I Skip
      </Switch>
      {on && draft.record === "duration" && (
        <TextField
          label="Usual length (minutes)"
          keyboardType="number-pad"
          value={draft.usualMinutes === null ? "" : String(draft.usualMinutes)}
          onChangeText={(text) =>
            update({ usualMinutes: /^\d+$/.test(text) ? Number(text) : null })
          }
        />
      )}
    </>
  );
}

// History counts from this day, so a past day opens those days to logging; a future start is a Season's job.
function Started({ draft, update }: SectionProps) {
  const [today] = useState(() => torontoDay(new Date()));

  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2">
        <Text variant="muted">Started</Text>
        <DateField
          label="Started"
          value={draft.startDate}
          max={today}
          onChange={(startDate) => update({ startDate })}
        />
      </View>
      {draft.startDate !== "" && draft.startDate < today && (
        <Text variant="muted">You can log past days on its History after saving.</Text>
      )}
    </View>
  );
}

// The Frequency block: how often a looped Habit is due, its time, and how each occurrence is logged.
function Target({ draft, update }: SectionProps) {
  const { target } = draft;
  // A Scheduled cue needs a time to save, so its time shows even on a Reference.
  const hasTime = target.type !== "none" || draft.cueType === "time";

  return (
    <>
      <TargetChips draft={draft} update={update} />
      {isCountedTarget(target.type) && (
        <TargetCount draft={draft} update={update} type={target.type} />
      )}
      {target.type === "days" && (
        <ChoiceChips
          label="Weekdays"
          options={DAY_CHOICES}
          isSelected={(day) => target.days.includes(day)}
          onPick={(day) => update({ target: { ...target, days: toggleDay(target.days, day) } })}
        />
      )}
      {hasTime && <Time draft={draft} update={update} />}
      {cueMissing(draft) === "time" && <MissingAlert>Choose a time.</MissingAlert>}
      {target.type !== "none" && (
        <>
          <RecordFields draft={draft} update={update} />
          {canOptOut(draft) && <OptOut draft={draft} update={update} />}
        </>
      )}
      {hasHistory(draft) && <Started draft={draft} update={update} />}
      <Text variant="muted">{scheduleSummary(draft)}</Text>
    </>
  );
}

function OneOffSchedule({ draft, update, isDateLocked }: SectionProps & { isDateLocked: boolean }) {
  return (
    <>
      <SectionTitle>Schedule</SectionTitle>
      <TargetChips draft={draft} update={update} />
      <OneOffDate draft={draft} update={update} isDateLocked={isDateLocked} />
      <Time draft={draft} update={update} />
      <Text variant="muted">{scheduleSummary(draft)}</Text>
    </>
  );
}

function Goals({ draft, update, goals }: SectionProps & { goals: Goal[] }) {
  if (goals.length === 0) return null;

  return (
    <ChoiceChips
      label="Goals this habit serves"
      options={goals.map((goal) => ({
        id: goal.id,
        label: goal.state === "retired" ? `${goal.title} (retired)` : goal.title,
      }))}
      isSelected={(id) => draft.goals.includes(id)}
      onPick={(id) =>
        update({
          goals: draft.goals.includes(id)
            ? draft.goals.filter((g) => g !== id)
            : [...draft.goals, id],
        })
      }
    />
  );
}

function Status({ draft, update }: SectionProps) {
  return (
    <>
      <SectionTitle>Status</SectionTitle>
      <ChoiceChips
        label="Priority"
        options={PRIORITIES}
        isSelected={(id) => draft.priority === id}
        onPick={(priority) => update({ priority })}
      />
    </>
  );
}

// Priority always holds a value, and a Scheduled cue shows in the Frequency block, so neither counts.
function filledInMore(draft: Draft) {
  const shared = [draft.goals.length > 0, draft.description.trim() !== ""];

  if (isOneOff(draft)) return shared.filter(Boolean).length;

  const loop = [
    draft.cueType !== "" && draft.cueType !== "time",
    draft.places.length > 0,
    draft.kind === "good" && draft.tinyVersion.trim() !== "",
    draft.seasons.length > 0,
  ];

  return [...shared, ...loop].filter(Boolean).length;
}

// Starts collapsed on every open, even when it holds values: the count says there is something inside.
function More({ filled, children }: { filled: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        role="button"
        aria-expanded={open}
        className="border-border min-h-11 flex-row items-center gap-2 border-t pt-2"
        onPress={() => setOpen((was) => !was)}
      >
        <Icon as={open ? ChevronDown : ChevronRight} className="text-muted-foreground" />
        <Text className="text-muted-foreground">
          {filled === 0 ? "More" : `More · ${filled} filled`}
        </Text>
      </Pressable>
      {open && children}
    </>
  );
}

/** Name, Kind and the schedule, with every other field one tap away under More. */
export function HabitForm({
  draft,
  update,
  habits,
  goals,
  isDateLocked,
  detailsStatus,
  circle,
}: SectionProps & {
  habits: Habit[];
  goals: Goal[];
  isDateLocked: boolean;
  detailsStatus: DetailsStatus;
  /** The Circle picker, saved apart from the form, shown last under More. */
  circle: ReactNode;
}) {
  const images = useAddImage(draft.description, (description) => update({ description }));
  // A One-off holds a name and a date, without the habit loop (ADR 0012).
  const loop = !isOneOff(draft);

  return (
    <View className="gap-4">
      <Basics draft={draft} update={update} detailsStatus={detailsStatus} />
      {loop ? (
        <Target draft={draft} update={update} />
      ) : (
        <OneOffSchedule draft={draft} update={update} isDateLocked={isDateLocked} />
      )}
      <More filled={filledInMore(draft)}>
        {loop && (
          <>
            <HabitLoop draft={draft} update={update} habits={habits} />
            <TinyVersionField draft={draft} update={update} />
            <SeasonFields draft={draft} update={update} />
          </>
        )}
        <Goals draft={draft} update={update} goals={goals} />
        {loop && <Status draft={draft} update={update} />}
        <TextField
          label="Description"
          multiline
          rows={4}
          className="min-h-32"
          textAlignVertical="top"
          placeholder="Markdown"
          value={draft.description}
          onChangeText={(description) => update({ description })}
          onSelectionChange={images.onSelectionChange}
        />
        <AddImageButton images={images} />
        {circle}
      </More>
    </View>
  );
}
