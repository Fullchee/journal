import {
  MutationObserver,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { NavigationContext } from "expo-router/react-navigation";
import { useCallback, useContext, useRef, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import * as z from "zod/mini";

import {
  checksSince,
  Counts,
  doingHabitNames,
  Durations,
  Goal,
  Habit,
  isOneOff,
  MISSED,
  minutesLabel,
  RESCHEDULE_CAUSES,
  Reschedules,
  Skips,
  skipChange,
  withoutEntry,
  type Draft,
  type HabitAnswer,
  type ImportedEntry,
  type Reschedule,
  type EntryRef,
} from "@/core";

import { showUndoToast } from "@/ui";

import { useCelebrate } from "@/components/celebration";
import { apiFetch } from "@/lib/api/api-fetch";
import { useCheckIns } from "@/lib/data/check-ins";
import {
  CAPTURE_SCOPE,
  describeCaptures,
  unsentVariables,
  type CaptureKind,
} from "@/lib/data/captures";

/** `tracker` lists every Habit with Goals; `home` the active ones; `library` the ones without a target. */
type HabitsView = "tracker" | "home" | "library";

/**
 * `counts`, `durations`, `reschedules` and `skips` come only when the query names a `since` date.
 * `hevyHabit` is the Habit Hevy workouts log on, missing while the Worker's `HEVY_HABIT` is unset.
 */
export const HabitsBody = z.object({
  habits: z.array(Habit),
  hevyHabit: z.optional(z.string()),
  goals: z.optional(z.array(Goal)),
  counts: z.optional(Counts),
  durations: z.optional(Durations),
  reschedules: z.optional(Reschedules),
  skips: z.optional(Skips),
});

export type HabitsBody = z.infer<typeof HabitsBody>;

/** A count of 0 clears the day. A Skip's cause and note ride on its Not done check. */
const HabitCheck = z.object({
  date: z.string(),
  habit: z.string(),
  count: z.number(),
  cause: z.optional(z.enum(RESCHEDULE_CAUSES)),
  note: z.optional(z.string()),
});

export type HabitCheck = z.infer<typeof HabitCheck>;

/** Every Habit change and check refetches each query under this prefix. */
const HABITS_KEY = ["habits"] as const;

/** The queries that hold a Habit list; others under the prefix, such as Streaks, hold other shapes. */
const HABIT_LISTS_KEY = [...HABITS_KEY, "list"] as const;

/** Every Habit's full history, which Streaks and History read; a check refetches it with the lists. */
export const STREAKS_KEY = [...HABITS_KEY, "streaks"] as const;

/** The queued check every Habit tap and auto-complete goes through. */
export const CHECK: CaptureKind<HabitCheck> = {
  key: [...HABITS_KEY, "check"],
  variables: HabitCheck,
};

const withCheck = (counts: Counts, { date, habit, count }: HabitAnswer): Counts => ({
  ...counts,
  [date]: { ...counts[date], [habit]: count },
});

// The Skip's cause and note ride on its Not done check; a Not done without a cause leaves the stored cause alone.
function withSkip(skips: Skips, { date, habit, count, cause, note = "" }: HabitCheck): Skips {
  const change = skipChange(count, cause);

  if (change.kind === "keep") return skips;
  const rest = Object.fromEntries(Object.entries(skips[date] ?? {}).filter(([id]) => id !== habit));

  return {
    ...skips,
    [date]: change.kind === "set" ? { ...rest, [habit]: { cause: change.cause, note } } : rest,
  };
}

/** The records a check writes to: a Habit list's checks window, or every Day in the Streak history. */
type CheckRecords = Pick<HabitsBody, "counts" | "skips">;

/**
 * Lays Habit checks over fetched counts and Skips. A Habit list fetched without a `since` date holds no checks, so it
 * has nothing to lay them over.
 */
export function withChecks<Records extends CheckRecords>(
  records: Records,
  checks: HabitCheck[],
): Records {
  return records.counts
    ? {
        ...records,
        counts: checks.reduce((counts, check) => withCheck(counts, check), records.counts),
        skips: checks.reduce((skips, check) => withSkip(skips, check), records.skips ?? {}),
      }
    : records;
}

/** Lays unsent Habit checks over fetched records, so a tap shows until the server has it. */
export const withQueuedChecks = <Records extends CheckRecords>(
  client: QueryClient,
  records: Records,
): Records => withChecks(records, unsentVariables(client, CHECK));

const habitsQuery = (view: HabitsView, since?: string) =>
  queryOptions({
    queryKey: [...HABIT_LISTS_KEY, view, since ?? null],
    queryFn: async ({ client, signal }) => {
      const params = new URLSearchParams(since === undefined ? { view } : { view, since });
      const body = await apiFetch(`/api/habits?${params}`, { signal }, HabitsBody);

      return withQueuedChecks(client, body);
    },
    meta: { persist: true },
  });

// `type: "check"` sets the day's state, so a replayed check is harmless.
const saveCheck = ({ date, habit, count, cause, note = "" }: HabitCheck) =>
  apiFetch("/api/habits", {
    method: "POST",
    body: {
      type: "check",
      date,
      habit,
      on: count !== 0,
      count: count < 0 ? MISSED : Math.max(count, 1),
      ...(cause !== undefined && { cause, note }),
    },
  });

export function registerHabitCaptures(client: QueryClient) {
  client.setMutationDefaults(CHECK.key, {
    scope: CAPTURE_SCOPE,
    mutationFn: saveCheck,
    // Synchronous, so the tap is in the cache before mutate returns: a cancelled fetch reverts at once, not later.
    onMutate: () => {
      void client.cancelQueries({ queryKey: HABIT_LISTS_KEY });
      client.setQueriesData<HabitsBody>(
        { queryKey: HABIT_LISTS_KEY },
        (body) => body && withQueuedChecks(client, body),
      );
      // A back-filled Day can sit before the checks window, so History's records take the tap as well.
      client.setQueryData<CheckRecords>(
        STREAKS_KEY,
        (history) => history && withQueuedChecks(client, history),
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: HABITS_KEY }),
  });

  describeCaptures(CHECK, ({ habit, date }) => `${habit} on ${date}`);
}

/**
 * The first Day of the checks window. No timer moves it at midnight: it moves to the new Day when the app comes back
 * to the foreground or the screen gains focus.
 */
function useChecksSince() {
  const navigation = useContext(NavigationContext);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const appState = AppState.addEventListener("change", (state) => {
        if (state === "active") onChange();
      });

      // Outside a screen, such as the alarm schedule in the root layout, there is no focus to follow.
      const removeFocus = navigation?.addListener("focus", onChange);

      return () => {
        appState.remove();
        removeFocus?.();
      };
    },
    [navigation],
  );

  return useSyncExternalStore(subscribe, () => checksSince());
}

