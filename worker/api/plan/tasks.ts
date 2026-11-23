import type { PlanActionRow, Zone } from "@/core";
import { planActionTask, reminders } from "@/core";
import { authorize } from "@worker/lib/auth";
import type { D1, PagesContext } from "@worker/lib/env";
import { IsoDate } from "@worker/lib/habit-records";
import { proposeForTasks } from "@worker/lib/plan-proposals";
import { json } from "@worker/lib/json";
import { listPlanTasks } from "@worker/lib/todoist";

// The Storm to Sun Reference Habit holds each zone's "Reach for" list.
const STORM_TO_SUN = "practice-storm-to-sun";

/** The planned Work day's pending Plan actions; If time ones stay out, since they rank past the Plan's size. */
async function workPlanOf(db: D1, day: string) {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.kind, a.ticket, a.pr, a.url, t.title
       FROM plan_actions a LEFT JOIN tickets t ON t.key = a.ticket
       WHERE a.day = ? AND a.if_time = 0 AND a.status = 'pending'
       ORDER BY a.position`,
    )
    .bind(day)
    .all<PlanActionRow>();

  return results.map((action) => planActionTask(action, day));
}

/** What the plan-day triage needs first: the latest zone's reminders, the open tasks and the day's Work Plan. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const day = IsoDate.safeParse(new URL(request.url).searchParams.get("day"));

  if (!day.success) return json({ error: "invalid day" }, 400);

  const { results: latestRows } = await env.DB.prepare(
    "SELECT zone FROM check_ins ORDER BY checked_in_at DESC, id DESC LIMIT 1",
  )
    .bind()
    .all<{ zone: Zone }>();

  const [latest] = latestRows;

  const { results } = await env.DB.prepare("SELECT description FROM habits WHERE id = ?")
    .bind(STORM_TO_SUN)
    .all<{ description: string }>();

  const tasks = await listPlanTasks(env);

  return json({
    zone: latest?.zone ?? null,
    reminders: latest && results[0] ? reminders(results[0].description, latest.zone) : "",
    tasks,
    workPlan: await workPlanOf(env.DB, day.data),
    // null when the model is unreachable; the page then starts every task on keep.
    proposals: await proposeForTasks(env.AI, tasks),
  });
}
