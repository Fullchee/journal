import * as z from "zod/mini";
import type { D1, D1Statement } from "@worker/lib/env";
import { expectJson } from "@worker/lib/json";

/**
 * Syncs Hevy workouts and sets into D1 through the private API hevy.com itself calls (#28); docs/research/hevy-data.md, "Route 1".
 * The field names come from hevy.com's own CSV export code. Health Connect, not this sync, logs workouts on the Lift weights Habit.
 */
const HEVY = "https://api.hevyapp.com/";

// The fixed key of hevy.com's web client, not a per-user secret.
const CLIENT_HEADERS = { "x-api-key": "shelobs_hevy_web", "Hevy-Platform": "web" };

/** The free plan allows 50 subrequests a run; the rest is headroom. */
export const REQUEST_BUDGET = 45;

// hevy.com refreshes a token with less than 15 minutes left.
const REFRESH_MARGIN_MS = 15 * 60_000;

export const SCAN_EVERY_MS = 7 * 24 * 60 * 60_000;

const SIGN_IN_HELP =
  "Re-copy refresh_token from the auth2.0-token cookie at hevy.com and seed hevy_auth (docs/research/hevy-data.md).";

const Tokens = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.string(),
});

const HevySet = z.object({
  indicator: z.string(),
  weight_kg: z.nullish(z.number()),
  reps: z.nullish(z.number()),
  rpe: z.nullish(z.number()),
  distance_meters: z.nullish(z.number()),
  duration_seconds: z.nullish(z.number()),
});

const Exercise = z.object({
  title: z.string(),
  exercise_template_id: z.nullish(z.string()),
  notes: z.nullish(z.string()),
  superset_id: z.nullish(z.number()),
  sets: z.array(HevySet),
});

/** A workout's `id` and `index` place it; without them the whole batch is unusable. */
const WorkoutKey = z.object({ id: z.string(), index: z.number() });

/** `start_time` and `end_time` are Unix seconds. */
const Workout = z.object({
  id: z.string(),
  index: z.number(),
  name: z.string(),
  description: z.nullish(z.string()),
  start_time: z.number(),
  end_time: z.number(),
  updated_at: z.nullish(z.string()),
  exercises: z.array(Exercise),
});

type Workout = z.infer<typeof Workout>;

const Batch = z.array(z.unknown());

interface AuthRow {
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
}

interface ScanRow {
  scan_started_at: string | null;
  next_index: number;
  finished_at: string | null;
}

interface HevyRequest {
  method?: "POST";
  body?: string;
  headers: Record<string, string>;
}

type Call = (path: string, request: HevyRequest) => Promise<Response>;

type Get = (path: string) => Promise<Response>;

const isoFromUnix = (seconds: number) => new Date(seconds * 1000).toISOString();

const hasTimeLeft = (auth: AuthRow, now: Date) =>
  auth.access_token !== null &&
  auth.expires_at !== null &&
  Date.parse(auth.expires_at) - now.getTime() > REFRESH_MARGIN_MS;

/** A usable access token, refreshed and saved first when it is missing or about to expire; null after logging why there is none. */
async function accessToken(db: D1, now: Date, call: Call): Promise<string | null> {
  const { results } = await db
    .prepare("SELECT refresh_token, access_token, expires_at FROM hevy_auth WHERE id = 1")
    .bind()
    .all<AuthRow>();

  const [auth] = results;

  if (auth === undefined) {
    console.error(`Hevy sync skipped: hevy_auth has no row. ${SIGN_IN_HELP}`);

    return null;
  }

  if (hasTimeLeft(auth, now)) return auth.access_token;

  const res = await call("auth/refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: auth.refresh_token }),
    headers: auth.access_token === null ? {} : { authorization: `Bearer ${auth.access_token}` },
  });

  if (res.status >= 400 && res.status < 500) {
    console.error(
      `Hevy sign-in failed: auth/refresh_token answered ${res.status}. ${SIGN_IN_HELP}`,
    );

    return null;
  }

  if (!res.ok) throw new Error(`auth/refresh_token answered ${res.status}`);
  const tokens = await expectJson(res, Tokens);

  // Saved before any workout request: Hevy may retire the old refresh token.
  await db
    .prepare(
      "UPDATE hevy_auth SET refresh_token = ?, access_token = ?, expires_at = ? WHERE id = 1",
    )
    .bind(tokens.refresh_token, tokens.access_token, tokens.expires_at)
    .run();

  return tokens.access_token;
}

