import { NoteTitle } from "@/core";
import { authorize } from "@worker/lib/auth";
import type { D1, PagesContext, SqlValue } from "@worker/lib/env";
import { json, readJson } from "@worker/lib/json";
import { MAX_BODY_BYTES, replaceNoteBody } from "@worker/lib/note-body";
import { unlessDuplicate } from "@worker/lib/unique";
import * as z from "zod/mini";

type NoteContext = PagesContext<"type" | "id">;

// `title` is the column shown in lists, `detail` the one beside it, `listed` more list columns and `extra`
// more detail columns. A `byTrack` list shows one track, `growth` unless `?track=` names another.
// SQL names come from here, never from the request.
const TYPES = {
  goals: {
    table: "goals",
    title: "title",
    detail: "state",
    order: "title",
    listed: ", parent_id AS parentId",
    extra: ", why",
    byTrack: false,
  },
  reflections: {
    table: "reflections",
    title: "period",
    detail: "period_kind",
    order: "period DESC",
    listed: "",
    extra: ", track",
    byTrack: true,
  },
  "health-records": {
    table: "health_records",
    title: "title",
    detail: "updated_at",
    order: "title",
    listed: "",
    extra: "",
    byTrack: false,
  },
  career: {
    table: "career_notes",
    title: "title",
    detail: "updated_at",
    order: "title",
    listed: "",
    extra: "",
    byTrack: false,
  },
};

const isNoteType = (name: string): name is keyof typeof TYPES => Object.hasOwn(TYPES, name);

// Matches /api/notes/<type> (list) or /api/notes/<type>/<id> (detail); anything else is not found.
function route({ params }: NoteContext) {
  const [name] = [params.type ?? []].flat();
  const segments = [params.id ?? []].flat();
  const [first] = segments;

  if (
    name === undefined ||
    !isNoteType(name) ||
    segments.length > 1 ||
    (first !== undefined && !/^\d+$/.test(first))
  )
    return null;

  return { name, type: TYPES[name], id: first === undefined ? null : Number(first) };
}

// Work retros share `reflections` with the Growth track's; review views read only `growth`.
const Track = z._default(z.enum(["growth", "work"]), "growth");

interface NoteRow {
  id: number;
  title: string;
  detail: string;
  updatedAt: string;
  body?: string;
  why?: string;
  parentId?: number | null;
}

export async function onRequestGet(context: NoteContext) {
  const viewer = await authorize(context.request, context.env);

  if (viewer instanceof Response) return viewer;
  const found = route(context);

  if (!found) return json({ error: "not found" }, 404);
  const { type, id } = found;
  const columns = `id, ${type.title} AS title, ${type.detail} AS detail, updated_at AS updatedAt${type.listed}`;

  if (id === null) {
    const track = Track.safeParse(
      new URL(context.request.url).searchParams.get("track") ?? undefined,
    );

    if (!track.success) return json({ error: "invalid track" }, 400);

    const { results } = await context.env.DB.prepare(
      `SELECT ${columns} FROM ${type.table}${type.byTrack ? " WHERE track = ?" : ""} ORDER BY ${type.order}`,
    )
      .bind(...(type.byTrack ? [track.data] : []))
      .all<NoteRow>();

    return json({ items: results });
  }

  const { results } = await context.env.DB.prepare(
    `SELECT ${columns}, body${type.extra} FROM ${type.table} WHERE id = ?`,
  )
    .bind(id)
    .all<NoteRow>();

  const [item] = results;

  return item ? json({ item }) : json({ error: "not found" }, 404);
}

const MAX_WHY = 5000;

const Body = z._default(
  z.string().check(z.refine((body) => new TextEncoder().encode(body).length <= MAX_BODY_BYTES)),
  "",
);

const Why = z.string().check(z.maxLength(MAX_WHY));

const ParentId = z.nullable(z.int());

// A Goal is only ever title, felt why, state and the Goal it serves; the body has its own PUT.
const GoalFields = z.object({
  title: NoteTitle,
  why: z._default(Why, ""),
  state: z._default(z.enum(["active", "achieved", "retired"]), "active"),
  parentId: z._default(ParentId, null),
});

type Goal = z.infer<typeof GoalFields>;

// Clients built before Goal parents send no parentId on PATCH; leaving it out keeps the stored parent.
const GoalPatch = z.extend(GoalFields, { parentId: z.optional(ParentId) });

/**
 * A parent must exist and must not be the Goal or one of its descendants, which would make a cycle.
 * Walks up from the parent; UNION stops at a cycle already in the table. A new Goal has no id.
 */
async function parentFits(db: D1, goalId: number | null, parentId: number | null) {
  if (parentId === null) return true;

  const { results } = await db
    .prepare(
      `WITH RECURSIVE ancestors (id) AS (
        SELECT id FROM goals WHERE id = ?
        UNION
        SELECT goals.parent_id FROM goals JOIN ancestors ON goals.id = ancestors.id
        WHERE goals.parent_id IS NOT NULL
      )
      SELECT COUNT(*) AS found, COALESCE(SUM(id = ?), 0) AS loops FROM ancestors`,
    )
    .bind(parentId, goalId)
    .all<{ found: number; loops: number }>();

  const [walk] = results;

  return walk !== undefined && walk.found > 0 && walk.loops === 0;
}

