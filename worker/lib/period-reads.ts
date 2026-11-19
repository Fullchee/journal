import type { ActivityRow, BriefSleepNight, CloseGoal, WorkoutRow } from "@/core";
import { readCheckIns } from "@worker/lib/check-in-store";
import type { Env } from "@worker/lib/env";
import { readHabitsDone } from "@worker/lib/habits-done";

/**
 * Every Goal in the tree active by day `asOf`, children included, with the Habits that serve it.
 * `since` is a month or a day; a Goal picked for next year waits until its month.
 */
export async function readActiveGoals(env: Env, asOf: string): Promise<CloseGoal[]> {
  const [goals, links] = await Promise.all([
    env.DB.prepare(
      "SELECT id, title, why FROM goals WHERE state = 'active' AND (since IS NULL OR substr(since, 1, 7) <= ?) ORDER BY title",
    )
      .bind(asOf.slice(0, 7))
      .all<{ id: number; title: string; why: string }>(),
    env.DB.prepare(
      "SELECT gh.goal_id AS goalId, h.name AS name FROM goal_habits gh JOIN habits h ON h.id = gh.habit_id ORDER BY h.name",
    )
      .bind()
      .all<{ goalId: number; name: string }>(),
  ]);

  return goals.results.map(({ id, title, why }) => ({
    id,
    title,
    why,
    habits: links.results.filter((l) => l.goalId === id).map((l) => l.name),
  }));
}

// A Check-in's day is its Toronto day, so read one UTC day of slack either side; callers keep only their own days.
const SLACK_MS = 86_400_000;

const isoAt = (day: string, plusMs: number) => new Date(Date.parse(day) + plusMs).toISOString();

/** The signal rows from `from` to `to`, inclusive, read fresh from their own tables. */
export async function readSignals(env: Env, from: string, to: string) {
  const [checkIns, sleep, activity, workouts, habitsDone] = await Promise.all([
    readCheckIns(
      env,
      "WHERE checked_in_at >= ? AND checked_in_at < ?",
      isoAt(from, -SLACK_MS),
      isoAt(to, 2 * SLACK_MS),
    ),
    env.DB.prepare(
      "SELECT date, duration_min AS durationMin, sleep_score AS sleepScore FROM sleep WHERE date BETWEEN ? AND ? ORDER BY date",
    )
      .bind(from, to)
      .all<BriefSleepNight>(),
    env.DB.prepare(
      "SELECT date, steps, moderate_min AS moderateMin, vigorous_min AS vigorousMin, resting_hr AS restingHr, avg_stress AS avgStress FROM activity WHERE date BETWEEN ? AND ? ORDER BY date",
    )
      .bind(from, to)
      .all<ActivityRow>(),
    env.DB.prepare(
      `SELECT activity_id AS activityId, substr(start_local, 1, 10) AS date, start_local AS startLocal, type_key AS typeKey,
        name, duration_s AS durationS, distance_m AS distanceM, avg_hr AS avgHr, calories
      FROM workouts WHERE substr(start_local, 1, 10) BETWEEN ? AND ? ORDER BY start_local`,
    )
      .bind(from, to)
      .all<WorkoutRow>(),
    readHabitsDone(env, from, to),
  ]);

  return {
    checkIns,
    sleep: sleep.results,
    activity: activity.results,
    workouts: workouts.results,
    habitsDone,
  };
}
