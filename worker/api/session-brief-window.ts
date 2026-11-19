import { authorizeWriter } from "@worker/lib/auth";
import { coachName, torontoDay, windowFrom } from "@/core";
import { searchEvents } from "@worker/lib/calendar";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";

const LOOKBACK_DAYS = 60;

/** Where the brief's date range starts: the last past session on the calendar, else 7 days ago. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorizeWriter(request, env);

  if (viewer instanceof Response) return viewer;
  const now = new Date();

  const { results } = await env.DB.prepare("SELECT body FROM health_plan WHERE id = 1")
    .bind()
    .all<{ body: string }>();

  const coach = coachName(results[0]?.body ?? "");

  const range = {
    start: new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString(),
    end: now.toISOString(),
  };

  const search = coach === null || coach === "" ? null : await searchEvents(env, coach, range);

  return json({ ...windowFrom(search, now), today: torontoDay(now), coach });
}