/** Every Habit with its Goals, and the checks of this week's Days. */
export const useHabitTracker = () => useQuery(habitsQuery("tracker", useChecksSince()));

/** What a Habit's screen shows until the tracker holds that Habit. */
export function missingHabitText(loaded: boolean, isError: boolean) {
  if (loaded) return "This Habit no longer exists.";

  return isError ? "Couldn't load Habits." : "Loading…";
}

/** The active Habits, and the checks of this week's Days. */
export const useTodayHabits = () => useQuery(habitsQuery("home", useChecksSince()));

/** The Library's reference Habits; they have no checks. */
export const useHabitLibrary = () => useQuery(habitsQuery("library"));

/** Chips for a Check-in's "What were you doing?" at its place; reads the Habits tab's and the Check-ins' caches. */
export function useHabitNames() {
  const { data } = useHabitTracker();
  const { data: checkIns } = useCheckIns();

  return (place: string) => doingHabitNames(data?.habits ?? [], checkIns?.checkIns ?? [], place);
}

const ACTION_TOAST = "habit-action";

const trackerIn = (client: QueryClient) =>
  client.getQueryData(habitsQuery("tracker", checksSince()).queryKey);

const habitIn = (client: QueryClient, id: string) =>
  trackerIn(client)?.habits.find((habit) => habit.id === id);

// The tracker holds only the Days since `checksSince()`; History back-fills older ones into the Streak history.
const recordsHolding = (client: QueryClient, date: string): CheckRecords | undefined =>
  date < checksSince() ? client.getQueryData<CheckRecords>(STREAKS_KEY) : trackerIn(client);

/** The check that puts a day back as the cache holds it now, Skip cause included. */
function currentCheck(client: QueryClient, { date, habit }: HabitCheck): HabitCheck {
  const records = recordsHolding(client, date);
  const skip = records?.skips?.[date]?.[habit];

  return { date, habit, count: records?.counts?.[date]?.[habit] ?? 0, ...skip };
}

