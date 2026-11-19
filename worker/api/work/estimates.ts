import { authorizedBody, authorizeWriter } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { IsoDate } from "@worker/lib/habit-records";
import { json } from "@worker/lib/json";
import { listDays } from "@worker/lib/signal-days";
import { addTickets, keptUnlessSent, TicketKey, upsertRow, workRows } from "@worker/lib/work-store";
import * as z from "zod/mini";

/** The historical storm-to-sun reading, 1 to 6; new estimates save a Check-in instead. */
const StormToSun = z.int().check(z.gte(1), z.lte(6));

/** One estimate-log.csv row; `check_in_id` names the Check-in /log-work saved, and keeps its stored value when omitted. */
const Estimate = z.object({
  task_id: z.string().check(z.minLength(1)),
  completion_date: IsoDate,
  task_name: z.string(),
  jira_key: z.nullable(TicketKey),
  estimate: z.string(),
  actual: z.string(),
  blocker_type: z.string(),
  storm_to_sun: z.nullable(StormToSun),
  check_in_id: keptUnlessSent(z.int()),
  notes: z.string(),
});

async function missingCheckIn(env: PagesContext["env"], ids: number[]) {
  if (ids.length === 0) return false;

  const { results } = await env.DB.prepare(
    `SELECT id FROM check_ins WHERE id IN (${ids.map(() => "?").join(", ")})`,
  )
    .bind(...ids)
    .all<{ id: number }>();

  return results.length < new Set(ids).size;
}

export async function onRequestGet({ request, env }: PagesContext) {
  return listDays(
    request,
    env,
    "estimates",
    "SELECT * FROM estimates ORDER BY completion_date DESC, task_id",
  );
}

export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody(
    { request, env },
    workRows(Estimate),
    "invalid estimates",
    authorizeWriter,
  );

  if (body instanceof Response) return body;
  const checkIns = body.rows.flatMap(({ check_in_id }) => check_in_id ?? []);

  if (await missingCheckIn(env, checkIns)) return json({ error: "unknown check-in" }, 400);

  await env.DB.batch([
    ...addTickets(
      env.DB,
      body.rows.map(({ jira_key }) => jira_key),
    ),
    ...body.rows.map((row) => upsertRow(env.DB, "estimates", ["task_id"], row)),
  ]);

  return json({ upserted: body.rows.length });
}
