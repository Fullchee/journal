import {
  CADENCES,
  Closeness,
  Meetup,
  type Connection,
  type ConnectionDate,
  type ConnectionMatch,
  hasYear,
  type ConnectionLink,
  type ConnectionRef,
} from "@/core";
import { authorize } from "@worker/lib/auth";
import { Day } from "@worker/lib/day";
import type { PagesContext, SqlValue } from "@worker/lib/env";
import { json, readJson, TrimmedText } from "@worker/lib/json";
import { authorizedRowId, rowIdOf } from "@worker/lib/row-id";
import { logCircleInteractions } from "@worker/lib/circle-interactions";
import { readInteractions } from "@worker/lib/interaction-store";
import { like } from "@worker/lib/like";
import { MAX_BODY_BYTES, replaceNoteBody } from "@worker/lib/note-body";
import { unlessDuplicate } from "@worker/lib/unique";
import * as z from "zod/mini";

type ConnectionContext = PagesContext<"id">;

interface MemberRow {
  connectionId: number;
  name: string;
}

// SQLite stores `yearly` as 0 or 1.
interface DateRow {
  connectionId: number;
  label: string;
  date: string;
  yearly: number;
}

const COLUMNS =
  "id, name, closeness, cadence_days AS cadenceDays, (SELECT max(i.day) FROM interaction_connections ic JOIN interactions i ON i.id = ic.interaction_id WHERE ic.connection_id = connections.id) AS lastContactedOn, follow_ups AS followUps, meetups, grow_closer AS growCloser, plan_checked_at AS planCheckedAt, how_we_met AS howWeMet, contact_id AS contactId, met_through_id AS metThroughId, (SELECT name FROM connections m WHERE m.id = connections.met_through_id) AS metThroughName";

const MAX_NAME = 200;
const MAX_LABEL = 100;
const MAX_DATES = 20;
const MAX_MEETUPS = 5;
const MAX_HOW_WE_MET = 500;
const MAX_CONTACT_ID = 200;
const MAX_CIRCLES = 20;
const MAX_LINKS = 20;

const StoredMeetups = z.array(Meetup);

// A link row belongs to both people, so it reads once from each side.
const readLinks = (env: ConnectionContext["env"], id: number | null) =>
  env.DB.prepare(
    `SELECT l.connection_id AS ownerId, c.id, c.name, l.label FROM connection_links l JOIN connections c ON c.id = l.other_id ${id === null ? "" : "WHERE l.connection_id = ?"}
    UNION ALL
    SELECT l.other_id, c.id, c.name, l.label FROM connection_links l JOIN connections c ON c.id = l.connection_id ${id === null ? "" : "WHERE l.other_id = ?"}
    ORDER BY name COLLATE NOCASE`,
  )
    .bind(...(id === null ? [] : [id, id]))
    .all<ConnectionLink & { ownerId: number }>();

const readIntroduced = (env: ConnectionContext["env"], id: number | null) =>
  env.DB.prepare(
    `SELECT met_through_id AS byId, id, name FROM connections WHERE met_through_id ${id === null ? "IS NOT NULL" : "= ?"} ORDER BY name COLLATE NOCASE`,
  )
    .bind(...(id === null ? [] : [id]))
    .all<ConnectionRef & { byId: number }>();

const refOf = ({ id, name }: ConnectionRef): ConnectionRef => ({ id, name });

