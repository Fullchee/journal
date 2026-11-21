import { shiftDay, torontoDay } from "@/core";
import * as z from "zod/mini";
import type { D1, Env } from "./env";
import { connectGoogleHealth, type ListDataPoints, WATCH_ONLY } from "./google-health";

/** Each run re-reads this many Days, so a session the watch uploads late, or the owner edits or deletes, still lands. */
const REFETCH_DAYS = 14;

/** Distance data points of one session; the API's maximum, so one page covers even a long ride. */
const DISTANCE_PAGE_SIZE = "10000";

const CivilDate = z.object({ year: z.number(), month: z.number(), day: z.number() });

const Interval = z.object({
  startTime: z.string(),
  endTime: z.string(),
  civilStartTime: z.object({ date: CivilDate }),
});

/** A google-duration: seconds with an `s` suffix, e.g. "1830s" or "3.5s". */
const Seconds = z.pipe(
  z.string().check(z.regex(/^\d+(?:\.\d+)?s$/)),
  z.transform((duration) => Number(duration.slice(0, -1))),
);

const MetricsSummary = z.object({ distanceMillimeters: z.optional(z.number()) });

const ExerciseMetadata = z.object({ hasGps: z.optional(z.boolean()) });

const Exercise = z.object({
  exerciseType: z.string(),
  displayName: z.optional(z.string()),
  interval: Interval,
  activeDuration: z.optional(Seconds),
  metricsSummary: z.optional(MetricsSummary),
  exerciseMetadata: z.optional(ExerciseMetadata),
});

const ExercisePoint = z.object({ name: z.string(), exercise: Exercise });

type ExercisePoint = z.infer<typeof ExercisePoint>;

/** `millimeters` is an int64, which JSON carries as a string. */
const Millimeters = z.pipe(z.union([z.string(), z.number()]), z.transform(Number));

const DistancePoint = z.object({ distance: z.object({ millimeters: Millimeters }) });

interface Distance {
  millimeters: number;
  source: "summary" | "points";
}

const pad = (value: number) => String(value).padStart(2, "0");

const civilDay = ({ year, month, day }: z.infer<typeof CivilDate>) =>
  `${year}-${pad(month)}-${pad(day)}`;

/** The summary's distance; without one, the sum of the watch's distance points inside the session, or null when it has none. */
async function distanceOf(list: ListDataPoints, { exercise }: ExercisePoint) {
  const summary = exercise.metricsSummary?.distanceMillimeters;

  if (summary !== undefined) return { millimeters: summary, source: "summary" } satisfies Distance;
  const { startTime, endTime } = exercise.interval;

  const points = await list(
    "distance",
    {
      filter: `distance.interval.start_time >= "${startTime}" AND distance.interval.start_time < "${endTime}"`,
      dataSourceFamily: WATCH_ONLY,
      pageSize: DISTANCE_PAGE_SIZE,
    },
    DistancePoint,
  );

  if (points.length === 0) return null;

  return {
    millimeters: points.reduce((sum, point) => sum + point.distance.millimeters, 0),
    source: "points",
  } satisfies Distance;
}

function upsert(db: D1, point: ExercisePoint, distance: Distance | null, syncedAt: string) {
  const { exercise } = point;
  const hasGps = exercise.exerciseMetadata?.hasGps;

  return db
    .prepare(
      `INSERT INTO fitbit_sessions (name, exercise_type, display_name, start_date, start_time, end_time,
        active_duration_s, has_gps, distance_mm, distance_source, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (name) DO UPDATE SET exercise_type = excluded.exercise_type,
          display_name = excluded.display_name, start_date = excluded.start_date,
          start_time = excluded.start_time, end_time = excluded.end_time,
          active_duration_s = excluded.active_duration_s, has_gps = excluded.has_gps,
          distance_mm = excluded.distance_mm, distance_source = excluded.distance_source,
          synced_at = excluded.synced_at`,
    )
    .bind(
      point.name,
      exercise.exerciseType,
      exercise.displayName ?? null,
      civilDay(exercise.interval.civilStartTime.date),
      exercise.interval.startTime,
      exercise.interval.endTime,
      exercise.activeDuration ?? null,
      hasGps === undefined ? null : Number(hasGps),
      distance?.millimeters ?? null,
      distance?.source ?? null,
      syncedAt,
    );
}

/** Drops stored sessions in the re-fetched window that the API no longer lists, such as a false auto-detected walk. */
function deleteMissing(db: D1, windowStart: string, sessions: ExercisePoint[]) {
  return db
    .prepare(
      "DELETE FROM fitbit_sessions WHERE start_date >= ?1 AND name NOT IN (SELECT value FROM json_each(?2))",
    )
    .bind(windowStart, JSON.stringify(sessions.map((session) => session.name)));
}

async function sync(env: Env, now: Date, fetcher: typeof fetch) {
  const list = await connectGoogleHealth(env, fetcher);

  if (list === null) return;
  const windowStart = shiftDay(torontoDay(now), -REFETCH_DAYS);

  const sessions = await list(
    "exercise",
    {
      filter: `exercise.interval.civil_start_time >= "${windowStart}"`,
      dataSourceFamily: WATCH_ONLY,
      pageSize: "25",
    },
    ExercisePoint,
  );

  const syncedAt = now.toISOString();
  const writes = [deleteMissing(env.DB, windowStart, sessions)];

  for (const session of sessions)
    writes.push(upsert(env.DB, session, await distanceOf(list, session), syncedAt));

  // Written only after every read succeeds, so a failed run leaves stored rows as they were.
  await env.DB.batch(writes);
}

/** One cron run: mirrors the watch's exercise sessions from the last REFETCH_DAYS Days into fitbit_sessions. */
export async function syncFitbitSessions(env: Env, now: Date, fetcher: typeof fetch) {
  try {
    await sync(env, now, fetcher);
  } catch (error) {
    console.error(`Fitbit session sync stopped: ${String(error)}`);
  }
}
