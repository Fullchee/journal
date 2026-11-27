import { useMutation } from "@tanstack/react-query";

import { CHECK, useHabitTracker, useImportDurations, type HabitCheck } from "@/lib/data/habits";
import { useHabitRecords } from "@/lib/data/streaks";
import type { FitbitWriters } from "@/lib/health/fitbit-auto-log";

/** Fitbit's writers once the Habits and their history refetch, so a read never overwrites an answered Day; null before. */
export function useFitbitWriters(): FitbitWriters | null {
  const { data } = useHabitTracker();
  const { records, fresh } = useHabitRecords();
  const { mutate } = useMutation<undefined, Error, HabitCheck>({ mutationKey: CHECK.key });
  const { mutateAsync } = useImportDurations();

  if (!fresh || !data) return null;

  return {
    counts: records.counts,
    recordStyles: Object.fromEntries(data.habits.map(({ id, record }) => [id, record])),
    check: (checks) => {
      for (const check of checks) mutate(check);
    },
    importDurations: mutateAsync,
  };
}
