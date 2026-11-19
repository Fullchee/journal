import {
  draftMarkdown,
  groupByDay,
  hasEntries,
  isWeek,
  weekDays,
  type WeekDay,
  type WeeklyReviewBody,
} from "@/core";
import { authorizeWriter } from "@worker/lib/auth";
import type { Env, PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import { readActiveGoals, readSignals } from "@worker/lib/period-reads";
import { writeWeeklyProse } from "@worker/lib/weekly-review-prose";

// weekDays always returns seven days; the "" only types the empty case.
const lastOf = (days: string[]) => days.reduce((_, day) => day, "");
const firstOf = (days: string[]) => lastOf(days.toReversed());

async function readWeek(env: Env, week: string): Promise<WeekDay[]> {
  const days = weekDays(week);

  return groupByDay(week, await readSignals(env, firstOf(days), lastOf(days)));
}

/** Reads the week and drafts its retro; saving goes through the notes API, so nothing is written here. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorizeWriter(request, env);

  if (viewer instanceof Response) return viewer;
  const week = new URL(request.url).searchParams.get("week") ?? "";

  if (!isWeek(week)) return json({ error: "invalid week" }, 400);

  const sunday = lastOf(weekDays(week));

  const [days, goals, saved] = await Promise.all([
    readWeek(env, week),
    readActiveGoals(env, sunday),
    env.DB.prepare("SELECT id, body FROM reflections WHERE track = 'growth' AND period = ?")
      .bind(week)
      .all<{ id: number; body: string }>(),
  ]);

  const prose =
    days.some((day) => hasEntries(day)) || goals.length > 0
      ? await writeWeeklyProse(env.AI, { week, days, goals })
      : null;

  return json({
    week,
    days,
    goals,
    existing: saved.results[0] ?? null,
    draft: draftMarkdown({ days, goals }, prose),
    drafted: prose !== null,
  } satisfies WeeklyReviewBody);
}
