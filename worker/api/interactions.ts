import { InteractionKind } from "@/core";
import { connectionsExist } from "@worker/lib/connections-exist";
import { Day } from "@worker/lib/day";
import type { Env, PagesContext, SqlValue } from "@worker/lib/env";
import { MAX_FOLLOW_UP, MAX_NOTE } from "@worker/lib/interaction-model";
import { json, readJson } from "@worker/lib/json";
import { authorizedRowId } from "@worker/lib/row-id";
import { ClientId } from "@worker/lib/uuid";
import * as z from "zod/mini";

type InteractionContext = PagesContext<"id">;

const MAX_PEOPLE = 50;
const MINUTES_IN_DAY = 1440;

const Note = z
  .pipe(
    z.string(),
    z.transform((note) => note.trim()),
  )
  .check(z.refine((note) => note.length <= MAX_NOTE && !note.includes("\n")));

const FollowUp = z
  .pipe(
    z.string(),
    z.transform((line) => line.trim()),
  )
  .check(z.refine((line) => line.length <= MAX_FOLLOW_UP && !line.includes("\n")));

const Minutes = z.nullable(z.int().check(z.gt(0), z.lte(MINUTES_IN_DAY)));

const ConnectionIds = z
  .array(z.int().check(z.gt(0)))
  .check(z.minLength(1), z.maxLength(MAX_PEOPLE));

const Fields = {
  day: Day,
  kind: InteractionKind,
  note: z.optional(Note),
  minutes: z.optional(Minutes),
};

/** Only time in person counts toward hours together. */
const hasMinutesOnlyInPerson = ({
  kind,
  minutes,
}: {
  kind: InteractionKind;
  minutes?: number | null | undefined;
}) => minutes === undefined || minutes === null || kind === "in-person";

/** `requestId` lets a queued offline reach-out replay without logging twice; `followUp` is a line to ask everyone in it next time. */
const NewInteraction = z
  .strictObject({
    ...Fields,
    connectionIds: ConnectionIds,
    requestId: z.optional(ClientId),
    followUp: z.optional(FollowUp),
  })
  .check(z.refine(hasMinutesOnlyInPerson));

const InteractionEdit = z.strictObject({
  day: z.optional(Day),
  kind: z.optional(InteractionKind),
  note: z.optional(Note),
  minutes: z.optional(Minutes),
  connectionIds: z.optional(ConnectionIds),
});

type InteractionEdit = z.infer<typeof InteractionEdit>;

async function applied(env: Env, requestId: string) {
  const { results } = await env.DB.prepare("SELECT 1 FROM applied_requests WHERE id = ?")
    .bind(requestId)
    .all();

  return results.length > 0;
}

// The new Interaction has the highest id, as `interactions` has no AUTOINCREMENT.
const linkNewest = (env: Env, connectionIds: number[]) =>
  env.DB.prepare(
    "INSERT INTO interaction_connections (interaction_id, connection_id) SELECT (SELECT max(id) FROM interactions), value FROM json_each(?)",
  ).bind(JSON.stringify([...new Set(connectionIds)]));

const appendFollowUp = (env: Env, connectionIds: number[], followUp: string) => {
  const line = `- ${followUp}`;

  return env.DB.prepare(
    "UPDATE connections SET follow_ups = CASE WHEN trim(follow_ups) = '' THEN ? ELSE rtrim(follow_ups, char(10)) || char(10) || ? END WHERE id IN (SELECT value FROM json_each(?))",
  ).bind(line, line, JSON.stringify([...new Set(connectionIds)]));
};