async function readAll(env: ConnectionContext["env"], id: number | null) {
  // `meetups` comes back as its stored JSON text, and SQLite stores `growCloser` as 0 or 1.
  type Row = Omit<
    Connection,
    "dates" | "meetups" | "growCloser" | "circles" | "metThrough" | "introduced" | "links"
  > & {
    meetups: string;
    growCloser: number;
    metThroughId: number | null;
    metThroughName: string | null;
    body?: string;
  };

  const where = id === null ? "" : "WHERE id = ?";
  const args = id === null ? [] : [id];
  const extra = id === null ? "" : ", body";

  const [
    { results: rows },
    { results: dates },
    { results: members },
    { results: links },
    { results: introduced },
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT ${COLUMNS}${extra} FROM connections ${where} ORDER BY name COLLATE NOCASE`,
    )
      .bind(...args)
      .all<Row>(),
    env.DB.prepare(
      `SELECT connection_id AS connectionId, label, date, yearly FROM connection_dates ${id === null ? "" : "WHERE connection_id = ?"} ORDER BY substr(date, -5), id`,
    )
      .bind(...args)
      .all<DateRow>(),
    env.DB.prepare(
      `SELECT connection_id AS connectionId, name FROM connection_circles JOIN circles ON circles.id = circle_id ${id === null ? "" : "WHERE connection_id = ?"} ORDER BY name COLLATE NOCASE`,
    )
      .bind(...args)
      .all<MemberRow>(),
    readLinks(env, id),
    readIntroduced(env, id),
  ]);

  return rows.map(({ meetups, growCloser, metThroughId, metThroughName, ...row }) =>
    Object.assign(row, {
      meetups: StoredMeetups.parse(JSON.parse(meetups)),
      growCloser: growCloser === 1,
      circles: members.filter((m) => m.connectionId === row.id).map((m) => m.name),
      metThrough:
        metThroughId === null || metThroughName === null
          ? null
          : { id: metThroughId, name: metThroughName },
      introduced: introduced.filter((p) => p.byId === row.id).map((p) => refOf(p)),
      links: links
        .filter((l) => l.ownerId === row.id)
        .map(({ id: linked, name, label }) => ({ id: linked, name, label })),
      dates: dates
        .filter((d) => d.connectionId === row.id)
        .map(({ label, date, yearly }) => ({ label, date, yearly: yearly === 1 })),
    }),
  );
}

const SEARCHED = ["name", "body", "follow_ups", "how_we_met"];

// The first line of the follow-ups or notes that holds the query, as plain text, so a result shows why it matched.
const matchingLine = (texts: string[], q: string) =>
  (
    texts
      .flatMap((text) => text.split("\n"))
      .find((line) => line.toLowerCase().includes(q.toLowerCase())) ?? ""
  )
    .replace(/^\s*(?:[-*]|\d+\.)\s+/, "")
    .replaceAll("**", "")
    .trim();

// People whose name, notes, follow-ups, Interaction notes, meetup labels, date labels or Circle names hold `q`; meetups match on the label, not their JSON keys. LIKE ignores case for ASCII letters only.
async function search(env: ConnectionContext["env"], q: string): Promise<ConnectionMatch[]> {
  const likes = SEARCHED.map((c) => String.raw`${c} LIKE ? ESCAPE '\'`).join(" OR ");

  const { results } = await env.DB.prepare(
    String.raw`SELECT id, name, body, follow_ups AS followUps, how_we_met AS howWeMet,
        (SELECT coalesce(group_concat(i.note, char(10)), '') FROM interactions i JOIN interaction_connections ic ON ic.interaction_id = i.id WHERE ic.connection_id = connections.id AND i.note LIKE ? ESCAPE '\') AS interactionNotes
      FROM connections
      WHERE ${likes}
        OR EXISTS (SELECT 1 FROM json_each(meetups) WHERE json_extract(value, '$.label') LIKE ? ESCAPE '\')
        OR id IN (SELECT connection_id FROM connection_dates WHERE label LIKE ? ESCAPE '\')
        OR id IN (SELECT connection_id FROM connection_circles JOIN circles ON circles.id = circle_id WHERE name LIKE ? ESCAPE '\')
        OR interactionNotes <> ''
      ORDER BY name COLLATE NOCASE`,
  )
    .bind(...["interaction", ...SEARCHED, "meetup", "date", "circle"].map(() => like(q)))
    .all<{
      id: number;
      name: string;
      body: string;
      followUps: string;
      howWeMet: string;
      interactionNotes: string;
    }>();

  return results.map(({ id, name, body, followUps, howWeMet, interactionNotes }) => ({
    id,
    name,
    match: matchingLine([followUps, howWeMet, body, interactionNotes], q),
  }));
}

export async function onRequestGet(context: ConnectionContext) {
  const id = await authorizedRowId(context);

  if (id instanceof Response) return id;
  await logCircleInteractions(context.env, new Date());
  const q = new URL(context.request.url).searchParams.get("q")?.trim() ?? "";

  if (id === null && q !== "") return json({ found: await search(context.env, q) });

  const connections = await readAll(context.env, id);

  if (id === null) return json({ connections });

  const [found] = connections;

  // `title` and `body` let the shared Note view render and save the notes.
  return found
    ? json({
        item: {
          ...found,
          title: found.name,
          interactions: await readInteractions(context.env, found.id),
        },
      })
    : json({ error: "not found" }, 404);
}

const Name = z.string().check(
  z.maxLength(MAX_NAME),
  z.refine((name) => name.trim() !== ""),
);

const Label = z.string().check(
  z.maxLength(MAX_LABEL),
  z.refine((label) => label.trim() !== ""),
);

// A yearly date may leave out its year as --MM-DD; 2000 is a leap year, so Feb 29 passes.
const isMonthDay = (value: string) =>
  /^--\d{2}-\d{2}$/.test(value) && Day.safeParse(`2000${value.slice(1)}`).success;

const DateInput = z
  .object({
    label: Label,
    date: z.string().check(z.refine((d) => Day.safeParse(d).success || isMonthDay(d))),
    yearly: z.boolean(),
  })
  .check(z.refine(({ date, yearly }) => yearly || hasYear(date)));

const PersonId = z.int().check(z.positive());

const LinkInput = z.object({ id: PersonId, label: Label });

const Links = z.array(LinkInput).check(
  z.maxLength(MAX_LINKS),
  z.refine((links) => new Set(links.map((l) => l.id)).size === links.length),
);

const Time = z.string().check(z.regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/));

