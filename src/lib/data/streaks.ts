import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useMemo } from "react";
import * as z from "zod/mini";

import {
  checkInStreak,
  Counts,
  DayNotes,
  Durations,
  restPeriodOn,
  RestPeriod,
  Skips,
  torontoDay,
  type HabitRecords,
  type KnownRecords,
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

type ByDay<Value> = Record<string, Record<string, Value>>;

// The tracker's recent days are the fresher copy, so they win over the history's copy of the same Habit and day.
function withRecent<Value>(history: ByDay<Value>, recent: ByDay<Value> = {}) {
  const merged = { ...history };

  for (const [day, byHabit] of Object.entries(recent))
    merged[day] = { ...history[day], ...byHabit };

  return merged;
}

const NO_HISTORY: StreakHistory = {
  counts: {},
  durations: {},
  skips: {},
  restPeriods: [],
  notes: {},
};

const recordsOf = (history: StreakHistory, recent: HabitsBody | undefined): HabitRecords => ({
  counts: withRecent(history.counts, recent?.counts),
  durations: withRecent(history.durations, recent?.durations),
  skips: withRecent(history.skips, recent?.skips),
  restPeriods: history.restPeriods,
});

// The persisted cache shows at once, so only a fetch since mount that has settled holds the server's answers.
const isFresh = (query: Pick<UseQueryResult, "isFetchedAfterMount" | "fetchStatus">) =>
  query.isFetchedAfterMount && query.fetchStatus === "idle";

/**
 * Every Habit's records: the tracker's recent Days laid over the full history, with unsent taps on top, so a tap
 * shows everywhere before the server has it. `fresh` once both have refetched since mount, so the records are the
 * server's now.
 */
export function useHabitRecords(): KnownRecords & { fresh: boolean } {
  const client = useQueryClient();
  const tracker = useHabitTracker();
  const history = useQuery(streakHistoryQuery);

  // A tap writes both queries, so new data also brings each new unsent tap; effects keyed on the records rerun only then.
  const records = useMemo(
    () => withQueuedChecks(client, recordsOf(history.data ?? NO_HISTORY, tracker.data)),
    [client, history.data, tracker.data],
  );

  return {
    records,
    whole: history.data ? records : null,
    fresh: tracker.isSuccess && history.isSuccess && isFresh(tracker) && isFresh(history),
  };
}

/** Each Day's notes on Duration entries and checks; empty before the history loads. */
export function useDayNotes(): DayNotes {
  const { data } = useQuery({ ...streakHistoryQuery, select: (history) => history.notes });

  return data ?? {};
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
