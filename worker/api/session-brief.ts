import { authorizeWriter } from "@worker/lib/auth";
import { factsOf, habitsDone, type Habit } from "@/core";
import { writeProse } from "@worker/lib/session-brief-prose";
import { readCheckIns } from "@worker/lib/check-in-store";
import { readReschedules } from "@worker/lib/habit-reschedules";
import { readHabits, readRecords } from "@worker/lib/habit-records";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";

// One day of slack either side of Toronto midnight; factsOf filters by Toronto day.
const SLACK_MS = 86_400_000;

// Each record of the `habits`, oldest first.
function recordsOf<Value>(byDate: Record<string, Record<string, Value>>, habits: Habit[]) {
  const found: { habit: Habit; date: string; record: Value }[] = [];

  for (const [date, byHabit] of Object.entries(byDate))
    for (const habit of habits) {
      const record = byHabit[habit.id];

      if (record !== undefined) found.push({ habit, date, record });
    }

  return found.toSorted((a, b) => a.date.localeCompare(b.date));
}

/** Nothing here is stored: a brief is private material. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorizeWriter(request, env);

  if (viewer instanceof Response) return viewer;
  const start = new URL(request.url).searchParams.get("start") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(Date.parse(start)))
    return json({ error: "invalid start date" }, 400);
  const since = new Date(Date.parse(start) - SLACK_MS).toISOString();
  const now = new Date();

  const [checkIns, sleep, habits, records, reschedules] = await Promise.all([
    readCheckIns(env, "WHERE checked_in_at >= ?", since),
    env.DB.prepare(
      "SELECT date, duration_min AS durationMin, sleep_score AS sleepScore FROM sleep WHERE date >= ? ORDER BY date",
    )
      .bind(start)
      .all<{ date: string; durationMin: number; sleepScore: number | null }>(),
    readHabits(env),
    readRecords(env, start, now),
    readReschedules(env),
  ]);

  // Active only, as on Today: a backlogged One-off is not overdue.
  const oneOffs = habits.filter(({ target, active }) => target.type === "once" && active);

  const facts = factsOf(start, now, {
    checkIns,
    sleep: sleep.results,
    habitsDone: habitsDone(habits, records, start, "9999-12-31"),
    oneOffs: {
      habits: oneOffs.map(({ id, name, startDate }) => ({ id, name, startDate })),
      // Every answer, however old: an answer before the window still closes a One-off.
      checks: recordsOf(records.counts, oneOffs).map(({ habit, date, record }) => ({
        habit: habit.id,
        date,
        count: record,
      })),
      reschedules,
    },
    skips: recordsOf(records.skips, habits).map(({ habit, date, record }) => ({
      name: habit.name,
      date,
      ...record,
    })),
  });

  // The prose reads Check-ins; One-offs alone are listed as facts.

  return json({ facts, prose: facts.rows.length === 0 ? null : await writeProse(env.AI, facts) });
}
