import { GoalTargetDraft, torontoDay } from "@/core";
import { authorize, authorizedBody } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";

type GoalContext = PagesContext<"goalId">;

const goalIdOf = ({ params }: GoalContext) => Number(params.goalId);

const NOT_FOUND = () => json({ error: "goal not found" }, 404);

/**
 * Sets a Goal's one Target. A deadline Target counts from the Day it was set, so an edit that keeps the period
 * keeps that Day; a new Target or a new period starts today. An earlier Weekly review answer stays.
 */
export async function onRequestPut(context: GoalContext) {
  const target = await authorizedBody(context, GoalTargetDraft, "invalid target");

  if (target instanceof Response) return target;
  const deadline = target.period === "deadline" ? target.deadline : null;

  const { meta } = await context.env.DB.prepare(
    `INSERT INTO goal_targets (goal_id, measure, number, direction, period, deadline, start)
     SELECT id, ?, ?, ?, ?, ?, ? FROM goals WHERE id = ?
     ON CONFLICT (goal_id) DO UPDATE SET measure = excluded.measure, number = excluded.number,
       direction = excluded.direction, period = excluded.period, deadline = excluded.deadline,
       start = CASE WHEN goal_targets.period = excluded.period THEN goal_targets.start ELSE excluded.start END`,
  )
    .bind(
      target.measure,
      target.number,
      target.direction,
      target.period,
      deadline,
      torontoDay(new Date()),
      goalIdOf(context),
    )
    .run();

  return meta.changes === 0 ? NOT_FOUND() : new Response(null, { status: 204 });
}

/** Removes a Goal's Target; the Goal stays, directional again. */
export async function onRequestDelete(context: GoalContext) {
  const viewer = await authorize(context.request, context.env);

  if (viewer instanceof Response) return viewer;

  const { meta } = await context.env.DB.prepare("DELETE FROM goal_targets WHERE goal_id = ?")
    .bind(goalIdOf(context))
    .run();

  return meta.changes === 0 ? NOT_FOUND() : new Response(null, { status: 204 });
}
