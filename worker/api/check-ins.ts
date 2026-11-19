import { AMOUNTS, CheckIn, fixHolds, SELF, zoneOf, type PartRef } from "@/core";
import { authorize, authorizedBody } from "@worker/lib/auth";
import {
  guessPlace,
  insertCheckIn,
  placeQueryFor,
  readCheckIns,
  type PlaceQuery,
} from "@worker/lib/check-in-store";
import type { Env, PagesContext, SqlValue } from "@worker/lib/env";
import { json, readJson } from "@worker/lib/json";
import { ClientId } from "@worker/lib/uuid";
import * as z from "zod/mini";

const MAX_SHORT = 200;

// Tense (`tense`), Low and Tired are 0 None, 1 Some, 2 A lot (matches the check_ins CHECK).
const Amount = z.nullable(z.int().check(z.gte(0), z.lte(AMOUNTS.length - 1)));

const Score = z.int().check(z.gte(1), z.lte(8));

// Matches the check_ins CHECKs on latitude and longitude.
const Latitude = z.number().check(z.gte(-90), z.lte(90));
const Longitude = z.number().check(z.gte(-180), z.lte(180));

const Instant = z.string().check(
  z.maxLength(MAX_SHORT),
  z.refine((at) => !Number.isNaN(Date.parse(at))),
);

// A missing query value is "", which Number would read as 0.
const coordinate = (raw: string | null) => (raw === null || raw === "" ? NaN : Number(raw));

// `at` places the Check-in in its Toronto Day; a position is optional but comes whole.
function placeQuery(at: string, query: URLSearchParams): PlaceQuery | null {
  if (Number.isNaN(Date.parse(at))) return null;

  if (!query.has("latitude") && !query.has("longitude")) return { at, position: null };

  const latitude = Latitude.safeParse(coordinate(query.get("latitude"))).data;
  const longitude = Longitude.safeParse(coordinate(query.get("longitude"))).data;

  return latitude === undefined || longitude === undefined
    ? null
    : { at, position: { latitude, longitude } };
}

export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;

  const query = new URL(request.url).searchParams;

  if (query.has("guessFor")) {
    const id = Number(query.get("guessFor"));

    if (!Number.isSafeInteger(id)) {
      return json({ error: "invalid place query" }, 400);
    }

    const guess = await placeQueryFor(env, id);

    return guess
      ? json({ place: await guessPlace(env, guess) })
      : json({ error: "not found" }, 404);
  }

  const at = query.get("at");

  if (at !== null) {
    const guess = placeQuery(at, query);

    return guess
      ? json({ place: await guessPlace(env, guess) })
      : json({ error: "invalid place query" }, 400);
  }

  return json({ checkIns: await readCheckIns(env) });
}

const NewCheckIn = z.object({
  score: Score,
  note: z._default(z.string(), ""),
  clientId: z._default(z.nullable(ClientId), null),
});

export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, NewCheckIn, "invalid check-in");

  if (body instanceof Response) return body;

  const { checkIn, created } = await insertCheckIn(env, body.score, body.note, body.clientId);

  return json(checkIn, created ? 201 : 200);
}

const OptionalId = z.optional(z.int());

const Place = z.string().check(z.maxLength(MAX_SHORT));

const OptionalClientId = z.optional(ClientId);

/**
 * A PATCH changes only the fields it sends. An offline client may not know the server id yet,
 * so it names the Check-in by the `clientId` it created it with; an `id` of the wrong type falls back to it.
 */
const Details = z.object({
  id: z.catch(OptionalId, undefined),
  clientId: z.catch(OptionalClientId, undefined),
  note: z.optional(z.string()),
  place: z.optional(Place),
  doing: z.optional(z.string()),
  thought: z.optional(z.string()),
  inControl: z.optional(CheckIn.shape.inControl),
  parts: z.optional(CheckIn.shape.parts),
  tense: z.optional(Amount),
  low: z.optional(Amount),
  tired: z.optional(Amount),
  pleasantness: z.optional(CheckIn.shape.pleasantness),
  feelingEnergy: z.optional(CheckIn.shape.feelingEnergy),
  score: z.optional(Score),
  latitude: z.optional(Latitude),
  longitude: z.optional(Longitude),
  // When the GPS fix was taken; a position queued offline replays hours later.
  fixedAt: z.optional(Instant),
  checkedInAt: z.optional(Instant),
});

type Details = z.infer<typeof Details>;

// Each field a PATCH may change, and its column.
const COLUMNS = {
  note: "note",
  place: "place",
  doing: "doing",
  thought: "thought",
  tense: "tense",
  low: "low",
  tired: "tired",
  pleasantness: "pleasantness",
  feelingEnergy: "feeling_energy",
  score: "score",
  latitude: "latitude",
  longitude: "longitude",
  checkedInAt: "checked_in_at",
} as const;

const FIELDS = [
  "note",
  "place",
  "doing",
  "thought",
  "tense",
  "low",
  "tired",
  "pleasantness",
  "feelingEnergy",
  "score",
  "latitude",
  "longitude",
  "checkedInAt",
] as const satisfies (keyof typeof COLUMNS)[];

