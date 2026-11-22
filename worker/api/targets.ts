import { GoalTarget, targetReadFrom, targetViews, type TargetsBody } from "@/core";
import { authorizedDay } from "@worker/lib/day";
import type { Env, PagesContext } from "@worker/lib/env";
import { readHabits, readRecords } from "@worker/lib/habit-records";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

const GoalRow = z.object({
  id: z.number(),
  title: z.string(),
  parentId: z.nullable(z.number()),
  state: z.string(),
});

// A Target row joined with its Goal; GoalTarget drops the Goal's columns and a repeating Target's null deadline.
const TargetRow = z.intersection(GoalRow, GoalTarget);

async function readTargets(env: Env) {
  const [goals, targets] = await Promise.all([
    env.DB.prepare("SELECT id, title, parent_id AS parentId, state FROM goals").bind().all(),
    env.DB.prepare(
      `SELECT g.id, g.title, g.parent_id AS parentId, g.state, t.measure, t.number,
         t.direction, t.period, t.deadline, t.start, t.reviewed_through AS reviewedThrough
       FROM goal_targets t JOIN goals g ON g.id = t.goal_id`,
    )
      .bind()
      .all(),
  ]);

  return {
    goals: z.array(GoalRow).parse(goals.results),
    targets: z
      .array(TargetRow)
      .parse(targets.results)
      .map(({ id, title, parentId, state, ...target }) => ({
        goal: { id, title, parentId, state },
        target,
      })),
  };
}

async function rows<Row>(env: Env, sql: string, from: string) {
  const { results } = await env.DB.prepare(sql).bind(from).all<Row>();

  return results;
}

/** Every Goal's Target with its progress around `?day=`, a Day: its period, the one before and the one closing that week. */
export async function onRequestGet({ request, env }: PagesContext) {
  const day = await authorizedDay(request, env);

  if (day instanceof Response) return day;

  const { goals, targets } = await readTargets(env);

  const from = targetReadFrom(
    targets.map(({ target }) => target),
    day,
  );

  const [habits, records, activity, sleep] = await Promise.all([
    readHabits(env),
    readRecords(env, from, new Date()),
    rows<{ date: string; moderateMin: number | null; vigorousMin: number | null }>(
      env,
      "SELECT date, moderate_min AS moderateMin, vigorous_min AS vigorousMin FROM activity WHERE date >= ?",
      from,
    ),
    rows<{ date: string; durationMin: number }>(
      env,
      "SELECT date, duration_min AS durationMin FROM sleep WHERE date >= ?",
      from,
    ),
  ]);

  const views = targetViews(
    { goals, targets, habits, sources: { ...records, activity, sleep } },
    day,
  );

  return json({ targets: views } satisfies TargetsBody);
}
