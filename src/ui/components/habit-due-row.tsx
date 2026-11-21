import {
  durationBarLabel,
  durationSummary,
  isTimed,
  MISSED,
  type Habit,
  type HabitDay,
  type TimedDay,
  type TimedHabit,
} from "@/core";
import { BellOff, CalendarClock, Check, Minus, Plus, SkipForward, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View, type AccessibilityActionEvent } from "react-native";

import { Button } from "./button";
import { Icon } from "./icon";
import { Input } from "./input";
import { Text } from "./text";
import { cn } from "@/ui/lib/utils";

export interface HabitTodayProps {
  habit: Habit;
  day: HabitDay;
  disabled?: boolean;
  onChange: (count: number) => void;
  /** A `duration` Habit's day opens its entries; new time comes through the log box. */
  onOpenDay: () => void;
}

const CHECK_ICON = { done: Check, missed: X, empty: Check } as const;

// Only a `duration` Habit's day carries minutes; this narrows both together.
const timedOf = ({ habit, day }: Pick<HabitTodayProps, "habit" | "day">) =>
  isTimed(habit) && day.timed !== null ? { habit, timed: day.timed } : null;

function CheckToday({ habit, day, disabled, onChange }: HabitTodayProps) {
  const { status } = day;

  return (
    <Button
      size="icon"
      variant={status === "done" ? "default" : "outline"}
      className={cn("size-12", status === "done" && habit.kind === "bad" && "bg-foreground")}
      disabled={disabled}
      role="checkbox"
      aria-checked={status === "done"}
      aria-label={`${habit.name} today`}
      onPress={() => onChange(day.next)}
    >
      <Icon
        as={CHECK_ICON[status]}
        className={cn(
          status === "empty" && "text-muted-foreground",
          status === "done" && habit.kind === "bad" && "text-background",
        )}
      />
    </Button>
  );
}

function CountToday({ habit, day, disabled, onChange }: HabitTodayProps) {
  const shown = Math.max(0, day.count);

  return (
    <View className="flex-row items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="size-12"
        disabled={disabled === true || shown === 0}
        aria-label={`One fewer ${habit.name}`}
        onPress={() => onChange(shown - 1)}
      >
        <Icon as={Minus} />
      </Button>
      <Text className="min-w-8 text-center text-lg" aria-label={`${shown} today`}>
        {shown}
      </Text>
      <Button
        variant="outline"
        size="icon"
        className="size-12"
        disabled={disabled}
        aria-label={`One more ${habit.name}`}
        onPress={() => onChange(shown + 1)}
      >
        <Icon as={Plus} />
      </Button>
    </View>
  );
}

/** Only a `bad` Habit over its ceiling turns red; a good Habit's bar fills green, a bad one's in ink. */
export function HabitDurationBar({
  habit,
  timed,
  when = "today",
}: {
  habit: TimedHabit;
  timed: TimedDay;
  when?: string;
}) {
  const kindFill = habit.kind === "bad" ? "bg-foreground" : "bg-primary";

  return (
    <View className="gap-1">
      <Text
        className={cn(
          "text-sm",
          timed.over ? "text-destructive font-sans-bold" : "text-muted-foreground",
        )}
      >
        {`${durationSummary(timed)} ${when} (${durationBarLabel(habit)})`}
      </Text>
      <View className="bg-muted h-1 w-full max-w-48 overflow-hidden rounded-full">
        <View
          testID="duration-bar-fill"
          className={cn("h-full", timed.over ? "bg-destructive" : kindFill)}
          style={{ width: `${timed.progress * 100}%` }}
        />
      </View>
    </View>
  );
}

function DurationToday({
  habit,
  timed,
  onOpenDay,
}: Pick<HabitTodayProps, "onOpenDay"> & { habit: TimedHabit; timed: TimedDay }) {
  return (
    <Pressable
      role="button"
      aria-label={`${habit.name} today: show entries`}
      className="min-h-12 justify-center"
      onPress={onOpenDay}
    >
      <HabitDurationBar habit={habit} timed={timed} />
    </Pressable>
  );
}

/** Logs one Habit for today the way its Record asks: a check, − / +, or the day's time against its bar. */
export function HabitToday(props: HabitTodayProps) {
  const { habit } = props;
  const timed = timedOf(props);

  if (timed) return <DurationToday {...timed} onOpenDay={props.onOpenDay} />;

  return habit.record === "count" ? <CountToday {...props} /> : <CheckToday {...props} />;
}

const MAX_MINUTES = 1440;

const MAX_COUNT = 99;

// A typed number counts only when it is a whole number from 0 to `max`.
function wholeNumber(text: string, max: number) {
  const value = Number(text.trim());

  return text.trim() !== "" && Number.isSafeInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}

