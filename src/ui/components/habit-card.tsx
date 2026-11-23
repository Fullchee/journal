import {
  freezeNote,
  freezesLabel,
  habitDays,
  loopSentence,
  scheduleLabel,
  STAGES,
  streakLabel,
  strengthLabel,
  type Counts,
  type Durations,
  type Habit,
  type HabitDays,
  type HabitWeekSummary,
  type Skips,
  type Stage,
  type Streak,
} from "@/core";
import { CalendarPlus, ChevronDown, ChevronUp, Pencil } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Button } from "./button";
import { HabitToday } from "./habit-due-row";
import { HabitWeek } from "./habit-week";
import { Icon } from "./icon";
import { StreakGrid } from "./streak-grid";
import { Text } from "./text";
import { cn } from "@/ui/lib/utils";

export interface HabitCardProps {
  habit: Habit;
  counts: Counts;
  durations: Durations;
  skips: Skips;
  today: Date;
  expanded: boolean;
  /** The Streak of a recurring good Habit. */
  streak?: Streak | null;
  /** The Strength, 0 to 1, for an expanded recurring Habit; null before any period counts. */
  strength?: number | null;
  /** Habit edits are online only; checks and counts queue. */
  offline?: boolean;
  /** The description, already rendered as Markdown by the app. */
  description?: ReactNode;
  nameOf: (id: string) => string;
  goalName: (id: number) => string;
  onToggle: () => void;
  /** Opens the Habit's History. */
  onOpen: () => void;
  onCount: (date: string, count: number) => void;
  onOpenDay: (date: string) => void;
  onEdit: () => void;
  /** Saves a new Stage at once; without it, the card shows no Stage chips. */
  onStage?: (stage: Stage) => void;
  /** Moves an active Habit to Backlog, or a Backlog one back; without it, no Backlog button. */
  onBacklog?: () => void;
  /** Opens the back-fill calendar; without it, no "Log a past day". */
  onPastDays?: () => void;
  /** A Stage or Backlog save is on its way, so a second tap waits. */
  saving?: boolean;
  /** The last Stage or Backlog save failed. */
  saveFailed?: boolean;
}

const STAGE_TEXT = {
  seed: "text-stage-seed",
  sprout: "text-stage-sprout",
  plant: "text-stage-plant",
  tree: "text-stage-tree",
} as const;

function Detail({ label, value }: { label: string; value: string }) {
  if (value === "") return null;

  return (
    <View className="border-border flex-row gap-3 border-b py-2">
      <Text variant="muted" className="w-24">
        {label}
      </Text>
      <Text className="flex-1 text-sm">{value}</Text>
    </View>
  );
}

function StreakLine({ name, streak }: { name: string; streak: Streak }) {
  const note = freezeNote(name, streak);

  return (
    <View>
      <Text className="text-muted-foreground text-sm">{`${streakLabel(streak)} · ${freezesLabel(streak)}`}</Text>
      {note !== null && <Text className="text-muted-foreground text-sm">{note}</Text>}
    </View>
  );
}

// Neutral ink on a muted track: a low Strength is never red.
function StrengthBar({ strength }: { strength: number }) {
  const label = strengthLabel(strength);

  return (
    <View className="gap-1">
      <Text className="text-muted-foreground text-sm">{label}</Text>
      <View aria-label={label} className="bg-muted h-1 overflow-hidden rounded-full">
        {/* oxlint-disable-next-line shadcn/no-inline-styles -- the fill width is the Habit's strength */}
        <View className="bg-foreground h-1" style={{ width: `${strength * 100}%` }} />
      </View>
    </View>
  );
}

// A Tree, a Backlog Habit or a Reference Habit has no day to log.
const isLogged = (habit: Habit) =>
  habit.active && habit.stage !== "tree" && habit.target.type !== "none";

type ManageRowProps = Pick<
  HabitCardProps,
  "habit" | "onStage" | "onBacklog" | "onPastDays" | "saving" | "saveFailed"
> & { offline: boolean };

