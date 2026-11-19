import { authorizedBody, authorizeWriter } from "@worker/lib/auth";
import type { PagesContext, SqlValue } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import { IsoWeek, keptUnlessSent, upsertRow, WorkCount, workRows } from "@worker/lib/work-store";
import * as z from "zod/mini";

const Median = keptUnlessSent(z.number());

/** Each forecast metric's [low, high] range, such as `tickets_resolved: [2, 6]`. */
const Range = z.tuple([z.number(), z.number()]);

const Forecast = z.record(z.string(), Range);

/** A work week as weeks.jsonl holds it; every field but `week` is optional and keeps its stored value when omitted. */
const WorkWeek = z.object({
  week: IsoWeek,
  tickets: WorkCount,
  scenarios: WorkCount,
  median_cycle_hours: Median,
  median_pr_size: Median,
  reverts: WorkCount,
  reopened: WorkCount,
  reviews: WorkCount,
  forecast: z.optional(Forecast),
});

/** Lists the POST shape; the weekly note comes back from /api/work/weekly-notes. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorizeWriter(request, env);

  if (viewer instanceof Response) return viewer;

  const { results } = await env.DB.prepare(
    `SELECT ${Object.keys(WorkWeek.shape).join(", ")} FROM work_weeks ORDER BY week DESC`,
  )
    .bind()
    .all<{ forecast: string; [column: string]: SqlValue }>();

  const weeks = results.map(({ forecast, ...week }) => ({
    ...week,
    forecast: Forecast.parse(JSON.parse(forecast)),
  }));

  return json({ weeks });
}

export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody(
    { request, env },
    workRows(WorkWeek),
    "invalid work weeks",
    authorizeWriter,
  );

  if (body instanceof Response) return body;

  await env.DB.batch(
    body.rows.map(({ forecast, ...week }) =>
      upsertRow(env.DB, "work_weeks", ["week"], {
        ...week,
        forecast: forecast === undefined ? undefined : JSON.stringify(forecast),
      }),
    ),
  );

  return json({ upserted: body.rows.length });
}