function spokenTime(time: string | null, overdue: boolean) {
  if (time === null) return "Any time";

  return overdue ? `Due ${time}` : `At ${time}`;
}

// Plain text, not a box: the time only reads here and changes in the editor. Overdue stays ink, never scarlet.
function TimeLabel({ time, overdue }: { time: string | null; overdue: boolean }) {
  return (
    <View className="w-20 justify-center" aria-label={spokenTime(time, overdue)}>
      <Text className={cn("text-sm", time === null && "text-muted-foreground")}>
        {time ?? "Any"}
      </Text>
    </View>
  );
}

function ToggleButton({
  label,
  icon,
  checked,
  disabled,
  onPress,
}: {
  label: string;
  icon: typeof Check;
  checked: boolean;
  disabled?: boolean | undefined;
  onPress: () => void;
}) {
  return (
    <Button
      size="icon"
      variant={checked ? "default" : "outline"}
      className="size-12"
      disabled={disabled}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onPress={onPress}
    >
      <Icon
        as={icon}
        className={cn(!checked && "text-muted-foreground", checked && "text-primary-foreground")}
      />
    </Button>
  );
}

// The field shows the stored count; a new one replaces it, and 0 clears the day.
function CountInput({ habit, day, disabled, onChange }: HabitTodayProps) {
  const shown = Math.max(0, day.count);
  const [text, setText] = useState(shown === 0 ? "" : String(shown));

  const save = () => {
    const next = wholeNumber(text, MAX_COUNT);

    if (next !== null && next !== shown) onChange(next);
  };

  return (
    <Input
      className="w-16 text-center"
      keyboardType="number-pad"
      returnKeyType="done"
      placeholder="#"
      editable={disabled !== true}
      aria-label={`${habit.name} count today`}
      value={text}
      onChangeText={setText}
      onSubmitEditing={save}
      onBlur={save}
    />
  );
}

// A new stored count, from a button or another screen, restarts the field from it.
const CountField = (props: HabitTodayProps) => <CountInput key={props.day.count} {...props} />;

// Each submit adds one Duration entry, so the field empties after it.
function MinutesField({
  habit,
  disabled,
  onAddMinutes,
}: {
  habit: Habit;
  disabled?: boolean | undefined;
  onAddMinutes: (minutes: number) => void;
}) {
  const [text, setText] = useState("");

  return (
    <Input
      className="w-16 text-center"
      keyboardType="number-pad"
      returnKeyType="done"
      placeholder="min"
      editable={disabled !== true}
      aria-label={`${habit.name} minutes today`}
      value={text}
      onChangeText={setText}
      onSubmitEditing={() => {
        const minutes = wholeNumber(text, MAX_MINUTES);

        if (minutes === null || minutes === 0) return;
        onAddMinutes(minutes);
        setText("");
      }}
    />
  );
}

type DueControlsProps = HabitTodayProps & {
  onAddMinutes: (minutes: number) => void;
  /** Given only for a One-off still waiting for an answer. */
  onReschedule?: (() => void) | undefined;
  /** Given for a recurring Habit that can be missed: its Not done is a Skip, which then asks why. */
  onSkip?: (() => void) | undefined;
  /** Given while the Habit's alarm is still ahead today; `onSilence` silences today's ring or brings it back. */
  alarm?: { silenced: boolean; onSilence: () => void } | undefined;
};

interface DueAction {
  name: "done" | "skip" | "not-done" | "reschedule";
  label: string;
  run: () => void;
}

// Done on a timed Habit logs what is left of its bar.
function doneAction(props: DueControlsProps): DueAction | null {
  const { day, onChange, onAddMinutes } = props;

  if (day.status === "done") return null;
  const timed = timedOf(props);

  const run = timed
    ? () => onAddMinutes(timed.habit.targetMinutes - timed.timed.minutes)
    : () => onChange(1);

  return { name: "done", label: "Done", run };
}

/** What a screen reader can do to a due row, without its buttons: each answer it doesn't have yet. */
function dueRowActions(props: DueControlsProps): DueAction[] {
  const { day, disabled, onChange, onReschedule, onSkip } = props;

  if (disabled === true) return [];
  const canMissNow = day.canMiss && day.status !== "missed";

  const skip: DueAction | null =
    canMissNow && onSkip ? { name: "skip", label: "Skip", run: onSkip } : null;

  const notDone: DueAction | null =
    canMissNow && !onSkip
      ? { name: "not-done", label: "Not done", run: () => onChange(MISSED) }
      : null;

  const reschedule: DueAction | null = onReschedule
    ? { name: "reschedule", label: "Reschedule", run: onReschedule }
    : null;

  return [doneAction(props), notDone, skip, reschedule].filter((action) => action !== null);
}

