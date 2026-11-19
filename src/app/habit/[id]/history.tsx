import {
  habitHistory,
  habitStrength,
  hasHistory,
  isTimed,
  torontoDay,
  type CalendarDay,
  type Habit,
  type StreakRecords,
} from "@/core";
import { Button, Icon, Text } from "@/ui";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Pencil } from "lucide-react-native";
import { useState } from "react";

import { CountDaySheet } from "@/components/habits/count-day-sheet";
import { HabitCalendar } from "@/components/habits/habit-calendar";
import { HabitDayDetail, type DayDetail } from "@/components/habits/habit-day-detail";
import { HistoryList, HistorySummary } from "@/components/habits/habit-history";
import { Screen } from "@/components/screen";
import {
  missingHabitText,
  useCheckHabit,
  useHabitTracker,
  type HabitsBody,
} from "@/lib/data/habits";
import { useHabitRecords } from "@/lib/data/streaks";

// Years of daily periods would be a long render, so the list grows a page at a time.
const PAGE = 60;

/** `/habit/<id>/history`: how often a recurring Habit was hit or missed, per day or week. */
export default function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isError } = useHabitTracker();
  const habit = data?.habits.find((h) => h.id === id);

  if (data === undefined || habit === undefined)
    return (
      <Screen>
        <Text variant="muted">{missingHabitText(data !== undefined, isError)}</Text>
      </Screen>
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: habit.name }} />
      <Button
        variant="outline"
        className="self-start"
        aria-label={`Edit ${habit.name}`}
        onPress={() => router.push({ pathname: "/habit/[id]", params: { id: habit.id } })}
      >
        <Icon as={Pencil} />
        <Text>Edit</Text>
      </Button>
      {hasHistory(habit) ? (
        <HistoryBody habit={habit} body={data} />
      ) : (
        <Text variant="muted">One-offs and Reference Habits have no History.</Text>
      )}
    </Screen>
  );
}

/** The month calendar's taps: a check Habit takes the next state, a count Habit opens its stepper, a timed one its Day. */
function BackfillCalendar({
  habit,
  records,
  today,
}: {
  habit: Habit;
  records: StreakRecords;
  today: string;
}) {
  const check = useCheckHabit();
  const [countDate, setCountDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);

  const pressDay = (day: CalendarDay) => {
    if (isTimed(habit)) setDetail({ habit, date: day.date });
    else if (habit.record === "count") setCountDate(day.date);
    else check({ date: day.date, habit: habit.id, count: day.next });
  };

  const logTime = ({ date }: DayDetail) => {
    setDetail(null);
    router.push({
      pathname: "/log-entry",
      params: { draft: JSON.stringify([{ habit: habit.id, date }]) },
    });
  };

  return (
    <>
      <HabitCalendar habit={habit} records={records} today={today} onPressDay={pressDay} />
      {countDate !== null && (
        <CountDaySheet
          habit={habit}
          date={countDate}
          count={records.counts[countDate]?.[habit.id] ?? 0}
          onChange={(count) => check({ date: countDate, habit: habit.id, count })}
          onClose={() => setCountDate(null)}
        />
      )}
      {detail && (
        <HabitDayDetail
          detail={detail}
          durations={records.durations}
          onClose={() => setDetail(null)}
          onLogTime={() => logTime(detail)}
        />
      )}
    </>
  );
}

function HistoryBody({ habit, body }: { habit: Habit; body: HabitsBody }) {
  const [now] = useState(() => new Date());
  const [limit, setLimit] = useState(PAGE);
  const records = useHabitRecords(body);

  if (records === null) return <Text variant="muted">Loading History…</Text>;
  const history = habitHistory(habit, records, now);

  return (
    <>
      <HistorySummary history={history} strength={habitStrength(habit, records, now)} />
      <BackfillCalendar habit={habit} records={records} today={torontoDay(now)} />
      <HistoryList history={history} limit={limit} />
      {history.periods.length > limit && (
        <Button
          variant="outline"
          className="self-start"
          onPress={() => setLimit((shown) => shown + PAGE)}
        >
          <Text>Show older</Text>
        </Button>
      )}
    </>
  );
}