// Null when neither names one; undefined when no Check-in has that `clientId`.
async function idOf(env: PagesContext["env"], { id, clientId }: Details) {
  if (id !== undefined) return id;

  if (clientId === undefined) return null;

  const { results } = await env.DB.prepare("SELECT id FROM check_ins WHERE client_id = ?")
    .bind(clientId)
    .all<{ id: number }>();

  return results[0]?.id;
}

const valueOf = (details: Details, field: (typeof FIELDS)[number]): SqlValue => {
  const value = details[field] ?? null;

  return field === "checkedInAt" && value !== null ? new Date(value).toISOString() : value;
};

// Only a Part's id is read; a Part deleted since the Check-in was queued is skipped.
const linkPart = (env: Env, checkIn: number, part: PartRef, inControl: 0 | 1) =>
  env.DB.prepare(
    `INSERT INTO check_in_parts (check_in_id, part_id, in_control) SELECT ?, id, ? FROM parts WHERE id = ?
      ON CONFLICT (check_in_id, part_id) DO UPDATE SET in_control = max(in_control, excluded.in_control)`,
  ).bind(checkIn, inControl, part.id);

/** The statements that save who is in control and the Parts present; a field left out keeps its saved answer. */
function partStatements(env: Env, checkIn: number, { inControl, parts }: Details) {
  const statements = [];

  if (inControl !== undefined) {
    statements.push(
      env.DB.prepare("UPDATE check_ins SET self_in_control = ? WHERE id = ?").bind(
        Number(inControl === SELF),
        checkIn,
      ),
      env.DB.prepare("DELETE FROM check_in_parts WHERE check_in_id = ? AND in_control = 1").bind(
        checkIn,
      ),
    );

    if (inControl !== null && inControl !== SELF)
      statements.push(linkPart(env, checkIn, inControl, 1));
  }

  if (parts !== undefined) {
    statements.push(
      env.DB.prepare("DELETE FROM check_in_parts WHERE check_in_id = ? AND in_control = 0").bind(
        checkIn,
      ),
    );

    for (const part of parts) statements.push(linkPart(env, checkIn, part, 0));
  }

  return statements;
}

// A fix only fits a Check-in near when it was taken; one sent without `fixedAt` was taken just now.
const isStaleFix = ({ latitude, fixedAt }: Details, savedAt: string) =>
  latitude !== undefined && !fixHolds(fixedAt ?? new Date().toISOString(), savedAt);

/** Changes only the fields sent; the rest keep their saved values. */
export async function onRequestPatch({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;

  const details = await readJson(request, Details);
  const id = details === null ? null : await idOf(env, details);

  // A position is one reading, so half of it is never saved.
  if (
    details === null ||
    id === null ||
    (details.latitude === undefined) !== (details.longitude === undefined)
  )
    return json({ error: "invalid details" }, 400);

  if (id === undefined) return json({ error: "not found" }, 404);

  const sent = FIELDS.filter((field) => details[field] !== undefined);
  const columns: string[] = sent.map((f) => COLUMNS[f]);
  const [before] = await readCheckIns(env, "WHERE id = ?", id);

  if (!before) return json({ error: "not found" }, 404);

  const values = sent.map((field) => valueOf(details, field));
  const { checkedInAt, latitude, score } = details;

  if (isStaleFix(details, checkedInAt ?? before.checkedInAt)) {
    return json({ error: "position is not from this Check-in's time" }, 400);
  }

  // Coordinates say where the owner was at checked_in_at, so moving the time far drops them.
  if (
    checkedInAt !== undefined &&
    latitude === undefined &&
    !fixHolds(checkedInAt, before.checkedInAt)
  ) {
    columns.push("latitude", "longitude");
    values.push(null, null);
  }

  if (score !== undefined) {
    columns.push("zone");
    values.push(zoneOf(score));
  }

  const sets = columns.map((c) => `${c} = ?`).join(", ");

  const statements = [
    ...(columns.length > 0
      ? [env.DB.prepare(`UPDATE check_ins SET ${sets} WHERE id = ?`).bind(...values, id)]
      : []),
    ...partStatements(env, id, details),
  ];

  if (statements.length > 0) await env.DB.batch(statements);

  const [row] = await readCheckIns(env, "WHERE id = ?", id);

  return row ? json(row) : json({ error: "not found" }, 404);
}

const Removal = z.object({ id: z.int() });

export async function onRequestDelete({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, Removal, "invalid id");

  if (body instanceof Response) return body;

  // D1 may not enforce ON DELETE CASCADE, so the Part links go first.
  const [, removed] = await env.DB.batch([
    env.DB.prepare("DELETE FROM check_in_parts WHERE check_in_id = ?").bind(body.id),
    env.DB.prepare("DELETE FROM check_ins WHERE id = ?").bind(body.id),
  ]);

  return removed && removed.meta.changes > 0
    ? new Response(null, { status: 204 })
    : json({ error: "not found" }, 404);
}
