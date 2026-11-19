// Workouts Signal: count and total time per workout type over the chart's period, per #60. Plain numbers, no bands.

import * as z from "zod/mini";

/** One recorded workout as the API returns it; `date` is the local day it started. Null when the watch didn't record it. */
export const WorkoutRow = z.object({
  activityId: z.number(),
  date: z.string(),
  startLocal: z.string(),
  typeKey: z.string(),
  name: z.string(),
  durationS: z.number(),
  distanceM: z.nullable(z.number()),
  avgHr: z.nullable(z.number()),
  calories: z.nullable(z.number()),
});

export type WorkoutRow = z.infer<typeof WorkoutRow>;

const SECONDS_PER_MINUTE = 60;

const MINUTES_PER_HOUR = 60;

/** e.g. "45 min" or "1h 05m". */
export function workoutDuration(seconds: number) {
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);

  return minutes < MINUTES_PER_HOUR
    ? `${minutes} min`
    : `${Math.floor(minutes / MINUTES_PER_HOUR)}h ${String(minutes % MINUTES_PER_HOUR).padStart(2, "0")}m`;
}

/** The workout type key as words, e.g. "road_biking" is "Road biking". */
export function workoutType(typeKey: string) {
  const words = typeKey.replaceAll("_", " ");

  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One row per workout type, the most time first. */
export function workoutRows(workouts: Pick<WorkoutRow, "typeKey" | "durationS">[]) {
  const byType = new Map<string, { count: number; seconds: number }>();

  for (const { typeKey, durationS } of workouts) {
    const total = byType.get(typeKey) ?? { count: 0, seconds: 0 };

    byType.set(typeKey, { count: total.count + 1, seconds: total.seconds + durationS });
  }

  return [...byType]
    .toSorted(([a, x], [b, y]) =>
      y.seconds === x.seconds ? a.localeCompare(b) : y.seconds - x.seconds,
    )
    .map(([typeKey, { count, seconds }]) => ({
      label: workoutType(typeKey),
      value: `${count} ${count === 1 ? "workout" : "workouts"}, ${workoutDuration(seconds)}`,
      trend: "",
    }));
}
