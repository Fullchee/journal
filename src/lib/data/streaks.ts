import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import * as z from "zod/mini";

import {
  checkInStreak,
  Counts,
  DayNotes,
  Durations,
  habitHistory,
  habitStreak,
  hasStreak,
  restPeriodOn,
  RestPeriod,
  Skips,
  torontoDay,
  type Habit,
  type HabitHistory,
  type Streak,
  type StreakRecords,
} from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";
import { useCheckIns } from "@/lib/data/check-ins";
import { STREAKS_KEY, useHabitTracker, withQueuedChecks, type HabitsBody } from "@/lib/data/habits";

/** Every Habit's full history and the Rest periods: what Streaks replay. */
const StreakHistory = z.object({
  counts: Counts,
  durations: Durations,
  skips: Skips,
  restPeriods: z.array(RestPeriod),
  notes: DayNotes,
});

type StreakHistory = z.infer<typeof StreakHistory>;

/** Under the Habits key, so every Habit change and check refetches it as well. A refetch keeps queued checks. */
const streakHistoryQuery = queryOptions({
  queryKey: STREAKS_KEY,
  queryFn: async ({ client, signal }) =>
    withQueuedChecks(client, await apiFetch("/api/streaks", { signal }, StreakHistory)),
  meta: { persist: true },
});

/** The Rest periods for the alarm schedule; empty before the first load. */
export function useRestPeriods(): RestPeriod[] {
  const { data } = useQuery({ ...streakHistoryQuery, select: (history) => history.restPeriods });

  return data ?? [];
}

type ByDay<Value> = Record<string, Record<string, Value>>;

// The tracker's recent days carry unsent taps, so they win over the history's copy of the same Habit and day.
function withRecent<Value>(history: ByDay<Value>, recent: ByDay<Value> = {}) {
  const merged = { ...history };

  for (const [day, byHabit] of Object.entries(recent))
    merged[day] = { ...history[day], ...byHabit };

  return merged;
}

const recordsOf = (history: StreakHistory, recent: HabitsBody): StreakRecords => ({
  counts: withRecent(history.counts, recent.counts),
  durations: withRecent(history.durations, recent.durations),
  skips: withRecent(history.skips, recent.skips),
  restPeriods: history.restPeriods,
});

const streaksOf = (history: StreakHistory, recent: HabitsBody, now: Date) => {
  const records = recordsOf(history, recent);

  return (habit: Habit): Streak | null =>
    hasStreak(habit) ? habitStreak(habit, records, now) : null;
};

/** Each Habit's Streak, or null for a Habit without one or before the history loads. */
export function useHabitStreaks(recent: HabitsBody, now: Date) {
  const { data } = useQuery(streakHistoryQuery);

  return data ? streaksOf(data, recent, now) : () => null;
}

/** Every Habit's records since its start date, with the tracker's unsent taps; null before the history loads. */
export function useHabitRecords(recent: HabitsBody): StreakRecords | null {
  const { data } = useQuery(streakHistoryQuery);

  return data ? recordsOf(data, recent) : null;
}

/** Each Day's notes on Duration entries and checks; empty before the history loads. */
export function useDayNotes(): DayNotes {
  const { data } = useQuery({ ...streakHistoryQuery, select: (history) => history.notes });

  return data ?? {};
}

// The persisted cache shows at once, so only a fetch since mount that has settled holds the server's answers.
const isFresh = (query: Pick<UseQueryResult, "isFetchedAfterMount" | "fetchStatus">) =>
  query.isFetchedAfterMount && query.fetchStatus === "idle";

/** The tracker's Habits and every Habit's records as the server holds them now; null until both refetch since mount. */
export function useFreshHabitRecords() {
  const tracker = useHabitTracker();
  const history = useQuery(streakHistoryQuery);

  return tracker.isSuccess && history.isSuccess && isFresh(tracker) && isFresh(history)
    ? { habits: tracker.data.habits, records: recordsOf(history.data, tracker.data) }
    : null;
}

/** A Habit's History, read from the same records as its Streak; null before the history loads. */
export function useHabitHistory(habit: Habit, recent: HabitsBody, now: Date): HabitHistory | null {
  const records = useHabitRecords(recent);

  return records && habitHistory(habit, records, now);
}

/** The Check-in Streak, or null before Check-ins and the history load. */
export function useCheckInStreak(now: Date) {
  const { data: history } = useQuery(streakHistoryQuery);
  const { data: checkIns } = useCheckIns();

  return history && checkIns
    ? checkInStreak(
        checkIns.checkIns.map(({ checkedInAt }) => checkedInAt),
        history.restPeriods,
        now,
      )
    : null;
}

/** Rest mode as Settings shows it: the running period, and online-only start and end. */
export function useRestMode(now: Date) {
  type RestChange = { type: "start-rest"; days: number } | { type: "end-rest" };

  const client = useQueryClient();
  const { data, isError } = useQuery(streakHistoryQuery);

  const {
    mutate,
    isPending,
    isError: failed,
  } = useMutation({
    networkMode: "always",
    retry: false,
    mutationFn: (change: RestChange) => apiFetch("/api/streaks", { method: "POST", body: change }),
    onSuccess: () => client.invalidateQueries({ queryKey: streakHistoryQuery.queryKey }),
  });

  return {
    loaded: data !== undefined,
    isError,
    running: data ? restPeriodOn(data.restPeriods, torontoDay(now)) : null,
    start: (days: number) => mutate({ type: "start-rest", days }),
    end: () => mutate({ type: "end-rest" }),
    isPending,
    failed,
  };
}
