import { authorizedBody, authorizeWriter } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { listDays } from "@worker/lib/signal-days";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

const UPSERT = `INSERT INTO workouts (activity_id, type_key, name, start_local, duration_s, distance_m, avg_hr, calories)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (activity_id) DO UPDATE SET type_key = excluded.type_key, name = excluded.name,
    start_local = excluded.start_local, duration_s = excluded.duration_s, distance_m = excluded.distance_m,
    avg_hr = excluded.avg_hr, calories = excluded.calories`;

// The watch's local start time, e.g. "2026-11-03 07:12:00".
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const Count = z.int().check(z.gte(0));

const OptionalCount = z.optional(z.nullable(Count));

const Meters = z.number().check(z.gte(0));

/** A workout as the push sends it; fields the watch didn't record are left out. */
const Workout = z.object({
  activity_id: z.int().check(z.gt(0)),
  type_key: z.string().check(z.minLength(1)),
  name: z.string(),
  start_local: z.string().check(z.regex(LOCAL_TIME)),
  duration_s: Count,
  distance_m: z.optional(z.nullable(Meters)),
  avg_hr: OptionalCount,
  calories: OptionalCount,
});

const Workouts = z.object({ rows: z.array(Workout).check(z.minLength(1)) });

export async function onRequestGet({ request, env }: PagesContext) {
  return listDays(
    request,
    env,
    "workouts",
    `SELECT activity_id AS activityId, substr(start_local, 1, 10) AS date, start_local AS startLocal, type_key AS typeKey,
      name, duration_s AS durationS, distance_m AS distanceM, avg_hr AS avgHr, calories
    FROM workouts ORDER BY start_local DESC`,
  );
}

export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody(
    { request, env },
    Workouts,
    "invalid workout rows",
    authorizeWriter,
  );

  if (body instanceof Response) return body;

  await Promise.all(
    body.rows.map((row) =>
      env.DB.prepare(UPSERT)
        .bind(
          row.activity_id,
          row.type_key,
          row.name,
          row.start_local,
          row.duration_s,
          row.distance_m ?? null,
          row.avg_hr ?? null,
          row.calories ?? null,
        )
        .run(),
    ),
  );

  return json({ upserted: body.rows.length });
}
