import { FitbitSessionUpload, type FitbitSession } from "@/core";
import { authorizedBody } from "@worker/lib/auth";
import type { D1, PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";

const UPSERT = `INSERT INTO fitbit_sessions (id, exercise_type, title, start_date, start_time, end_time, duration_s, distance_m)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (id) DO UPDATE SET exercise_type = excluded.exercise_type, title = excluded.title,
    start_date = excluded.start_date, start_time = excluded.start_time, end_time = excluded.end_time,
    duration_s = excluded.duration_s, distance_m = excluded.distance_m`;

const upsert = (db: D1, session: FitbitSession) =>
  db
    .prepare(UPSERT)
    .bind(
      session.id,
      session.exerciseType,
      session.title,
      session.startDate,
      session.startTime,
      session.endTime,
      session.durationS,
      session.distanceM,
    );

/** Drops stored sessions in the upload's window that the phone no longer has, such as a false auto-detected walk. */
const deleteMissing = (db: D1, from: string, sessions: FitbitSession[]) =>
  db
    .prepare(
      "DELETE FROM fitbit_sessions WHERE start_date >= ?1 AND id NOT IN (SELECT value FROM json_each(?2))",
    )
    .bind(from, JSON.stringify(sessions.map((session) => session.id)));

/** Mirrors the phone's Fitbit sessions from `from` on into fitbit_sessions. */
export async function onRequestPost(context: PagesContext) {
  const body = await authorizedBody(context, FitbitSessionUpload, "invalid Fitbit sessions");

  if (body instanceof Response) return body;
  const { DB } = context.env;

  await DB.batch([
    deleteMissing(DB, body.from, body.sessions),
    ...body.sessions.map((session) => upsert(DB, session)),
  ]);

  return json({ stored: body.sessions.length });
}
