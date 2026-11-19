import { hitRate, PlanActionStatus } from "@/core";
import { authorizedBody, authorizeWriter } from "@worker/lib/auth";
import type { D1, PagesContext, SqlValue } from "@worker/lib/env";
import { IsoDate } from "@worker/lib/habit-records";
import { json } from "@worker/lib/json";
import { addTickets, Count, TicketKey, upsertRow, workRows } from "@worker/lib/work-store";
import * as z from "zod/mini";

/** A PR's ref, such as `web#177`. */
const PrRef = z.string().check(z.minLength(1));

/** A merge or fix on one PR, named by its ref (`web#177`); a Ticket scenario names no PR until one is opened. */
const PlanAction = z.object({
  id: z.string().check(z.minLength(1)),
  kind: z.string().check(z.minLength(1)),
  ticket: z.nullable(TicketKey),
  pr: z.nullable(PrRef),
  url: z.nullable(z.string()),
  status: PlanActionStatus,
});

type PlanAction = z.infer<typeof PlanAction>;

/** A Plan as plan-log.jsonl holds it, keyed by the Work day it plans; `if_time` ranks past the Plan's size. */
const Plan = z.object({
  day: IsoDate,
  plan_date: IsoDate,
  written_at: z.string().check(z.minLength(1)),
  planned_size: Count,
  size_rule: z.string(),
  scored_on: z.nullable(IsoDate),
  unplanned_done: z.nullable(Count),
  actions: z.array(PlanAction),
  if_time: z.array(PlanAction),
});

type Plan = z.infer<typeof Plan>;

interface StoredAction extends PlanAction {
  day: string;
  if_time: 0 | 1;
}

/** A Plan's actions are replaced as a set, so an action dropped from the source leaves D1 too. */
function planStatements(db: D1, { actions, if_time, ...plan }: Plan) {
  const actionRows = [
    ...actions.map((action) => ({ ...action, if_time: 0 })),
    ...if_time.map((action) => ({ ...action, if_time: 1 })),
  ];

  return [
    ...addTickets(
      db,
      actionRows.map(({ ticket }) => ticket),
    ),
    upsertRow(db, "plans", ["day"], plan),
    db.prepare("DELETE FROM plan_actions WHERE day = ?").bind(plan.day),
    ...actionRows.map((action, position) =>
      upsertRow(db, "plan_actions", ["day", "id"], { ...action, day: plan.day, position }),
    ),
  ];
}

/** The day's planned actions (`if_time` 0) or If time ones (1), in rank order, without their storage columns. */
const actionsOf = (stored: StoredAction[], ifTime: 0 | 1): PlanAction[] =>
  stored.flatMap(({ id, kind, ticket, pr, url, status, if_time }) =>
    if_time === ifTime ? { id, kind, ticket, pr, url, status } : [],
  );

export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorizeWriter(request, env);

  if (viewer instanceof Response) return viewer;

  const [plans, actions] = await Promise.all([
    env.DB.prepare("SELECT * FROM plans ORDER BY day DESC")
      .bind()
      .all<{ day: string; [column: string]: SqlValue }>(),
    env.DB.prepare("SELECT * FROM plan_actions ORDER BY day, position").bind().all<StoredAction>(),
  ]);

  return json({
    plans: plans.results.map((plan) => {
      const own = actions.results.filter(({ day }) => day === plan.day);
      const planned = actionsOf(own, 0);

      return {
        ...plan,
        actions: planned,
        if_time: actionsOf(own, 1),
        hit_rate: hitRate(planned.map(({ status }) => status)),
      };
    }),
  });
}

export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody(
    { request, env },
    workRows(Plan),
    "invalid plans",
    authorizeWriter,
  );

  if (body instanceof Response) return body;
  await env.DB.batch(body.rows.flatMap((plan) => planStatements(env.DB, plan)));

  return json({ upserted: body.rows.length });
}