function workoutWrites(db: D1, workout: Workout, seenAt: string): D1Statement[] {
  const upsert = db
    .prepare(
      `INSERT INTO hevy_workouts (id, "index", title, start_time, end_time, description, updated_at, seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET "index" = excluded."index", title = excluded.title,
          start_time = excluded.start_time, end_time = excluded.end_time, description = excluded.description,
          updated_at = excluded.updated_at, seen_at = excluded.seen_at`,
    )
    .bind(
      workout.id,
      workout.index,
      workout.name,
      isoFromUnix(workout.start_time),
      isoFromUnix(workout.end_time),
      workout.description ?? null,
      workout.updated_at ?? null,
      seenAt,
    );

  const sets = workout.exercises.flatMap((exercise, exerciseIndex) =>
    exercise.sets.map((set, order) =>
      db
        .prepare(
          `INSERT INTO hevy_sets (workout_id, exercise_index, set_index, exercise_title, exercise_template_id,
            exercise_notes, superset_id, set_type, weight_kg, reps, rpe, distance_m, duration_s)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          workout.id,
          exerciseIndex,
          order,
          exercise.title,
          exercise.exercise_template_id ?? null,
          exercise.notes ?? null,
          exercise.superset_id ?? null,
          set.indicator,
          set.weight_kg ?? null,
          set.reps ?? null,
          set.rpe ?? null,
          set.distance_meters ?? null,
          set.duration_seconds ?? null,
        ),
    ),
  );

  return [
    upsert,
    db.prepare("DELETE FROM hevy_sets WHERE workout_id = ?").bind(workout.id),
    ...sets,
  ];
}

/** Writes for one batch: each valid workout upserted with its sets replaced; a malformed one logged, skipped and kept as seen. */
function batchWrites(db: D1, batch: unknown[], seenAt: string) {
  return batch.flatMap((item) => {
    const key = WorkoutKey.parse(item);
    const parsed = Workout.safeParse(item);

    if (parsed.success) return workoutWrites(db, parsed.data, seenAt);
    console.error(
      `Hevy workout ${key.id} (index ${key.index}) skipped: ${z.prettifyError(parsed.error)}`,
    );

    // Still in Hevy, so a full scan must not delete its stored copy.
    return [db.prepare("UPDATE hevy_workouts SET seen_at = ? WHERE id = ?").bind(seenAt, key.id)];
  });
}

/** Hevy's authorized GET, and whether this run may still send a request. */
interface Hevy {
  get: Get;
  hasBudget: () => boolean;
}

/** Pages workouts_batch from `start` until a batch comes back empty or the budget runs out. */
async function page(db: D1, hevy: Hevy, start: number, seenAt: string) {
  let cursor = start;

  while (hevy.hasBudget()) {
    const res = await hevy.get(`workouts_batch/${cursor}`);

    if (!res.ok) throw new Error(`workouts_batch/${cursor} answered ${res.status}`);
    const batch = await expectJson(res, Batch);

    if (batch.length === 0) return { cursor, reachedEnd: true };
    await db.batch(batchWrites(db, batch, seenAt));
    cursor = Math.max(...batch.map((item) => WorkoutKey.parse(item).index)) + 1;
  }

  return { cursor, reachedEnd: false };
}

/** The scan state, plus the index after the highest stored workout, where a daily run resumes. */
async function readScan(db: D1) {
  const { results } = await db
    .prepare(
      `SELECT scan_started_at, next_index, finished_at,
        (SELECT COALESCE(MAX("index") + 1, 0) FROM hevy_workouts) AS after_stored
        FROM hevy_scan WHERE id = 1`,
    )
    .bind()
    .all<ScanRow & { after_stored: number }>();

  const [scan] = results;

  if (scan === undefined) throw new Error("hevy_scan has no row; migration 0007 inserts it");

  return scan;
}

const scanIsDue = (scan: ScanRow, now: Date) =>
  scan.finished_at === null || now.getTime() - Date.parse(scan.finished_at) >= SCAN_EVERY_MS;

/** Deletes stored workouts the finished scan never saw, with their sets, and closes the scan. Every scan run comes after `startedAt`, so a row last seen at or before it was not seen. */
const finishScan = (db: D1, startedAt: string, runAt: string) =>
  db.batch([
    db
      .prepare(
        "DELETE FROM hevy_sets WHERE workout_id IN (SELECT id FROM hevy_workouts WHERE seen_at <= ?)",
      )
      .bind(startedAt),
    db.prepare("DELETE FROM hevy_workouts WHERE seen_at <= ?").bind(startedAt),
    db
      .prepare(
        "UPDATE hevy_scan SET scan_started_at = NULL, next_index = 0, finished_at = ? WHERE id = 1",
      )
      .bind(runAt),
  ]);

async function sync(db: D1, now: Date, fetcher: typeof fetch) {
  let requests = 0;

  const call: Call = (path, request) => {
    requests += 1;

    return fetcher(`${HEVY}${path}`, {
      ...request,
      headers: { ...CLIENT_HEADERS, "content-type": "application/json", ...request.headers },
    });
  };

  const token = await accessToken(db, now, call);

  if (token === null) return;
  const get: Get = (path) => call(path, { headers: { authorization: `Bearer ${token}` } });
  const runAt = now.toISOString();
  const scan = await readScan(db);
  const scanning = scan.scan_started_at;
  const start = scanning === null ? scan.after_stored : scan.next_index;

  const { cursor, reachedEnd } = await page(
    db,
    { get, hasBudget: () => requests < REQUEST_BUDGET },
    start,
    runAt,
  );

  if (scanning !== null && reachedEnd) await finishScan(db, scanning, runAt);
  else if (scanning !== null)
    await db.prepare("UPDATE hevy_scan SET next_index = ? WHERE id = 1").bind(cursor).run();
  // The next run re-reads every workout, so edits and deletes in Hevy reach D1 weekly.
  else if (reachedEnd && scanIsDue(scan, now))
    await db
      .prepare("UPDATE hevy_scan SET scan_started_at = ?, next_index = 0 WHERE id = 1")
      .bind(runAt)
      .run();
}

/** One cron run. New workouts sync daily; a weekly full scan, resumed across runs, refreshes edits and finds deletes. */
export async function syncHevy(db: D1, now: Date, fetcher: typeof fetch): Promise<void> {
  try {
    await sync(db, now, fetcher);
  } catch (error) {
    console.error(`Hevy sync stopped: ${String(error)}`);
  }
}