const ReflectionFields = z.object({
  track: Track,
  periodKind: z.enum(["week", "month", "quarter", "year"]),
  period: NoteTitle,
  body: Body,
});

// Health records and Career notes are only a unique title and a body.
const TitledFields = z.object({ title: NoteTitle, body: Body });

interface Insert {
  sql: string;
  args: SqlValue[];
}

const insertGoal = ({ title, why, state, parentId }: Goal): Insert => ({
  sql: "INSERT INTO goals (title, why, state, parent_id) VALUES (?, ?, ?, ?) RETURNING id",
  args: [title, why, state, parentId],
});

const insertReflection = ({
  track,
  periodKind,
  period,
  body,
}: z.infer<typeof ReflectionFields>) => ({
  sql: "INSERT INTO reflections (track, period_kind, period, body) VALUES (?, ?, ?, ?) RETURNING id",
  args: [track, periodKind, period, body],
});

async function readTitledInsert(request: Request, table: string): Promise<Insert | null> {
  const note = await readJson(request, TitledFields);

  return (
    note && {
      sql: `INSERT INTO ${table} (title, body) VALUES (?, ?) RETURNING id`,
      args: [note.title, note.body],
    }
  );
}

// How POST builds each type's row; null means the payload is invalid.
async function readInsert(
  request: Request,
  name: keyof typeof TYPES,
  db: D1,
): Promise<Insert | null> {
  switch (name) {
    case "goals": {
      const goal = await readJson(request, GoalFields);

      return goal && (await parentFits(db, null, goal.parentId)) ? insertGoal(goal) : null;
    }

    case "reflections": {
      const reflection = await readJson(request, ReflectionFields);

      return reflection && insertReflection(reflection);
    }

    case "health-records":
    case "career": {
      return readTitledInsert(request, TYPES[name].table);
    }
  }
}

// Titles and periods (within a track) are unique, so a clash is the one write error the owner can fix.
const DUPLICATE = () => json({ error: "a note with that title exists" }, 409);

export async function onRequestPost(context: NoteContext) {
  const viewer = await authorize(context.request, context.env);

  if (viewer instanceof Response) return viewer;
  const found = route(context);

  if (found?.id !== null) return json({ error: "not found" }, 404);

  const insert = await readInsert(context.request, found.name, context.env.DB);

  if (insert === null) return json({ error: "invalid note" }, 400);

  const created = await unlessDuplicate(
    context.env.DB.prepare(insert.sql)
      .bind(...insert.args)
      .all<{ id: number }>(),
  );

  return created ? json({ id: created.results[0]?.id }, 201) : DUPLICATE();
}

export async function onRequestPatch(context: NoteContext) {
  const viewer = await authorize(context.request, context.env);

  if (viewer instanceof Response) return viewer;
  const found = route(context);

  if (found?.name !== "goals" || found.id === null) return json({ error: "not found" }, 404);

  const goal = await readJson(context.request, GoalPatch);

  if (goal === null) return json({ error: "invalid goal" }, 400);

  const { parentId } = goal;
  const keepsParent = parentId === undefined;

  if (parentId !== undefined && !(await parentFits(context.env.DB, found.id, parentId)))
    return json({ error: "invalid parent" }, 400);

  const updated = await unlessDuplicate(
    context.env.DB.prepare(
      "UPDATE goals SET title = ?, why = ?, state = ?, parent_id = CASE WHEN ? THEN parent_id ELSE ? END, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
      .bind(goal.title, goal.why, goal.state, keepsParent ? 1 : 0, parentId ?? null, found.id)
      .run(),
  );

  if (updated === null) return DUPLICATE();

  if (updated.meta.changes === 0) return json({ error: "not found" }, 404);

  return onRequestGet(context);
}

async function oneNote(context: NoteContext) {
  const viewer = await authorize(context.request, context.env);

  if (viewer instanceof Response) return viewer;
  const found = route(context);

  return found?.id === null || found?.id === undefined
    ? json({ error: "not found" }, 404)
    : { ...found, id: found.id };
}

export async function onRequestPut(context: NoteContext) {
  const found = await oneNote(context);

  return found instanceof Response
    ? found
    : ((await replaceNoteBody(context.request, context.env, found.type.table, found.id)) ??
        onRequestGet(context));
}

// Statements that remove a note and the rows that point at it; D1 may not enforce ON DELETE CASCADE or SET NULL.
const DELETES: Record<keyof typeof TYPES, string[]> = {
  goals: [
    "DELETE FROM goal_habits WHERE goal_id = ?",
    "DELETE FROM goal_targets WHERE goal_id = ?",
    "UPDATE goals SET parent_id = NULL WHERE parent_id = ?",
    "DELETE FROM goals WHERE id = ?",
  ],
  reflections: ["DELETE FROM reflections WHERE id = ?"],
  "health-records": ["DELETE FROM health_records WHERE id = ?"],
  career: ["DELETE FROM career_notes WHERE id = ?"],
};

export async function onRequestDelete(context: NoteContext) {
  const found = await oneNote(context);

  if (found instanceof Response) return found;

  const runs = await Promise.all(
    DELETES[found.name].map((sql) => context.env.DB.prepare(sql).bind(found.id).run()),
  );

  // The last statement deletes the note itself, so its changes say whether it existed.
  const removed = runs.reduce((_, run) => run.meta.changes, 0) > 0;

  return removed ? new Response(null, { status: 204 }) : json({ error: "not found" }, 404);
}