const Weekday = z.int().check(z.gte(0), z.lte(6));

const MeetupTime = z.union([z.literal(""), Time]);

// A meetup's time is optional: missing or "" saves none, so meetups from before times stay valid.
const MeetupInput = z.object({
  label: Label,
  days: z.array(Weekday),
  time: z.optional(MeetupTime),
});

type MeetupInput = z.infer<typeof MeetupInput>;

const meetupOf = ({ label, days, time = "" }: MeetupInput): Meetup => {
  const meetup = { label: label.trim(), days: [...new Set(days)].toSorted((a, b) => a - b) };

  return time === "" ? meetup : { ...meetup, time };
};

const fitsInRow = (text: string) => new TextEncoder().encode(text).length <= MAX_BODY_BYTES;

const isOneLine = (text: string) => !text.includes("\n");

const Cadence = z.nullable(z.literal(CADENCES.map((cadence) => cadence.days)));

const FollowUps = z.string().check(z.refine(fitsInRow));

const HowWeMet = z.string().check(z.maxLength(MAX_HOW_WE_MET), z.refine(isOneLine));

const Meetups = z.array(MeetupInput).check(z.maxLength(MAX_MEETUPS));

const Dates = z.array(DateInput).check(z.maxLength(MAX_DATES));

// Each names a Circle, made on first use; the list replaces the person's Circles.
const Circles = z
  .array(TrimmedText.check(z.refine((name) => name !== "" && name.length <= MAX_LABEL)))
  .check(z.maxLength(MAX_CIRCLES));

// null unlinks the phone contact.
const ContactId = z.nullable(z.string().check(z.maxLength(MAX_CONTACT_ID)));

/** Every field a create or PATCH may send; an unknown field makes the whole change invalid. */
const Payload = z.strictObject({
  name: z.optional(Name),
  closeness: z.optional(Closeness),
  circles: z.optional(Circles),
  cadenceDays: z.optional(Cadence),
  followUps: z.optional(FollowUps),
  howWeMet: z.optional(HowWeMet),
  meetups: z.optional(Meetups),
  growCloser: z.optional(z.boolean()),
  planChecked: z.optional(z.literal(true)),
  dates: z.optional(Dates),
  contactId: z.optional(ContactId),
  // null clears who introduced us.
  metThroughId: z.optional(z.nullable(PersonId)),
  // A save replaces every link the person has, on either side.
  links: z.optional(Links),
});

type Payload = z.infer<typeof Payload>;

interface Changes {
  updates: { column: string; value: SqlValue }[];
  dates: ConnectionDate[] | undefined;
  circles: string[] | undefined;
  links: { id: number; label: string }[] | undefined;
  metThroughId: number | null | undefined;
}

