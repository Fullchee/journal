import {
  freezeNote,
  freezesLabel,
  habitDays,
  loopSentence,
  scheduleLabel,
  STAGE_LABELS,
  streakLabel,
  strengthLabel,
  type Habit,
  type HabitDays,
  type HabitRecords,
  type HabitWeekSummary,
  type Skips,
  type Stage,
  type Streak,
  type TreeAnswer,
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
  records: HabitRecords;
  today: Date;
  expanded: boolean;
  /** The Streak of a recurring good Habit. */
  streak?: Streak | null;
  /** The Strength, 0 to 1, for an expanded recurring Habit; null before any period counts. */
  strength?: number | null;
  /** Read from the Habit's records; null for a Habit without one, or before its records load. */
  stage?: Stage | null;
  /** The card asks "Do you do this without thinking?". */
  asksTree?: boolean;
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
  /** Saves a tree answer or Slipped at once; without it, the card offers neither. */
  onTree?: (answer: TreeAnswer) => void;
  /** Moves an active Habit to Backlog, or a Backlog one back; without it, no Backlog button. */
  onBacklog?: () => void;
  /** Opens the back-fill calendar; without it, no "Log a past day". */
  onPastDays?: () => void;
  /** A tree answer or Backlog save is on its way, so a second tap waits. */
  saving?: boolean;
  /** The last tree answer or Backlog save failed. */
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

// A Backlog Habit or a Reference Habit has no day to log; a tree still logs, so its Strength keeps counting hits.
const isLogged = (habit: Habit) => habit.active && habit.target.type !== "none";

// Asked once Strength reaches 95% at 66 days; only a yes makes a tree (ADR 0016).
function TreeQuestion({
  disabled,
  onTree,
}: {
  disabled: boolean;
  onTree: (answer: TreeAnswer) => void;
}) {
  return (
    <View className="gap-2">
      <Text>Do you do this without thinking?</Text>
      <View className="flex-row flex-wrap gap-2">
        <Button size="sm" disabled={disabled} onPress={() => onTree("yes")}>
          <Text>Yes</Text>
        </Button>
        <Button variant="outline" size="sm" disabled={disabled} onPress={() => onTree("not-yet")}>
          <Text>Not yet</Text>
        </Button>
      </View>
    </View>
  );
}

type ManageRowProps = Pick<
  HabitCardProps,
  "habit" | "onTree" | "onBacklog" | "onPastDays" | "saving" | "saveFailed"
> & { offline: boolean; tree: boolean };

// One-tap Backlog changes, and Slipped for a tree: it rings and shows on Today again.
function ManageRow({
  habit,
  tree,
  offline,
  saving = false,
  saveFailed = false,
  onTree,
  onBacklog,
  onPastDays,
}: ManageRowProps) {
  const disabled = offline || saving;

  return (
    <View className="gap-2">
      <Text variant="muted">Manage</Text>
      {tree && onTree && (
        <View className="items-start gap-1">
          <Text variant="muted">
            A tree doesn't ring or show on Today. Slipped brings both back.
          </Text>
          <Button variant="outline" size="sm" disabled={disabled} onPress={() => onTree("slipped")}>
            <Text>Slipped</Text>
          </Button>
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
  stage: Stage | null;
  row: HabitWeekSummary["row"];
  expanded: boolean;
  streak: Streak | null;
  onToggle: () => void;
  onOpen: () => void;
}

// TalkBack reads the row as one button, so its label carries everything the row shows.
function habitRowLabel(
  name: string,
  stage: Stage | null,
  row: HabitRowProps["row"],
  streak: Streak | null,
) {
  const parts = [row.name, stage === null ? "" : STAGE_LABELS[stage], row.progress];

  if (streak) parts.push(streakLabel(streak), freezesLabel(streak), freezeNote(name, streak) ?? "");

  return parts.filter((part) => part !== "").join(", ");
}

function HabitRow({ habit, stage, row, expanded, streak, onToggle, onOpen }: HabitRowProps) {
  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        role="button"
        aria-label={habitRowLabel(habit.name, stage, row, streak)}
        className="active:bg-accent flex-1 rounded-md"
        onPress={onOpen}
      >
        <Text className="font-sans-medium text-lg">{row.name}</Text>
        <View className="flex-row flex-wrap gap-x-3">
          {stage !== null && (
            <Text className={cn("font-caption text-label", STAGE_TEXT[stage])}>
              {STAGE_LABELS[stage]}
            </Text>
          )}
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
  "records" | "expanded" | "streak" | "stage" | "asksTree" | "onToggle" | "onOpen"
> & {
  skips: Skips;
  tree: boolean;
  days: HabitDays;
  streak: Streak | null;
};

// What an expanded card adds: the details, the last 7 days, the Streak's day grid, Manage and Edit.
function HabitDetails({
  habit,
  days,
  tree,
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
      <ManageRow habit={habit} tree={tree} offline={offline} {...manage} />
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

/** One Habit in the tracker: name, Stage and this week's progress, expanding to its details and week. */
export function HabitCard({
  habit,
  records,
  today,
  expanded,
  streak = null,
  stage = null,
  asksTree = false,
  offline = false,
  onToggle,
  onOpen,
  onCount,
  onOpenDay,
  saving = false,
  ...details
}: HabitCardProps) {
  const days = habitDays(habit, records);
  const { row } = days.week(today);
  const day = days.on(today);

  return (
    <View className="bg-card border-border gap-3 rounded-lg border p-4">
      <HabitRow
        habit={habit}
        stage={stage}
        row={row}
        expanded={expanded}
        streak={streak}
        onToggle={onToggle}
        onOpen={onOpen}
      />

      {asksTree && details.onTree && (
        <TreeQuestion disabled={offline || saving} onTree={details.onTree} />
      )}

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
          tree={stage === "tree"}
          skips={records.skips}
          today={today}
          streak={streak}
          offline={offline}
          onCount={onCount}
          onOpenDay={onOpenDay}
          saving={saving}
          {...details}
        />
      )}
    </View>
  );
}
