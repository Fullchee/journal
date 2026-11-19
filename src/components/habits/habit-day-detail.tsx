import {
  clockLabel,
  habitDays,
  torontoDay,
  minutesLabel,
  type Durations,
  type TimedHabit,
  formatDay,
  isoAt,
} from "@/core";
import { BottomSheet, Button, HabitDurationBar, Icon, Text } from "@/ui";
import { Trash2 } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { useIsOnline } from "@/lib/data/data-provider";
import { useDeleteDuration } from "@/lib/data/habits";

export interface DayDetail {
  habit: TimedHabit;
  date: string;
}

const dayLabel = (date: string) =>
  formatDay(date, { weekday: "long", day: "numeric", month: "long" });

/** A sheet about one Habit on one Day: its name, the long Day label, then `children`. */
export function DaySheet({
  name,
  date,
  onClose,
  children,
}: {
  name: string;
  date: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <BottomSheet label={`${name}, ${dayLabel(date)}`} onClose={onClose}>
      <Text variant="title">{name}</Text>
      <Text variant="muted">{dayLabel(date)}</Text>
      {children}
    </BottomSheet>
  );
}

/**
 * A timed Habit's entries for one day; new time comes through the log box, so this only deletes. With `onLogTime`, a "Log time" button opens the log box's form for this day.
 */
export function HabitDayDetail({
  detail,
  durations,
  onClose,
  onLogTime,
}: {
  detail: DayDetail;
  durations: Durations;
  onClose: () => void;
  onLogTime?: () => void;
}) {
  const { habit, date } = detail;
  // A timed Habit's day reads only its entries, so no counts are needed.
  const { timed } = habitDays(habit, { counts: {}, durations }).on(new Date(isoAt(date)));
  const { entries } = timed;
  const isOnline = useIsOnline();
  const remove = useDeleteDuration();

  return (
    <DaySheet name={habit.name} date={date} onClose={onClose}>
      <HabitDurationBar
        habit={habit}
        timed={timed}
        // eslint-disable-next-line eslint-react/purity -- "today" is relative to this moment, so each render reads the clock
        when={date === torontoDay(new Date()) ? "today" : "that day"}
      />
      {entries.length === 0 && <Text variant="muted">Nothing logged this day.</Text>}
      {entries.map((entry) => (
        <View
          key={entry.id}
          className="border-border flex-row items-center justify-between border-b"
        >
          <Text>
            {clockLabel(entry.startTime)} · {minutesLabel(entry.minutes)}
          </Text>
          <Button
            variant="ghost"
            size="icon"
            disabled={!isOnline || remove.isPending}
            aria-label={`Delete ${habit.name} at ${clockLabel(entry.startTime)}`}
            onPress={() => remove.mutate({ ...entry, date, habit: habit.id, name: habit.name })}
          >
            <Icon as={Trash2} />
          </Button>
        </View>
      ))}
      {!isOnline && <Text variant="muted">Deleting needs a connection.</Text>}
      {remove.isError && <Text className="text-destructive">{"Couldn't delete. Try again."}</Text>}
      {onLogTime && (
        <Button variant="outline" onPress={onLogTime}>
          <Text>Log time</Text>
        </Button>
      )}
      <Button variant="outline" onPress={onClose}>
        <Text>Done</Text>
      </Button>
    </DaySheet>
  );
}