// Each scalar column a payload sets, with its value; a field left out keeps its saved value.
function updatesOf(payload: Payload) {
  const now = new Date().toISOString();

  const {
    name,
    closeness,
    cadenceDays,
    followUps,
    howWeMet,
    meetups,
    growCloser,
    contactId,
    metThroughId,
  } = payload;

  const columns: [string, SqlValue | undefined][] = [
    ["name", name?.trim()],
    ["closeness", closeness],
    ["cadence_days", cadenceDays],
    ["follow_ups", followUps],
    ["how_we_met", howWeMet?.trim()],
    ["meetups", meetups && JSON.stringify(meetups.map((meetup) => meetupOf(meetup)))],
    ["grow_closer", growCloser === undefined ? undefined : Number(growCloser)],
    ["plan_checked_at", payload.planChecked && now],
    ["contact_id", contactId],
    ["met_through_id", metThroughId],
  ];

  const updates: Changes["updates"] = [];

  for (const [column, value] of columns) if (value !== undefined) updates.push({ column, value });

  return updates;
}

const changesOf = (payload: Payload): Changes => ({
  updates: updatesOf(payload),
  dates: payload.dates?.map(({ label, date, yearly }) => ({ label: label.trim(), date, yearly })),
  circles: payload.circles,
  links: payload.links?.map(({ id, label }) => ({ id, label: label.trim() })),
  metThroughId: payload.metThroughId,
});

const isEmpty = ({ updates, dates, circles, links }: Changes) =>
  [dates, circles, links].every((change) => change === undefined) && updates.length === 0;

// The people a change points at, as met through or a link; `self` is null for a person not yet created.
const referencedIds = ({ metThroughId, links = [] }: Changes) => [
  ...links.map((l) => l.id),
  ...(metThroughId === null || metThroughId === undefined ? [] : [metThroughId]),
];

// A person can't be linked to or introduced by themselves or by someone who doesn't exist.
async function pointsAtNobody(
  env: ConnectionContext["env"],
  self: number | null,
  changes: Changes,
) {
  const ids = [...new Set(referencedIds(changes))];

  if (ids.length === 0) return false;

  if (self !== null && ids.includes(self)) return true;

  const { results } = await env.DB.prepare(
    `SELECT id FROM connections WHERE id IN (${ids.map(() => "?").join(", ")})`,
  )
    .bind(...ids)
    .all();

  return results.length < ids.length;
}

// A Circle's name is unique ignoring case, so a name typed in another case joins the saved Circle.
async function replaceCircles(env: ConnectionContext["env"], id: number, circles: string[]) {
  const names = circles.map(() => "(?)").join(", ");

  const statements = [
    env.DB.prepare("DELETE FROM connection_circles WHERE connection_id = ?").bind(id),
  ];

  if (circles.length > 0)
    statements.push(
      env.DB.prepare(`INSERT OR IGNORE INTO circles (name) VALUES ${names}`).bind(...circles),
      env.DB.prepare(
        `INSERT OR IGNORE INTO connection_circles (connection_id, circle_id) SELECT ?, id FROM circles WHERE name IN (${circles.map(() => "?").join(", ")})`,
      ).bind(id, ...circles),
    );

  await env.DB.batch(statements);
}

// A person has a handful of dates, so a save replaces them all.
async function replaceDates(env: ConnectionContext["env"], id: number, dates: ConnectionDate[]) {
  await env.DB.prepare("DELETE FROM connection_dates WHERE connection_id = ?").bind(id).run();

  if (dates.length > 0)
    await env.DB.prepare(
      `INSERT INTO connection_dates (connection_id, label, date, yearly) VALUES ${dates.map(() => "(?, ?, ?, ?)").join(", ")}`,
    )
      .bind(...dates.flatMap((d) => [id, d.label, d.date, d.yearly ? 1 : 0]))
      .run();
}

// One row per pair, lower id first, so a link reads the same from both people.
async function replaceLinks(
  env: ConnectionContext["env"],
  id: number,
  links: NonNullable<Changes["links"]>,
) {
  await env.DB.prepare("DELETE FROM connection_links WHERE connection_id = ? OR other_id = ?")
    .bind(id, id)
    .run();

  if (links.length > 0)
    await env.DB.prepare(
      `INSERT INTO connection_links (connection_id, other_id, label) VALUES ${links.map(() => "(?, ?, ?)").join(", ")}`,
    )
      .bind(...links.flatMap((l) => [Math.min(id, l.id), Math.max(id, l.id), l.label]))
      .run();
}