// One-tap Stage and Backlog changes; the owner sets the Stage, the tracker never does.
function ManageRow({
  habit,
  offline,
  saving = false,
  saveFailed = false,
  onStage,
  onBacklog,
  onPastDays,
}: ManageRowProps) {
  const disabled = offline || saving;

  return (
    <View className="gap-2">
      <Text variant="muted">Manage</Text>
      {onStage && (
        <View
          role="group"
          aria-label={`Stage of ${habit.name}`}
          className="flex-row flex-wrap gap-2"
        >
          {STAGES.map((stage) => {
            const selected = habit.stage === stage.id;

            return (
              <Pressable
                key={stage.id}
                role="button"
                aria-selected={selected}
                disabled={disabled}
                className={cn(
                  "min-h-11 justify-center rounded-full border px-3",
                  selected
                    ? "border-primary bg-primary active:bg-primary/85"
                    : "border-input bg-background active:bg-accent",
                  disabled && "opacity-50",
                )}
                onPress={() => onStage(stage.id)}
              >
                <Text className={cn("text-sm", selected && "text-primary-foreground")}>
                  {stage.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View className="flex-row flex-wrap gap-2">
        {onBacklog && (
          <Button variant="outline" size="sm" disabled={disabled} onPress={onBacklog}>
            <Text>{habit.active ? "Move to Backlog" : "Make active"}</Text>
          </Button>
        )}
        {onPastDays && (
          <Button variant="outline" size="sm" onPress={onPastDays}>
            <Icon as={CalendarPlus} />
            <Text>Log a past day</Text>
          </Button>
        )}
      </View>
      {saveFailed && <Text className="text-destructive text-sm">Couldn't save. Try again.</Text>}
    </View>
  );
}

interface HabitRowProps {
  habit: Habit;
  row: HabitWeekSummary["row"];
  expanded: boolean;
  streak: Streak | null;
  onToggle: () => void;
  onOpen: () => void;
}

// TalkBack reads the row as one button, so its label carries everything the row shows.
function habitRowLabel(name: string, row: HabitRowProps["row"], streak: Streak | null) {
  const parts = [row.name, row.stage, row.progress];

  if (streak) parts.push(streakLabel(streak), freezesLabel(streak), freezeNote(name, streak) ?? "");

  return parts.filter((part) => part !== "").join(", ");
}

function HabitRow({ habit, row, expanded, streak, onToggle, onOpen }: HabitRowProps) {
  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        role="button"
        aria-label={habitRowLabel(habit.name, row, streak)}
        className="active:bg-accent flex-1 rounded-md"
        onPress={onOpen}
      >
        <Text className="font-sans-medium text-lg">{row.name}</Text>
        <View className="flex-row flex-wrap gap-x-3">
          <Text className={cn("font-caption text-label", STAGE_TEXT[habit.stage])}>
            {row.stage}
          </Text>
          <Text
            className={cn(
              "text-sm",
              row.over ? "text-destructive font-sans-bold" : "text-muted-foreground",
            )}
          >
            {row.progress}
          </Text>
        </View>
        {streak && <StreakLine name={habit.name} streak={streak} />}
      </Pressable>
      <Pressable
        role="button"
        aria-label={`Details of ${habit.name}`}
        aria-expanded={expanded}
        className="active:bg-accent size-12 items-center justify-center rounded-md"
        onPress={onToggle}
      >
        <Icon as={expanded ? ChevronUp : ChevronDown} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
}

function HabitFacts({
  habit,
  nameOf,
  goalName,
}: Pick<HabitCardProps, "habit" | "nameOf" | "goalName">) {
  return (
    <View>
      <Detail label="Schedule" value={scheduleLabel(habit)} />
      <Detail label="Tiny version" value={habit.tinyVersion} />
      <Detail label="Habit loop" value={loopSentence(habit, nameOf)} />
      <Detail label="Goals" value={habit.goals.map((id) => goalName(id)).join(", ")} />
    </View>
  );
}

type HabitDetailsProps = Omit<
  HabitCardProps,
  "counts" | "durations" | "expanded" | "streak" | "onToggle" | "onOpen"
> & {
  days: HabitDays;
  streak: Streak | null;
};

// What an expanded card adds: the details, the last 7 days, the Streak's day grid, Manage and Edit.
function HabitDetails({
  habit,
  days,
  skips,
  today,
  streak,
  strength = null,
  offline = false,
  description,
  nameOf,
  goalName,
  onCount,
  onOpenDay,
  onEdit,
  ...manage
}: HabitDetailsProps) {
  return (
    <View className="gap-3">
      {description}
      <HabitFacts habit={habit} nameOf={nameOf} goalName={goalName} />
      {isLogged(habit) && (
        <HabitWeek
          habit={habit}
          days={days}
          skips={skips}
          today={today}
          onChange={onCount}
          onOpenDay={onOpenDay}
        />
      )}
      {streak && <StreakGrid habit={habit} streak={streak} now={today} />}
      {strength !== null && <StrengthBar strength={strength} />}
      <ManageRow habit={habit} offline={offline} {...manage} />
      <Button
        variant="outline"
        className="self-start"
        disabled={offline}
        aria-label={`Edit ${habit.name}`}
        onPress={onEdit}
      >
        <Icon as={Pencil} />
        <Text>Edit</Text>
      </Button>
    </View>
  );
}

/** One Habit in the tracker: name, stage and this week's progress, expanding to its details and week. */
export function HabitCard({
  habit,
  counts,
  durations,
  skips,
  today,
  expanded,
  streak = null,
  offline = false,
  description,
  nameOf,
  goalName,
  onToggle,
  onOpen,
  onCount,
  onOpenDay,
  onEdit,
  ...manage
}: HabitCardProps) {
  const days = habitDays(habit, { counts, durations });
  const { row } = days.week(today);
  const day = days.on(today);

  return (
    <View className="bg-card border-border gap-3 rounded-lg border p-4">
      <HabitRow
        habit={habit}
        row={row}
        expanded={expanded}
        streak={streak}
        onToggle={onToggle}
        onOpen={onOpen}
      />

      {isLogged(habit) && (
        <HabitToday
          habit={habit}
          day={day}
          onChange={(count) => onCount(day.date, count)}
          onOpenDay={() => onOpenDay(day.date)}
        />
      )}

      {expanded && (
        <HabitDetails
          habit={habit}
          days={days}
          skips={skips}
          today={today}
          streak={streak}
          offline={offline}
          description={description}
          nameOf={nameOf}
          goalName={goalName}
          onCount={onCount}
          onOpenDay={onOpenDay}
          onEdit={onEdit}
          {...manage}
        />
      )}
    </View>
  );
}
