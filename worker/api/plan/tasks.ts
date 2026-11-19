import type { Zone } from "@/core";
import { reminders } from "@/core";
import { authorize } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { proposeForTasks } from "@worker/lib/plan-proposals";
import { json } from "@worker/lib/json";
import { listPlanTasks } from "@worker/lib/todoist";

// The Storm to Sun Reference Habit holds each zone's "Reach for" list.
const STORM_TO_SUN = "practice-storm-to-sun";

/** What the plan-day triage needs first: the latest zone's reminders and the open tasks. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;

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
    // null when the model is unreachable; the page then starts every task on keep.
    proposals: await proposeForTasks(env.AI, tasks),
  });
}
