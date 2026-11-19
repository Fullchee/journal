import { streakGrid, type GridMark, type Habit, type Streak } from "@/core";
import { View } from "react-native";

import { Text } from "./text";

export interface StreakGridProps {
  habit: Pick<Habit, "name" | "target" | "seasons" | "startDate">;
  streak: Pick<Streak, "marks">;
  now: Date;
}

const WEEKS = 5;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Each mark has its own shape, so none relies on colour; a missed day stays blank, never red or crossed out.
const MARK_CLASS: Record<GridMark, string> = {
  done: "size-5 rounded-full bg-primary",
  freeze: "size-5 rounded-full border-2 border-dashed border-primary",
  outside: "size-5 rounded-sm border-2 border-dashed border-primary",
  rest: "size-6 rounded-sm bg-muted",
  missed: "size-5",
  open: "size-5 rounded-full border border-primary",
  off: "size-1 rounded-full bg-border",
  later: "size-5",
};

const LEGEND: { mark: GridMark; label: string }[] = [
  { mark: "done", label: "Done" },
  { mark: "freeze", label: "Freeze" },
  { mark: "outside", label: "Skipped, outside" },
  { mark: "rest", label: "Rest" },
  { mark: "off", label: "Not due" },
];

function Mark({ mark }: { mark: GridMark }) {
  return (
    <View className="size-7 items-center justify-center">
      <View className={MARK_CLASS[mark]} />
    </View>
  );
}

/** The last 5 weeks of a Habit's Streak, Monday first, with a legend. */
export function StreakGrid({ habit, streak, now }: StreakGridProps) {
  const weeks = streakGrid(habit, streak, WEEKS, now);

  return (
    <View className="gap-2">
      <View
        role="group"
        aria-label={`${habit.name}: last ${WEEKS} weeks`}
        className="gap-1 self-start"
      >
        <View className="flex-row gap-1" aria-hidden>
          {WEEKDAYS.map((weekday) => (
            <Text
              key={weekday}
              className="text-muted-foreground w-7 text-center font-label text-xs"
            >
              {weekday.charAt(0)}
            </Text>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={week[0]?.date} className="flex-row gap-1">
            {week.map(({ date, mark, label }) => (
              <View
                key={date}
                {...(mark === "later"
                  ? { "aria-hidden": true }
                  : { "aria-label": `${date}: ${label}` })}
              >
                <Mark mark={mark} />
              </View>
            ))}
          </View>
        ))}
      </View>
      <View className="flex-row flex-wrap gap-x-3 gap-y-1" aria-hidden>
        {LEGEND.map(({ mark, label }) => (
          <View key={mark} className="flex-row items-center gap-1">
            <Mark mark={mark} />
            <Text className="text-muted-foreground text-xs">{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