export async function onRequestPost(context: InteractionContext) {
  const id = await authorizedRowId(context);

  if (id instanceof Response) return id;

  if (id !== null) return json({ error: "not found" }, 404);
  const { env } = context;
  const body = await readJson(context.request, NewInteraction);

  if (body === null) return json({ error: "invalid interaction" }, 400);
  const { day, kind, note = "", minutes = null, connectionIds, requestId, followUp = "" } = body;

  if (requestId !== undefined && (await applied(env, requestId))) return json({ replayed: true });

  if (!(await connectionsExist(env, connectionIds))) return json({ error: "not found" }, 404);

  // One batch records the request with the Interaction, so a replay can't slip between them.
  await env.DB.batch([
    env.DB.prepare("INSERT INTO interactions (day, kind, note, minutes) VALUES (?, ?, ?, ?)").bind(
      day,
      kind,
      note,
      minutes,
    ),
    linkNewest(env, connectionIds),
    ...(followUp === "" ? [] : [appendFollowUp(env, connectionIds, followUp)]),
    ...(requestId === undefined
      ? []
      : [env.DB.prepare("INSERT INTO applied_requests (id) VALUES (?)").bind(requestId)]),
  ]);

  const { results } = await env.DB.prepare("SELECT max(id) AS id FROM interactions")
    .bind()
    .all<{ id: number }>();

  return json({ id: results[0]?.id }, 201);
}

async function saved(env: Env, id: number) {
  const { results } = await env.DB.prepare("SELECT kind, minutes FROM interactions WHERE id = ?")
    .bind(id)
    .all<{ kind: InteractionKind; minutes: number | null }>();

  return results[0];
}

async function writeEdit(env: Env, id: number, edit: InteractionEdit) {
  const { connectionIds, day, kind, note, minutes } = edit;
  const people = connectionIds && JSON.stringify([...new Set(connectionIds)]);

  const all: [string, SqlValue | undefined][] = [
    ["day", day],
    ["kind", kind],
    ["note", note],
    ["minutes", minutes],
  ];

  const columns = all.filter((column): column is [string, SqlValue] => column[1] !== undefined);

  const sets = columns.map(([column]) => `${column} = ?`);

  await env.DB.batch([
    ...(sets.length === 0
      ? []
      : [
          env.DB.prepare(`UPDATE interactions SET ${sets.join(", ")} WHERE id = ?`).bind(
            ...columns.map(([, value]) => value),
            id,
          ),
        ]),
    ...(people === undefined
      ? []
      : [
          env.DB.prepare("DELETE FROM interaction_connections WHERE interaction_id = ?").bind(id),
          env.DB.prepare(
            "INSERT INTO interaction_connections (interaction_id, connection_id) SELECT ?, value FROM json_each(?)",
          ).bind(id, people),
        ]),
  ]);
}

export async function onRequestPatch(context: InteractionContext) {
  const id = await authorizedRowId(context);

  if (id instanceof Response) return id;

  if (id === null) return json({ error: "not found" }, 404);
  const { env } = context;
  const edit = await readJson(context.request, InteractionEdit);

  if (edit === null || Object.values(edit).every((value) => value === undefined))
    return json({ error: "invalid interaction" }, 400);

  const before = await saved(env, id);

  if (before === undefined) return json({ error: "not found" }, 404);

  if (
    !hasMinutesOnlyInPerson({
      kind: edit.kind ?? before.kind,
      minutes: edit.minutes === undefined ? before.minutes : edit.minutes,
    })
  )
    return json({ error: "invalid interaction" }, 400);

  if (edit.connectionIds !== undefined && !(await connectionsExist(env, edit.connectionIds)))
    return json({ error: "not found" }, 404);

  await writeEdit(env, id, edit);

  return json({ id });
}

export async function onRequestDelete(context: InteractionContext) {
  const id = await authorizedRowId(context);

  if (id instanceof Response) return id;

  if (id === null) return json({ error: "not found" }, 404);

  // D1 may not enforce ON DELETE CASCADE, so the links go first.
  const [, deleted] = await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM interaction_connections WHERE interaction_id = ?").bind(id),
    context.env.DB.prepare("DELETE FROM interactions WHERE id = ?").bind(id),
  ]);

  return deleted !== undefined && deleted.meta.changes > 0
    ? new Response(null, { status: 204 })
    : json({ error: "not found" }, 404);
}