// Any Habit list fetched with a `since` holds the Days up to its fetch, so the freshest one knows today best.
function listedCount(client: QueryClient, date: string, habit: string) {
  const counts = client
    .getQueryCache()
    .findAll({ queryKey: HABIT_LISTS_KEY })
    .toSorted((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
    .map(({ queryKey }) => client.getQueryData<HabitsBody>(queryKey)?.counts)
    .find((listed) => listed !== undefined);

  if (counts === undefined) return;

  return withQueuedChecks(client, { counts }).counts[date]?.[habit] ?? 0;
}

/**
 * A Habit's stored count on a Day, unsent checks included. The server stores a count as given, so with no Habit list
 * cached this fetches one rather than guess 0 and overwrite a higher count.
 */
export async function storedCount(client: QueryClient, date: string, habit: string) {
  const listed = listedCount(client, date, habit);

  if (listed !== undefined) return listed;
  await client.query(habitsQuery("home", checksSince()));

  return listedCount(client, date, habit) ?? 0;
}

/** Queues a check made outside a screen, such as from a notification button: it saves like a tap, without the toast. */
export const queueHabitCheck = (client: QueryClient, check: HabitCheck) =>
  new MutationObserver<undefined, Error, HabitCheck>(client, { mutationKey: CHECK.key }).mutate(
    check,
  );

// A recurring Habit's Not done is a Skip (#102); a clear takes back an answer by hand, so it offers no Undo.
function actionName(habit: Habit, count: number) {
  if (count === 0) return null;

  if (count > 0) return "Done";

  return isOneOff(habit) ? "Not done" : "Skipped";
}

// The Skip sheet's cause lands on the Skip just made, so the toast and its Undo carry on from it.
const addsCause = (open: HabitCheck, next: HabitCheck) =>
  open.date === next.date && open.habit === next.habit && open.count === next.count;

/**
 * Queued: shows at once, saves when online. Each call is one action: its toast's Undo writes back every day it
 * changed. A Done on a `good` Habit celebrates; a `bad` Habit's log never does. `onSend` hears every check sent,
 * Undo's included.
 */
export function useCheckHabit(onSend?: (checks: HabitCheck[]) => void) {
  const client = useQueryClient();
  const { mutate } = useMutation<undefined, Error, HabitCheck>({ mutationKey: CHECK.key });
  const { celebrate, stop } = useCelebrate();
  const open = useRef<{ last: HabitCheck; undo: HabitCheck[] } | null>(null);

  return (first: HabitCheck, ...rest: HabitCheck[]) => {
    const checks = [first, ...rest];
    const last = rest.at(-1) ?? first;
    const habit = habitIn(client, last.habit);
    const before = checks.map((check) => currentCheck(client, check));
    const grew = last.count > currentCheck(client, last).count;

    for (const check of checks) mutate(check);
    onSend?.(checks);

    const action = habit && actionName(habit, last.count);

    if (!habit || action === null) return;

    const prior = open.current;
    const carriesOn = prior !== null && addsCause(prior.last, last);
    const undo = carriesOn ? prior.undo : before;
    open.current = { last, undo };
    showUndoToast({
      id: ACTION_TOAST,
      message: `${action} · ${habit.name}`,
      onUndo: () => {
        stop();

        for (const check of undo) mutate(check);
        onSend?.(undo);
      },
      onClose: () => {
        open.current = null;
      },
    });

    if (grew && !carriesOn && action === "Done" && habit.kind === "good")
      celebrate({ kind: "done", target: habit.id });
  };
}

// Habit edits are online only: they fail at once offline instead of joining the capture queue.
const ONLINE_ONLY = { networkMode: "always", retry: false } as const;

type HabitChange =
  | ({ type: "habit" } & Draft)
  | { type: "delete-habit"; id: string }
  | { type: "delete-duration"; entry: number }
  | ({ type: "add-duration" } & NewDuration)
  | ({ type: "reschedule" } & Pick<NewReschedule, "habit" | "to" | "cause"> & { note?: string })
  | { type: "undo-reschedule"; habit: string; to: string };

/** One Duration entry typed on Today: `startTime` is a local HH:MM. */
interface NewDuration {
  habit: string;
  date: string;
  startTime: string;
  minutes: number;
}

/** A One-off's move to a new date; an empty note means none. */
interface NewReschedule {
  habit: string;
  to: Reschedule["to"];
  cause: Reschedule["cause"];
  note: string;
}

const postChange = (change: HabitChange) =>
  apiFetch("/api/habits", { method: "POST", body: change });

/** Every Habit edit refetches the Habits; alarms (#22) reschedule from that cache. */
export const invalidateHabits = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: HABITS_KEY });

const CreatedHabit = z.object({ id: z.string() });

