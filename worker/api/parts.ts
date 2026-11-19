import { isoAt, PartRole, SELF, shiftDay, torontoDay, type PartListRow } from "@/core";
import { authorize, authorizedBody } from "@worker/lib/auth";
import { readCheckIns } from "@worker/lib/check-in-store";
import type { Env, PagesContext, SqlValue } from "@worker/lib/env";
import { json, readJson, TrimmedText } from "@worker/lib/json";
import { authorizedRowId, rowIdOf } from "@worker/lib/row-id";
import { readParts } from "@worker/lib/part-store";
import { unlessDuplicate } from "@worker/lib/unique";
import * as z from "zod/mini";

type PartContext = PagesContext<"id">;

const MAX_NAME = 100;
const MAX_ANSWER = 2000;
const MAX_DESCRIPTION = 20_000;
const RECENT_DAYS = 30;
const RECENT_CHECK_INS = 20;

const NAMING = "WHERE id IN (SELECT check_in_id FROM check_in_parts WHERE part_id = ?)";

async function listParts(env: Env): Promise<PartListRow[]> {
  const today = torontoDay(new Date());
  const since = isoAt(shiftDay(today, -RECENT_DAYS));

  const [parts, recent] = await Promise.all([
    readParts(env),
    env.DB.prepare(
      `SELECT cp.part_id AS id, count(*) AS n FROM check_in_parts cp JOIN check_ins c ON c.id = cp.check_in_id
        WHERE c.checked_in_at >= ? GROUP BY cp.part_id`,
    )
      .bind(since)
      .all<{ id: number; n: number }>(),
  ]);

  const counts = new Map(recent.results.map(({ id, n }) => [id, n]));

  return parts.map((part) => ({ ...part, recentCheckIns: counts.get(part.id) ?? 0 }));
}

export async function onRequestGet(context: PartContext) {
  const id = await authorizedRowId(context);

  if (id instanceof Response) return id;

  if (id === null) return json({ parts: await listParts(context.env) });

  const [part] = await readParts(context.env, "WHERE id = ?", id);

  if (part === undefined) return json({ error: "not found" }, 404);
  const checkIns = await readCheckIns(context.env, NAMING, id);

  return json({
    part,
    checkIns: checkIns.slice(0, RECENT_CHECK_INS),
    used: checkIns.length > 0,
  });
}

// Self is never a Part.
const Name = TrimmedText.check(
  z.refine(
    (name) => name !== "" && name.length <= MAX_NAME && name.toLowerCase() !== SELF.toLowerCase(),
  ),
);

const Answer = z
  .pipe(
    z.string(),
    z.transform((answer) => answer.trim()),
  )
  .check(z.maxLength(MAX_ANSWER));

const Description = z.string().check(z.maxLength(MAX_DESCRIPTION));

const NewPart = z.strictObject({
  name: Name,
  role: z._default(PartRole, "unknown"),
  wants: z._default(Answer, ""),
  fears: z._default(Answer, ""),
  feltIn: z._default(Answer, ""),
  description: z._default(Description, ""),
});

const DUPLICATE = "a part with that name exists";

export async function onRequestPost(context: PartContext) {
  if (rowIdOf(context) !== null) return json({ error: "not found" }, 404);
  const body = await authorizedBody(context, NewPart, "invalid part");

  if (body instanceof Response) return body;

  const created = await unlessDuplicate(
    context.env.DB.prepare(
      "INSERT INTO parts (name, role, wants, fears, felt_in, description) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
      .bind(body.name, body.role, body.wants, body.fears, body.feltIn, body.description)
      .all<{ id: number }>(),
  );

  const id = created?.results[0]?.id;

  if (id === undefined) return json({ error: DUPLICATE }, 409);
  const [part] = await readParts(context.env, "WHERE id = ?", id);

  return json({ part }, 201);
}

/** Every field a PATCH may send; one left out keeps its saved value. */
const PartPatch = z.strictObject({
  name: z.optional(Name),
  role: z.optional(PartRole),
  wants: z.optional(Answer),
  fears: z.optional(Answer),
  feltIn: z.optional(Answer),
  description: z.optional(Description),
  retired: z.optional(z.boolean()),
});

type PartPatch = z.infer<typeof PartPatch>;

function updatesOf({ name, role, wants, fears, feltIn, description, retired }: PartPatch) {
  const columns: [string, SqlValue | undefined][] = [
    ["name", name],
    ["role", role],
    ["wants", wants],
    ["fears", fears],
    ["felt_in", feltIn],
    ["description", description],
    ["retired", retired === undefined ? undefined : Number(retired)],
  ];

  return columns.filter((entry): entry is [string, SqlValue] => entry[1] !== undefined);
}

// A write to one Part: the viewer may write, and the path names a Part id.
async function writtenPartId(context: PartContext) {
  const viewer = await authorize(context.request, context.env);

  if (viewer instanceof Response) return viewer;
  const id = rowIdOf(context);

  return id ?? json({ error: "not found" }, 404);
}

/** Check-ins name a Part by id, so a rename is this one row. */
export async function onRequestPatch(context: PartContext) {
  const id = await writtenPartId(context);

  if (id instanceof Response) return id;
  const patch = await readJson(context.request, PartPatch);
  const updates = patch === null ? [] : updatesOf(patch);

  if (updates.length === 0) return json({ error: "invalid part" }, 400);
  const sets = updates.map(([column]) => `${column} = ?`).join(", ");

  const saved = await unlessDuplicate(
    context.env.DB.prepare(`UPDATE parts SET ${sets} WHERE id = ?`)
      .bind(...updates.map(([, value]) => value), id)
      .run(),
  );

  if (saved === null) return json({ error: DUPLICATE }, 409);
  const [part] = await readParts(context.env, "WHERE id = ?", id);

  return part === undefined ? json({ error: "not found" }, 404) : json({ part });
}

/** Only a Part no Check-in names can be deleted; a used one is retired instead, so its history stays. */
export async function onRequestDelete(context: PartContext) {
  const id = await writtenPartId(context);

  if (id instanceof Response) return id;

  const { meta } = await context.env.DB.prepare(
    "DELETE FROM parts WHERE id = ? AND NOT EXISTS (SELECT 1 FROM check_in_parts WHERE part_id = ?)",
  )
    .bind(id, id)
    .run();

  if (meta.changes > 0) return new Response(null, { status: 204 });
  const [part] = await readParts(context.env, "WHERE id = ?", id);

  return part === undefined
    ? json({ error: "not found" }, 404)
    : json({ error: "a Check-in names this part; retire it instead" }, 409);
}
