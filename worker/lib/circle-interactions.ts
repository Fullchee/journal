import { torontoDay, type StreakRecords } from "@/core";
import type { Env } from "@worker/lib/env";
import { readRecords } from "@worker/lib/habit-records";

// Circles log from the first day any of them followed a Habit, and an old Interaction may predate its Circle's current Habit.
const ALL_HISTORY = "0000-01-01";

interface CountedDay {
  habit: string;
  date: string;
  minutes: number | null;
}

/** Each counted day of the `followed` Habits: a done check, or a duration Habit's entries summed. A Skip's count is negative, so it counts for nothing. */
function countedDays({ counts, durations }: StreakRecords, followed: Set<string>) {
  const days = new Map<string, CountedDay>();

  const count = (day: CountedDay) => {
    if (followed.has(day.habit)) days.set(`${day.habit} ${day.date}`, day);
  };

  for (const [date, byHabit] of Object.entries(counts))
    for (const [habit, done] of Object.entries(byHabit))
      if (done > 0) count({ habit, date, minutes: null });

  for (const [date, byHabit] of Object.entries(durations))
    for (const [habit, entries] of Object.entries(byHabit))
      count({ habit, date, minutes: entries.reduce((sum, { minutes }) => sum + minutes, 0) });

  return [...days.values()];
}

// Each counted day up to ?1, with the newest Circle following its Habit by then.
const COUNTED = `
  SELECT e.value ->> 'habit' AS habit, e.value ->> 'date' AS date, e.value ->> 'minutes' AS minutes,
    (SELECT c.id FROM circles c WHERE c.habit_id = e.value ->> 'habit' AND c.follows_from <= e.value ->> 'date' ORDER BY c.id DESC LIMIT 1) AS circle_id
  FROM json_each(?2) e WHERE e.value ->> 'date' <= ?1`;

// A Circle Interaction whose Habit day no longer counts, such as a check turned into a Skip.
const STALE = `
  SELECT i.id FROM interactions i JOIN circles c ON c.id = i.circle_id
  WHERE c.habit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM json_each(?1) e WHERE e.value ->> 'habit' = c.habit_id AND e.value ->> 'date' = i.day
  )`;

/**
 * Logs one in-person Interaction per counted day of a Habit a Circle follows, with the day's minutes, for the members
 * the Circle has when it logs; I never enter who came. A day already logged for any of the Habit's Circles stays
 * with that Circle, so last year's team keeps its history. Runs before every read of Interactions.
 */
export async function logCircleInteractions(env: Env, now: Date) {
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT habit_id AS habit FROM circles WHERE habit_id IS NOT NULL",
  )
    .bind()
    .all<{ habit: string }>();

  if (results.length === 0) return;
  const followed = new Set(results.map(({ habit }) => habit));
  const counted = JSON.stringify(countedDays(await readRecords(env, ALL_HISTORY, now), followed));

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM interaction_connections WHERE interaction_id IN (${STALE})`).bind(
      counted,
    ),
    env.DB.prepare(`DELETE FROM interactions WHERE id IN (${STALE})`).bind(counted),
    env.DB.prepare(
      `INSERT INTO interactions (day, kind, minutes, note, circle_id)
      SELECT date, 'in-person', minutes, '', circle_id FROM (${COUNTED}) counted
      WHERE circle_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM interactions i JOIN circles c ON c.id = i.circle_id WHERE c.habit_id = counted.habit AND i.day = counted.date
      )`,
    ).bind(torontoDay(now), counted),
    // SQLite reuses a deleted Interaction's id, so a just-logged Circle Interaction is one with no members yet.
    env.DB.prepare(
      `INSERT OR IGNORE INTO interaction_connections (interaction_id, connection_id)
      SELECT i.id, m.connection_id FROM interactions i JOIN connection_circles m ON m.circle_id = i.circle_id
      WHERE NOT EXISTS (SELECT 1 FROM interaction_connections ic WHERE ic.interaction_id = i.id)`,
    ).bind(),
  ]);
}
