import {
  causeLine,
  daysFrom,
  formatDay,
  isoAt,
  shiftDay,
  shortMinutes,
  torontoDay,
  type Habit,
  type HabitDay,
  type HabitDays,
  type Skip,
  type Skips,
} from "@/core";
import { Check, X } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "./icon";
import { Text } from "./text";
import { cn } from "@/ui/lib/utils";

export interface HabitWeekProps {
  habit: Habit;
  days: HabitDays;
  /** Each skipped day's cause, listed under the strip and spoken with its day. */
  skips: Skips;
  today: Date;
  onChange: (date: string, count: number) => void;
  onOpenDay: (date: string) => void;
}

const CELL = "h-11 w-full items-center justify-center rounded-md border";

// Done fills leaf green and lightens when pressed; any other tappable cell is an outline that takes the pressed tint.
const cellFill = (done: boolean) =>
  done ? "bg-primary border-primary active:bg-primary/85" : "border-input active:bg-accent";

/** "Saturday, November 14", as TalkBack reads a Day. */
const spokenDay = (date: string) =>
  formatDay(date, { weekday: "long", day: "numeric", month: "long" });

// What a cell says after its Day: the Skip's cause, Not done, the count or done; a bad Habit's day is logged.
function dayStatusLabel(habit: Habit, day: HabitDay, skip: Skip | null) {
  if (skip) return `skipped, ${causeLine(skip)}`;

  if (day.status === "missed") return "not done";

  if (habit.record === "count" && day.count > 0) return `${day.count} logged`;

  if (day.status === "done") return habit.kind === "bad" ? "logged" : "done";

  return "not logged";
}

function DayMark({ habit, day }: { habit: Habit; day: HabitDay }) {
  if (day.status === "missed") return <Icon as={X} className="text-muted-foreground" />;

  if (habit.record === "count") {
    return (
      <Text className={cn(day.status === "done" && "text-primary-foreground")}>
        {day.count > 0 ? String(day.count) : ""}
      </Text>
    );
  }

  if (day.status === "done") return <Icon as={Check} className="text-primary-foreground" />;

  return null;
}

function DayCell({
  habit,
  day,
  skip,
  onChange,
  onOpenDay,
}: Omit<HabitWeekProps, "today" | "days" | "skips"> & {
  day: HabitDay;
  skip: Skip | null;
}) {
  const { date, status, timed } = day;
  const done = status === "done";

  if (timed) {
    const minutes = shortMinutes(timed.minutes);

    return (
      <Pressable
        role="button"
        aria-label={`${habit.name}, ${spokenDay(date)}: ${minutes} logged, show entries`}
        className={cn(CELL, cellFill(done))}
        onPress={() => onOpenDay(date)}
      >
        <Text
          className={cn(
            "text-xs",
            done && "text-primary-foreground",
            timed.over && "text-destructive font-sans-bold",
          )}
        >
          {minutes}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      role="checkbox"
      aria-label={`${habit.name}, ${spokenDay(date)}: ${dayStatusLabel(habit, day, skip)}`}
      aria-checked={done}
      className={cn(CELL, cellFill(done))}
      onPress={() => onChange(date, day.next)}
    >
      <DayMark habit={habit} day={day} />
    </Pressable>
  );
}

// A day off the schedule with nothing logged has nothing to tap.
const isRestDay = ({ due, count, status }: HabitDay) => !due && count === 0 && status === "empty";

/** The last 7 days, today last; a tap toggles a day or opens a timed Habit's entries. Skip causes list below. */
export function HabitWeek({ today, days, skips, ...props }: HabitWeekProps) {
  const { habit } = props;

  // A cause shows only while its day is still Not done.
  const skipOn = (day: HabitDay) =>
    day.status === "missed" ? (skips[day.date]?.[habit.id] ?? null) : null;

  const last = torontoDay(today);

  const week = daysFrom(shiftDay(last, -6), last).map((date) => {
    const day = days.on(new Date(isoAt(date)));

    return { date, day, skip: skipOn(day) };
  });

  return (
    <View className="gap-1">
      <View className="flex-row gap-1.5" role="group" aria-label={`${habit.name}: last 7 days`}>
        {week.map(({ date, day, skip }, index) => {
          const isToday = index === 6;

          return (
            <View key={date} className="flex-1 items-center gap-1">
              <Text
                className={cn(
                  "text-xs",
                  isToday ? "font-label-bold" : "font-label text-muted-foreground",
                )}
                aria-hidden
              >
                {formatDay(date, { weekday: "short" })} {Number(date.slice(8, 10))}
              </Text>
              {isRestDay(day) ? (
                <View className={cn(CELL, "border-transparent")}>
                  <Text
                    className="text-muted-foreground"
                    aria-label={`${habit.name}, ${spokenDay(date)}: not due`}
                  >
                    –
                  </Text>
                </View>
              ) : (
                <DayCell {...props} day={day} skip={skip} />
              )}
            </View>
          );
        })}
      </View>
      {/* The cells already speak each cause, so TalkBack skips these lines. */}
      {week.map(
        ({ date, skip }) =>
          skip && (
            <Text key={date} variant="muted" aria-hidden>
              {`Skipped ${formatDay(date, { weekday: "short" })}: ${causeLine(skip)}`}
            </Text>
          ),
      )}
    </View>
  );
}
