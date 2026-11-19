import { authorizedBody, authorizeWriter } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { listDays } from "@worker/lib/signal-days";
import { IsoDate } from "@worker/lib/habit-records";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

const UPSERT = `INSERT INTO activity (date, steps, moderate_min, vigorous_min, resting_hr, avg_stress) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (date) DO UPDATE SET steps = excluded.steps, moderate_min = excluded.moderate_min,
    vigorous_min = excluded.vigorous_min, resting_hr = excluded.resting_hr, avg_stress = excluded.avg_stress`;

// The stress score runs 0 to 100.
const MAX_STRESS = 100;

const Count = z.int().check(z.gte(0));

const OptionalCount = z.optional(z.nullable(Count));

const Stress = Count.check(z.lte(MAX_STRESS));

/** A day as the push sends it; metrics the watch didn't measure are left out. */
const Day = z.object({
  date: IsoDate,
  steps: Count,
  moderate_min: OptionalCount,
  vigorous_min: OptionalCount,
  resting_hr: OptionalCount,
  avg_stress: z.optional(z.nullable(Stress)),
});

const Days = z.object({ rows: z.array(Day).check(z.minLength(1)) });

export async function onRequestGet({ request, env }: PagesContext) {
  return listDays(
    request,
    env,
    "activity",
    "SELECT date, steps, moderate_min AS moderateMin, vigorous_min AS vigorousMin, resting_hr AS restingHr, avg_stress AS avgStress FROM activity ORDER BY date DESC",
  );
}

export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody(
    { request, env },
    Days,
    "invalid activity rows",
    authorizeWriter,
  );

  if (body instanceof Response) return body;

  await Promise.all(
    body.rows.map((row) =>
      env.DB.prepare(UPSERT)
        .bind(
          row.date,
          row.steps,
          row.moderate_min ?? null,
          row.vigorous_min ?? null,
          row.resting_hr ?? null,
          row.avg_stress ?? null,
        )
        .run(),
    ),
  );

  return json({ upserted: body.rows.length });
}