// A recurring Habit's Not done is a Skip, which then asks why; a One-off's is a plain Not done.
function MissToggle({ habit, day, disabled, onChange, onSkip }: DueControlsProps) {
  if (!day.canMiss) return null;
  const missed = day.status === "missed";

  return (
    <ToggleButton
      label={onSkip ? `Skip ${habit.name} today` : `${habit.name} not done today`}
      icon={onSkip ? SkipForward : X}
      checked={missed}
      disabled={disabled}
      onPress={() => {
        if (missed) onChange(0);
        else if (onSkip) onSkip();
        else onChange(MISSED);
      }}
    />
  );
}

// Done on a timed Habit logs what is left of its bar; its entries open from the bar to undo. Only an Opt-out one can Skip.
function TimedControls(props: DueControlsProps & { habit: TimedHabit; timed: TimedDay }) {
  const { habit, timed, day, disabled, onAddMinutes } = props;
  const done = day.status === "done";

  return (
    <View className="flex-row items-center gap-1">
      <ToggleButton
        label={`${habit.name} done today`}
        icon={Check}
        checked={done}
        disabled={disabled === true || done}
        onPress={() => onAddMinutes(habit.targetMinutes - timed.minutes)}
      />
      <MissToggle {...props} />
      <MinutesField habit={habit} disabled={disabled} onAddMinutes={onAddMinutes} />
      <SilenceToggle {...props} />
    </View>
  );
}

// Silencing logs nothing, so it stays apart from Done and Skip; the alarm rings again on the next due day.
function SilenceToggle({ habit, alarm }: DueControlsProps) {
  if (!alarm) return null;

  return (
    <ToggleButton
      label={`Silence ${habit.name}'s alarm today`}
      icon={BellOff}
      checked={alarm.silenced}
      onPress={alarm.onSilence}
    />
  );
}

function DueControls(props: DueControlsProps) {
  const { habit, day, disabled, onChange, onReschedule } = props;
  const { status } = day;
  const timed = timedOf(props);

  if (timed) return <TimedControls {...props} {...timed} />;

  return (
    <View className="flex-row items-center gap-1">
      <ToggleButton
        label={`${habit.name} done today`}
        icon={Check}
        checked={status === "done"}
        disabled={disabled}
        onPress={() => onChange(status === "done" ? 0 : 1)}
      />
      <MissToggle {...props} />
      {habit.record === "count" && <CountField {...props} />}
      {onReschedule && (
        <Button
          size="icon"
          variant="outline"
          className="size-12"
          disabled={disabled}
          aria-label={`Reschedule ${habit.name}`}
          onPress={onReschedule}
        >
          <Icon as={CalendarClock} className="text-muted-foreground" />
        </Button>
      )}
      <SilenceToggle {...props} />
    </View>
  );
}

export type HabitDueRowProps = DueControlsProps & {
  /** The Habit's time of day as shown ("7:30 AM"), or null for any time; an overdue One-off's due day instead. */
  time: string | null;
  /** A One-off past its date with no answer. */
  overdue?: boolean;
  /** An Opt-out Habit's day before its time: it turns done by itself unless skipped. */
  planned?: boolean;
  onOpen: () => void;
};

// TalkBack offers these on the row's name, so every answer works without a hunt for the button.
function accessibilityActionsOf(props: DueControlsProps) {
  const actions = dueRowActions(props);

  return {
    accessibilityActions: actions.map(({ name, label }) => ({ name, label })),
    onAccessibilityAction: ({ nativeEvent }: AccessibilityActionEvent) =>
      actions.find((action) => action.name === nativeEvent.actionName)?.run(),
  };
}

/**
 * One due Habit on Today: its time of day, its name, and Done, Skip (Not done on a One-off) or a number for today;
 * a One-off can also be rescheduled.
 */
export function HabitDueRow({
  onOpen,
  time,
  overdue = false,
  planned = false,
  ...props
}: HabitDueRowProps) {
  const { habit } = props;
  const timed = timedOf(props);
  const a11y = accessibilityActionsOf(props);

  return (
    <View className="border-border flex-row flex-wrap items-center gap-3 border-b py-2">
      <TimeLabel time={time} overdue={overdue} />
      <View className="min-w-32 flex-1 gap-1">
        <Pressable
          role="link"
          aria-label={`Open ${habit.name}`}
          className="active:bg-accent min-h-12 justify-center rounded-md"
          onPress={onOpen}
          {...a11y}
        >
          <Text className="text-base">{habit.name}</Text>
        </Pressable>
        {overdue && (
          <Text variant="muted" className="text-sm">
            Overdue
          </Text>
        )}
        {planned && (
          <Text variant="muted" className="text-sm">
            Planned: counts unless skipped
          </Text>
        )}
        {timed && <DurationToday {...timed} onOpenDay={props.onOpenDay} />}
      </View>
      <DueControls {...props} />
    </View>
  );
}
