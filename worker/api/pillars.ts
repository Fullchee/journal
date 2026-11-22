import {
  Pillar,
  pillarBars,
  pillarReadFrom,
  type ActivityDay,
  type BriefSleepNight,
  type InteractionDay,
  type PillarBarsBody,
} from "@/core";
import { authorize } from "@worker/lib/auth";
import { logCircleInteractions } from "@worker/lib/circle-interactions";
import { Day } from "@worker/lib/day";
import type { Env, PagesContext } from "@worker/lib/env";
import { readHabits, readRecords } from "@worker/lib/habit-records";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

const GoalRow = z.object({
  id: z.number(),
  title: z.string(),
  parentId: z.nullable(z.number()),
  pillar: z.nullable(Pillar),
});

async function readGoals(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT id, title, parent_id AS parentId, pillar FROM goals WHERE state = 'active'",
  )
    .bind()
    .all();

  return z.array(GoalRow).parse(results);
}

async function rows<Row>(env: Env, sql: string, from: string, to: string) {
  const { results } = await env.DB.prepare(sql).bind(from, to).all<Row>();

  return results;
}

// Hevy workouts reach HEVY_HABIT as Duration entries on their Toronto Day.
async function readStrengthDays(env: Env, from: string, to: string) {
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT date FROM habit_durations WHERE habit = ? AND date BETWEEN ? AND ?",
  )
    .bind(env.HEVY_HABIT ?? null, from, to)
    .all<{ date: string }>();

  return results.map(({ date }) => date);
}

/** The pillar bars for the 7 Days ending `?end=`, a Day; each bar compares with the 7 Days before. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const end = Day.safeParse(new URL(request.url).searchParams.get("end"));

  if (!end.success) return json({ error: "invalid end" }, 400);
  const now = new Date();
  const from = pillarReadFrom(end.data);
  const to = end.data;

  // The Interactions read below include Circle meetups.
  await logCircleInteractions(env, now);

  const [goals, habits, records, sleep, activity, strengthDays, interactions] = await Promise.all([
    readGoals(env),
    readHabits(env),
    readRecords(env, from, now),
    rows<Pick<BriefSleepNight, "date" | "durationMin">>(
      env,
      "SELECT date, duration_min AS durationMin FROM sleep WHERE date BETWEEN ? AND ?",
      from,
      to,
    ),
    rows<ActivityDay>(
      env,
      "SELECT date, moderate_min AS moderateMin, vigorous_min AS vigorousMin FROM activity WHERE date BETWEEN ? AND ?",
      from,
      to,
    ),
    readStrengthDays(env, from, to),
    rows<InteractionDay>(
      env,
      "SELECT day, kind FROM interactions WHERE day BETWEEN ? AND ?",
      from,
      to,
    ),
  ]);

  const bars = pillarBars(
    {
      goals,
      habits,
      records,
      sleep,
      activity,
      strengthDays,
      interactions,
      now,
    },
    end.data,
  );

  return json({ bars } satisfies PillarBarsBody);
}