// Returns a 409 or 404 response when the row can't be saved, or null once it is.
async function writeChanges(
  env: ConnectionContext["env"],
  id: number,
  { updates, dates, circles, links }: Changes,
): Promise<Response | null> {
  const sets = updates.map((u) => `${u.column} = ?`);

  // A UNIQUE clash on the name fails the update.
  const updated = await unlessDuplicate(
    env.DB.prepare(
      `UPDATE connections SET ${[...sets, "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"].join(", ")} WHERE id = ?`,
    )
      .bind(...updates.map((u) => u.value), id)
      .run(),
  );

  if (updated === null) return json({ error: "a connection with that name exists" }, 409);

  if (updated.meta.changes === 0) return json({ error: "not found" }, 404);

  if (dates) await replaceDates(env, id, dates);

  if (links) await replaceLinks(env, id, links);

  if (circles) await replaceCircles(env, id, circles);

  return null;
}

/** A create takes every field a PATCH does, so one call (such as from the journal skill) saves a whole person. */
export async function onRequestPost(context: ConnectionContext) {
  const viewer = await authorize(context.request, context.env);

  if (viewer instanceof Response) return viewer;

  if (rowIdOf(context) !== null) return json({ error: "not found" }, 404);
  const payload = await readJson(context.request, Payload);

  if (payload?.name === undefined) return json({ error: "invalid connection" }, 400);
  const { name, ...rest } = payload;
  const changes = changesOf(rest);

  if (await pointsAtNobody(context.env, null, changes))
    return json({ error: "invalid connection" }, 400);

  const created = await unlessDuplicate(
    context.env.DB.prepare("INSERT INTO connections (name) VALUES (?) RETURNING id")
      .bind(name.trim())
      .all<{ id: number }>(),
  );

  const id = created?.results[0]?.id;

  return id === undefined
    ? json({ error: "a connection with that name exists" }, 409)
    : ((await writeChanges(context.env, id, changes)) ?? json({ id }, 201));
}

async function ownedId(context: ConnectionContext): Promise<Response | number> {
  const viewer = await authorize(context.request, context.env);

  return viewer instanceof Response
    ? viewer
    : (rowIdOf(context) ?? json({ error: "not found" }, 404));
}

export async function onRequestPatch(context: ConnectionContext) {
  const id = await ownedId(context);

  if (id instanceof Response) return id;
  const payload = await readJson(context.request, Payload);
  const changes = payload === null ? null : changesOf(payload);

  return changes === null || isEmpty(changes) || (await pointsAtNobody(context.env, id, changes))
    ? json({ error: "invalid connection" }, 400)
    : ((await writeChanges(context.env, id, changes)) ?? onRequestGet(context));
}

export async function onRequestPut(context: ConnectionContext) {
  const id = await ownedId(context);

  return id instanceof Response
    ? id
    : ((await replaceNoteBody(context.request, context.env, "connections", id)) ??
        onRequestGet(context));
}

export async function onRequestDelete(context: ConnectionContext) {
  const id = await ownedId(context);

  if (id instanceof Response) return id;

  // D1 may not enforce ON DELETE CASCADE or SET NULL, so the dates, Circle memberships, links, met-through pointers
  // and Interaction links go first, with the Interactions only this person was in.
  const { DB } = context.env;

  await DB.batch([
    DB.prepare("DELETE FROM connection_dates WHERE connection_id = ?").bind(id),
    DB.prepare("DELETE FROM connection_circles WHERE connection_id = ?").bind(id),
    DB.prepare("DELETE FROM connection_links WHERE connection_id = ? OR other_id = ?").bind(id, id),
    DB.prepare("UPDATE connections SET met_through_id = NULL WHERE met_through_id = ?").bind(id),
    DB.prepare(
      "DELETE FROM interactions WHERE id IN (SELECT interaction_id FROM interaction_connections WHERE connection_id = ?) AND id NOT IN (SELECT interaction_id FROM interaction_connections WHERE connection_id <> ?)",
    ).bind(id, id),
    DB.prepare("DELETE FROM interaction_connections WHERE connection_id = ?").bind(id),
  ]);

  const { meta } = await DB.prepare("DELETE FROM connections WHERE id = ?").bind(id).run();

  return meta.changes > 0 ? new Response(null, { status: 204 }) : json({ error: "not found" }, 404);
}