// A create answers the generated id; an edit answers nothing, since the client already has it.
async function saveHabit(draft: Draft): Promise<string> {
  const change = { method: "POST", body: { type: "habit", ...draft } } as const;

  if (draft.id !== undefined) {
    await apiFetch("/api/habits", change);

    return draft.id;
  }

  const { id } = await apiFetch("/api/habits", change, CreatedHabit);

  return id;
}

/** Online only: a Draft without an id creates a Habit; with one it replaces that Habit's fields. Resolves to the id. */
export function useSaveHabit() {
  const client = useQueryClient();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: saveHabit,
    onSuccess: () => invalidateHabits(client),
  });
}

/** Online only: the server also drops the Habit's checks, Duration entries and Goal links. */
export function useDeleteHabit() {
  const client = useQueryClient();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: (id: string) => postChange({ type: "delete-habit", id }),
    onSuccess: () => invalidateHabits(client),
  });
}

/** Online only: the server refuses an entry for a Habit that isn't timed. */
export function useAddDuration() {
  const client = useQueryClient();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: (entry: NewDuration) => postChange({ type: "add-duration", ...entry }),
    onSuccess: () => invalidateHabits(client),
  });
}

const Imported = z.object({ added: z.number() });

/** Online only: adds each entry the Habit doesn't have yet. Resolves to how many it added. */
export function useImportDurations() {
  const client = useQueryClient();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: async ({ habit, entries }: { habit: string; entries: ImportedEntry[] }) => {
      const body = { type: "import-durations", habit, entries };
      const { added } = await apiFetch("/api/habits", { method: "POST", body }, Imported);

      return added;
    },
    onSuccess: () => invalidateHabits(client),
  });
}

/**
 * Online only: hides the Duration entry at once, and a failed delete brings it back with the refetch. Undo logs
 * the same start and minutes again as a new entry, so each delete names the entry's start, minutes and Habit name.
 */
export function useDeleteDuration() {
  const client = useQueryClient();
  const { mutate: restore } = useImportDurations();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: (entry: EntryRef & ImportedEntry & { name: string }) =>
      postChange({ type: "delete-duration", entry: entry.id }),
    onMutate: (entry) => {
      void client.cancelQueries({ queryKey: HABIT_LISTS_KEY });
      client.setQueriesData<HabitsBody>(
        { queryKey: HABIT_LISTS_KEY },
        (body) => body?.durations && { ...body, durations: withoutEntry(body.durations, entry) },
      );
    },
    onSuccess: (_data, { habit, name, date, startTime, minutes }) => {
      showUndoToast({
        id: ACTION_TOAST,
        message: `Deleted ${minutesLabel(minutes)} · ${name}`,
        onUndo: () => restore({ habit, entries: [{ date, startTime, minutes }] }),
      });
    },
    onSettled: () => invalidateHabits(client),
  });
}

const withStartDate = (
  body: HabitsBody,
  { habit, to }: Pick<NewReschedule, "habit" | "to">,
): HabitsBody => ({
  ...body,
  habits: body.habits.map((h) => (h.id === habit ? { ...h, startDate: to } : h)),
});

const moveInCache = (client: QueryClient, move: Pick<NewReschedule, "habit" | "to">) =>
  client.setQueriesData<HabitsBody>(
    { queryKey: HABIT_LISTS_KEY },
    (body) => body && withStartDate(body, move),
  );

/** Online only: takes back the One-off's latest Reschedule, which moved it to `to`, and puts it back on `from`. */
function useUndoReschedule() {
  const client = useQueryClient();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: ({ habit, to }: { habit: string; to: string; from: string }) =>
      postChange({ type: "undo-reschedule", habit, to }),
    onSuccess: (_data, { habit, from }) => {
      moveInCache(client, { habit, to: from });

      return invalidateHabits(client);
    },
  });
}

/** Online only: moves the One-off's date in the cache at once, so it leaves Today before the refetch lands. */
export function useReschedule() {
  const client = useQueryClient();
  const { stop } = useCelebrate();
  const { mutate: undo } = useUndoReschedule();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: ({ note, ...change }: NewReschedule) =>
      postChange({ type: "reschedule", ...change, ...(note !== "" && { note }) }),
    onSuccess: (_data, change) => {
      const habit = habitIn(client, change.habit);

      moveInCache(client, change);

      if (habit)
        showUndoToast({
          id: ACTION_TOAST,
          message: `Rescheduled · ${habit.name}`,
          onUndo: () => {
            stop();
            undo({ habit: habit.id, to: change.to, from: habit.startDate });
          },
        });

      return invalidateHabits(client);
    },
  });
}
