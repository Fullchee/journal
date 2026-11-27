import {
  calendarReader,
  causeLine,
  formatDay,
  isTimed,
  monthBounds,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  shortMinutes,
  type CalendarDay,
  type CalendarState,
  type Habit,
  type Skip,
  type HabitRecords,
} from "@/core";
import { Button, Icon, Text } from "@/ui";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "@/ui/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATE_LABELS: Record<CalendarState, string> = {
  "before-start": "Before the start date",
  future: "Not yet",
  done: "Done",
  missed: "Not done",
  skipped: "Skipped",
  rest: "Rest mode",
  "off-season": "Outside its Season",
  "not-due": "Not due",
  empty: "Not logged",
};

// Each state has its own shape, so none relies on colour; a miss is a neutral tint, never red.
const CELL_CLASS: Record<CalendarState, string> = {
  "before-start": "border-transparent",
  future: "border-transparent",
  done: "border-primary bg-primary",
  missed: "border-border bg-muted",
  skipped: "border-border",
  rest: "border-transparent",
  "off-season": "border-transparent",
  "not-due": "border-transparent",
  empty: "border-border",
};

const DOT = <View className="bg-border size-1.5 rounded-full" />;

const MARKS: Partial<Record<CalendarState, ReactNode>> = {
  done: <Icon as={Check} className="text-primary-foreground size-4" />,
  missed: <Icon as={X} className="text-muted-foreground size-4" />,
  skipped: <View className="bg-muted-foreground h-0.5 w-3 rounded-full" />,
  rest: DOT,
  "off-season": DOT,
  "not-due": <Text className="text-muted-foreground">–</Text>,
};

// Days that hold nothing to log: before the start date, after today, or off a fixed-weekday schedule.
const LOCKED: ReadonlySet<CalendarState> = new Set(["before-start", "future", "not-due"]);

const longLabel = (date: string) =>
  formatDay(date, { weekday: "long", day: "numeric", month: "long" });

// A count Habit shows its count and a timed one its minutes, never graded.
function amountOf(habit: Habit, { minutes, count }: CalendarDay) {
  if (minutes !== null) return shortMinutes(minutes);

  return habit.record === "count" && count > 0 ? String(count) : "";
}

function DayMark({ habit, day }: { habit: Habit; day: CalendarDay }) {
  const amount = amountOf(habit, day);

  if (amount === "") return MARKS[day.state];

  return (
    <Text className={cn("text-xs", day.state === "done" && "text-primary-foreground")}>
      {amount}
    </Text>
  );
}

interface CellProps {
  habit: Habit;
  day: CalendarDay;
  onPress: (day: CalendarDay) => void;
  onShowSkip: (date: string, skip: Skip) => void;
}

function DayCell({ habit, day, onPress, onShowSkip }: CellProps) {
  const { date, state, skip } = day;
  const isDone = state === "done";
  const label = `${longLabel(date)}: ${STATE_LABELS[state]}`;

  const className = cn(
    "h-11 flex-1 items-center justify-center rounded-md border",
    CELL_CLASS[state],
  );

  const content = (
    <>
      <Text className={cn("text-xs", isDone ? "text-primary-foreground" : "text-muted-foreground")}>
        {Number(date.slice(8, 10))}
      </Text>
      <DayMark habit={habit} day={day} />
    </>
  );

  // The import logs an Auto-logged Habit, so only a timed one, which opens its day, takes a tap.
  if (LOCKED.has(state) || (habit.autoLogged && !isTimed(habit)))
    return (
      <View aria-label={label} className={className}>
        {content}
      </View>
    );

  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-pressed={isDone}
      className={className}
      onPress={() => onPress(day)}
      {...(skip && { onLongPress: () => onShowSkip(date, skip) })}
    >
      {content}
    </Pressable>
  );
}

export interface HabitCalendarProps {
  habit: Habit;
  records: HabitRecords;
  today: string;
  onPressDay: (day: CalendarDay) => void;
}

/** One month of a Habit's Days, from its start date to today; a tap logs a past Day as the week row does. */
export function HabitCalendar({ habit, records, today, onPressDay }: HabitCalendarProps) {
  const { first, last } = monthBounds(habit.startDate, today);
  const [month, setMonth] = useState(() => monthOf(today));
  const [shownSkip, setShownSkip] = useState<{ date: string; skip: Skip } | null>(null);

  const move = (by: number) => {
    setShownSkip(null);
    setMonth((shown) => shiftMonth(shown, by));
  };

  const press = (day: CalendarDay) => {
    setShownSkip(null);
    onPressDay(day);
  };

  const dayOf = calendarReader(habit, records, today);

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous month"
          disabled={month <= first}
          onPress={() => move(-1)}
        >
          <Icon as={ChevronLeft} />
        </Button>
        <Text aria-level={2} variant="headline">
          {monthLabel(month)}
        </Text>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next month"
          disabled={month >= last}
          onPress={() => move(1)}
        >
          <Icon as={ChevronRight} />
        </Button>
      </View>
      <View className="flex-row gap-1" aria-hidden>
        {WEEKDAYS.map((weekday) => (
          <Text key={weekday} className="text-muted-foreground flex-1 text-center text-xs">
            {weekday}
          </Text>
        ))}
      </View>
      <View role="group" aria-label={`${habit.name}: ${monthLabel(month)}`} className="gap-1">
        {monthGrid(month).map((week) => (
          <View key={week.find((date) => date !== null)} className="flex-row gap-1">
            {week.map((date, index) =>
              date === null ? (
                <View key={`pad-${String(index)}`} className="h-11 flex-1" />
              ) : (
                <DayCell
                  key={date}
                  habit={habit}
                  day={dayOf(date)}
                  onPress={press}
                  onShowSkip={(skipped, skip) => setShownSkip({ date: skipped, skip })}
                />
              ),
            )}
          </View>
        ))}
      </View>
      {shownSkip && (
        <Text variant="muted">{`Skipped ${shownSkip.date}: ${causeLine(shownSkip.skip)}`}</Text>
      )}
    </View>
  );
}
