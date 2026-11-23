import {
  dueToday,
  habitTime,
  isTimed,
  normalizePlaces,
  torontoDay,
  torontoTime,
  type Durations,
  type Habit,
  type Priority,
  type RestPeriod,
} from "@/core";

import type { HabitsBody } from "@/lib/data/habits";

/**
 * One open Habit on the Habits widget; `tick` is false for a timed Habit, which logs minutes, not a check.
 * `places`, `time` and `priority` are what each placed widget's own filter matches on.
 */
interface WidgetHabit {
  id: string;
  name: string;
  tick: boolean;
  places: string[];
  time: string | null;
  priority: Priority;
}

/**
 * What the Habits widget and the Quick Settings tile read; the widget shows `due` only on the Day `date`.
 * `places` are the Places a widget's filter offers.
 */
export interface HabitWidgets {
  date: string;
  due: WidgetHabit[];
  places: string[];
  timed: { id: string; name: string } | null;
}

// Owner-logged timed Habits only: an Auto-logged one fills itself from an import.
const isTileHabit = (habit: Habit) => habit.active && !habit.autoLogged && isTimed(habit);

// Days and HH:MM start times sort as text, so the largest key is the newest entry.
function lastLoggedId(durations: Durations, ids: Set<string>) {
  const logged = Object.entries(durations).flatMap(([date, byHabit]) =>
    Object.entries(byHabit)
      .filter(([id]) => ids.has(id))
      .flatMap(([id, entries]) =>
        entries.map((entry) => ({ id, at: `${date}T${entry.startTime}` })),
      ),
  );

  return logged.toSorted((a, b) => b.at.localeCompare(a.at))[0]?.id;
}

/** The tile's Habit: the timed Habit logged most recently this week, else the first timed one. */
function tileHabit({ habits, durations = {} }: HabitsBody) {
  const timed = habits.filter((habit) => isTileHabit(habit));
  const lastId = lastLoggedId(durations, new Set(timed.map((habit) => habit.id)));
  const habit = timed.find(({ id }) => id === lastId) ?? timed[0];

  return habit ? { id: habit.id, name: habit.name } : null;
}

const widgetHabit = (habit: Habit): WidgetHabit => ({
  id: habit.id,
  name: habit.name,
  tick: !isTimed(habit),
  places: habit.places,
  time: habitTime(habit),
  priority: habit.priority,
});

/** Every active Habit's Places, so a widget can filter to a place even when nothing there is due today. */
const activePlaces = (habits: Habit[]) =>
  normalizePlaces(habits.filter((habit) => habit.active).flatMap((habit) => habit.places));

/** Today's due Habits still open, in Today's order, plus the Quick Settings tile's timed Habit. */
export function habitWidgets(body: HabitsBody, restPeriods: RestPeriod[], now: Date): HabitWidgets {
  const due = dueToday(
    body.habits,
    { counts: body.counts ?? {}, durations: body.durations ?? {}, restPeriods },
    now,
  )
    .filter(({ day }) => day.status === "empty")
    .map(({ habit }) => widgetHabit(habit));

  return { date: torontoDay(now), due, places: activePlaces(body.habits), timed: tileHabit(body) };
}

const MINUTE_MS = 60_000;

/** The Duration entry a Quick Settings tile session logs: on the Day it started, at least a minute long. */
export const tileEntry = (habit: string, startMs: number, endMs: number) => ({
  habit,
  date: torontoDay(startMs),
  startTime: torontoTime(startMs),
  minutes: Math.max(1, Math.round((endMs - startMs) / MINUTE_MS)),
});
