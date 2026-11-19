import { authorizedBody, authorizeWriter } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { IsoDate } from "@worker/lib/habit-records";
import { json } from "@worker/lib/json";
import { listDays } from "@worker/lib/signal-days";
import {
  keptUnlessSent,
  NonNegative,
  upsertRow,
  WorkCount,
  workRows,
} from "@worker/lib/work-store";
import * as z from "zod/mini";

/** How the day felt, 1 to 3; plan-log.jsonl only, as Check-ins replace it. */
const Felt = z.int().check(z.gte(1), z.lte(3));

const Included = z.union([z.literal(0), z.literal(1)]);

/** A Work day; every field but `day` is optional and keeps its stored value when omitted. */
const WorkDay = z.object({
  day: IsoDate,
  anchor: z.optional(z.string()),
  meeting_hours: keptUnlessSent(NonNegative),
  felt: keptUnlessSent(Felt),
  prs_merged: WorkCount,
  prs_opened: WorkCount,
  reviews: WorkCount,
  tickets_resolved: WorkCount,
  points_resolved: keptUnlessSent(NonNegative),
  epics_closed: WorkCount,
  day_off: z.optional(z.string()),
  vacation_week: z.optional(z.string()),
  included: keptUnlessSent(Included),
});

/** Lists the POST shape; a day's entries come back from /api/work/weekly-notes. */
export async function onRequestGet({ request, env }: PagesContext) {
  const columns = Object.keys(WorkDay.shape).join(", ");

  return listDays(request, env, "days", `SELECT ${columns} FROM work_days ORDER BY day DESC`);
}

export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody(
    { request, env },
    workRows(WorkDay),
    "invalid work days",
    authorizeWriter,
  );

  if (body instanceof Response) return body;
  await env.DB.batch(body.rows.map((row) => upsertRow(env.DB, "work_days", ["day"], row)));

  return json({ upserted: body.rows.length });
}
