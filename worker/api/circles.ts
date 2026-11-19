import { Circle, torontoDay } from "@/core";
import { authorize } from "@worker/lib/auth";
import { connectionsExist } from "@worker/lib/connections-exist";
import type { Env, PagesContext } from "@worker/lib/env";
import { HabitId } from "@worker/lib/habit-records";
import { json, readJson, TrimmedText } from "@worker/lib/json";
import { rowIdOf } from "@worker/lib/row-id";
import { unlessDuplicate } from "@worker/lib/unique";
import * as z from "zod/mini";

type CircleContext = PagesContext<"id">;

const MAX_NAME = 100;
const MAX_MEMBERS = 200;

const Name = TrimmedText.check(z.refine((name) => name !== "" && name.length <= MAX_NAME));

const MemberIds = z.array(z.int().check(z.gt(0))).check(z.maxLength(MAX_MEMBERS));

/** null stops the Circle following any Habit; its Interactions stay. */
const Follows = z.nullable(HabitId);

const NewCircle = z.strictObject({
  name: Name,
  habitId: z.optional(Follows),
  memberIds: z.optional(MemberIds),
});

const CircleEdit = z.strictObject({ habitId: Follows });

// The members come back as JSON text, A to Z.
const Row = z.extend(z.omit(Circle, { members: true }), { members: z.string() });

const Members = Circle.shape.members;

async function readCircles(env: Env): Promise<Circle[]> {
  const { results } = await env.DB.prepare(
    `SELECT ci.id, ci.name, ci.habit_id AS habitId, ci.follows_from AS followsFrom,
      (SELECT json_group_array(json_object('id', p.id, 'name', p.name)) FROM (
        SELECT c.id, c.name FROM connection_circles m JOIN connections c ON c.id = m.connection_id
        WHERE m.circle_id = ci.id ORDER BY c.name COLLATE NOCASE
      ) p) AS members
    FROM circles ci ORDER BY ci.name COLLATE NOCASE`,
  )
    .bind()
    .all();

  return results.map((row) => {
    const { members, ...rest } = Row.parse(row);

    return { ...rest, members: Members.parse(JSON.parse(members)) };
  });
}

// Only a recurring Habit has due days for a Circle to follow.
async function isRecurringHabit(env: Env, habitId: string | null | undefined) {
  if (habitId === null || habitId === undefined) return true;

  const { results } = await env.DB.prepare(
    "SELECT 1 FROM habits WHERE id = ? AND target_type IN ('daily', 'weekly', 'days', 'monthly', 'interval')",
  )
    .bind(habitId)
    .all();

  return results.length > 0;
}

export async function onRequestGet(context: CircleContext) {
  const viewer = await authorize(context.request, context.env);

  if (viewer instanceof Response) return viewer;

  return rowIdOf(context) === null
    ? json({ circles: await readCircles(context.env) })
    : json({ error: "not found" }, 404);
}

/** A new Circle, such as this year's team made from last year's members; it follows its Habit from today. */
export async function onRequestPost(context: CircleContext) {
  const viewer = await authorize(context.request, context.env);

  if (viewer instanceof Response) return viewer;

  if (rowIdOf(context) !== null) return json({ error: "not found" }, 404);
  const { env } = context;
  const body = await readJson(context.request, NewCircle);

  if (body === null) return json({ error: "invalid circle" }, 400);
  const { name, habitId = null, memberIds = [] } = body;

  if (!(await isRecurringHabit(env, habitId)) || !(await connectionsExist(env, memberIds)))
    return json({ error: "invalid circle" }, 400);

  const followsFrom = habitId === null ? null : torontoDay(new Date());

  const created = await unlessDuplicate(
    env.DB.prepare(
      "INSERT INTO circles (name, habit_id, follows_from) VALUES (?, ?, ?) RETURNING id",
    )
      .bind(name, habitId, followsFrom)
      .all<{ id: number }>(),
  );

  const id = created?.results[0]?.id;

  if (id === undefined) return json({ error: "a circle with that name exists" }, 409);

  if (memberIds.length > 0)
    await env.DB.prepare(
      "INSERT OR IGNORE INTO connection_circles (connection_id, circle_id) SELECT value, ? FROM json_each(?)",
    )
      .bind(id, JSON.stringify(memberIds))
      .run();

  return json({ id }, 201);
}

/** Links a Circle to a Habit, which it follows from today, or unlinks it. */
export async function onRequestPatch(context: CircleContext) {
  const viewer = await authorize(context.request, context.env);

  if (viewer instanceof Response) return viewer;
  const id = rowIdOf(context);

  if (id === null || id === undefined) return json({ error: "not found" }, 404);
  const { env } = context;
  const edit = await readJson(context.request, CircleEdit);

  if (edit === null || !(await isRecurringHabit(env, edit.habitId)))
    return json({ error: "invalid circle" }, 400);

  // Relinking to the same Habit keeps the day it began following.
  const { meta } = await env.DB.prepare(
    "UPDATE circles SET follows_from = CASE WHEN ?1 IS NULL THEN NULL WHEN habit_id IS ?1 THEN follows_from ELSE ?2 END, habit_id = ?1 WHERE id = ?3",
  )
    .bind(edit.habitId, torontoDay(new Date()), id)
    .run();

  return meta.changes > 0 ? json({ id }) : json({ error: "not found" }, 404);
}
