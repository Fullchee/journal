import { RESCHEDULE_CAUSES, torontoDay, type Reschedule, type Reschedules } from "@/core";
import * as z from "zod/mini";
import type { Env } from "./env";
import { HabitId } from "./habit-records";
import { isRealDate } from "./log-plan";

const MAX_NOTE = 2000;

const RealDate = z.string().check(z.refine(isRealDate));

export const Note = z.string().check(z.maxLength(MAX_NOTE));

export const RescheduleChange = z.object({
  type: z.literal("reschedule"),
  habit: HabitId,
  to: RealDate,
  cause: z.enum(RESCHEDULE_CAUSES),
  note: z.optional(Note),
});

export type RescheduleChange = z.infer<typeof RescheduleChange>;

/** Moves a One-off to `to` and keeps the date it left; false for a repeating Habit, a past date or no move. */
export async function applyReschedule(env: Env, { habit, to, cause, note = "" }: RescheduleChange) {
  if (to < torontoDay(new Date())) return false;

  const { results } = await env.DB.prepare(
    "SELECT start_date FROM habits WHERE id = ? AND target_type = 'once'",
  )
    .bind(habit)
    .all<{ start_date: string }>();

  const [saved] = results;

  if (!saved || saved.start_date === to) return false;

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO habit_reschedules (habit, from_date, to_date, cause, note) VALUES (?, ?, ?, ?, ?)",
    ).bind(habit, saved.start_date, to, cause, note),
    env.DB.prepare("UPDATE habits SET start_date = ? WHERE id = ?").bind(to, habit),
  ]);

  return true;
}

export const UndoReschedule = z.object({
  type: z.literal("undo-reschedule"),
  habit: HabitId,
  to: RealDate,
});

/** Takes back the One-off's latest Reschedule, only while it still sits on that Reschedule's `to` date. */
export async function undoReschedule(env: Env, { habit, to }: z.infer<typeof UndoReschedule>) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.from_date, r.to_date, h.start_date FROM habit_reschedules r JOIN habits h ON h.id = r.habit
     WHERE r.habit = ? ORDER BY r.id DESC LIMIT 1`,
  )
    .bind(habit)
    .all<{ id: number; from_date: string; to_date: string; start_date: string }>();

  const [latest] = results;

  if (latest?.to_date !== to || latest.start_date !== to) return false;

  await env.DB.batch([
    env.DB.prepare("DELETE FROM habit_reschedules WHERE id = ?").bind(latest.id),
    env.DB.prepare("UPDATE habits SET start_date = ? WHERE id = ?").bind(latest.from_date, habit),
  ]);

  return true;
}

/** Every Reschedule, not only those since a date: a One-off's whole history stays visible. */
export async function readReschedules(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT habit, from_date, to_date, cause, note, created_at FROM habit_reschedules ORDER BY habit, id",
  )
    .bind()
    .all<{
      habit: string;
      from_date: string;
      to_date: string;
      cause: Reschedule["cause"];
      note: string;
      created_at: string;
    }>();

  const reschedules: Reschedules = {};

  for (const row of results) {
    const reschedule = {
      from: row.from_date,
      to: row.to_date,
      cause: row.cause,
      note: row.note,
      createdAt: row.created_at,
    };

    reschedules[row.habit] = [...(reschedules[row.habit] ?? []), reschedule];
  }

  return reschedules;
}
