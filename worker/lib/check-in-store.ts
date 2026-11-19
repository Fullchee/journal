import {
  dayOfWeek,
  minuteOfDay,
  PartRef,
  SELF,
  torontoDay,
  zoneOf,
  type CheckIn,
  type Position,
} from "@/core";
import * as z from "zod/mini";
import type { Env, SqlValue } from "./env";

/** Each Check-in's Parts by current name; `at` keeps the order they were picked in. */
const PARTS_JSON = `(
  SELECT json_group_array(json_object('id', p.id, 'name', p.name, 'inControl', cp.in_control, 'at', cp.rowid))
  FROM check_in_parts cp JOIN parts p ON p.id = cp.part_id
  WHERE cp.check_in_id = check_ins.id
)`;

/** The names of a Check-in's Parts and Self, for a text search to match. */
export const PART_NAMES = `(coalesce((
  SELECT group_concat(p.name, ', ') FROM check_in_parts cp JOIN parts p ON p.id = cp.part_id
  WHERE cp.check_in_id = check_ins.id
), '') || CASE self_in_control WHEN 1 THEN ', ${SELF}' ELSE '' END)`;

const COLUMNS = `id, checked_in_at AS checkedInAt, zone, score, note, place, doing, thought,
  self_in_control AS selfInControl, ${PARTS_JSON} AS partsJson, tense, low, tired, pleasantness,
  feeling_energy AS feelingEnergy`;

type CheckInRow = Omit<CheckIn, "inControl" | "parts"> & {
  selfInControl: number;
  partsJson: string;
};

const StoredParts = z.array(z.extend(PartRef, { inControl: z.number(), at: z.number() }));

type StoredPart = z.infer<typeof StoredParts>[number];

const refOf = ({ id, name }: StoredPart): PartRef => ({ id, name });

function inControlOf(selfInControl: number, stored: StoredPart[]): CheckIn["inControl"] {
  if (selfInControl === 1) return SELF;
  const part = stored.find((p) => p.inControl === 1);

  return part === undefined ? null : refOf(part);
}

function checkInOf({ selfInControl, partsJson, ...row }: CheckInRow): CheckIn {
  const stored = StoredParts.parse(JSON.parse(partsJson)).toSorted((a, b) => a.at - b.at);

  return {
    ...row,
    inControl: inControlOf(selfInControl, stored),
    parts: stored.filter((part) => part.inControl === 0).map((part) => refOf(part)),
  };
}

/** Newest first; `where` narrows the rows, with its `?` values in `args`. */
export async function readCheckIns(env: Env, where = "", ...args: SqlValue[]) {
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM check_ins ${where} ORDER BY checked_in_at DESC, id DESC`,
  )
    .bind(...args)
    .all<CheckInRow>();

  return results.map((row) => checkInOf(row));
}

/**
 * Callers validate score as an integer 1-8 first; the zone always follows from it.
 * A replayed offline create sends the same `clientId`, so it gets the saved Check-in back with `created: false`.
 */
export async function insertCheckIn(
  env: Env,
  score: number,
  note: string,
  clientId: string | null,
) {
  const { results } = await env.DB.prepare(
    `INSERT INTO check_ins (checked_in_at, zone, score, note, client_id) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (client_id) DO NOTHING RETURNING id`,
  )
    .bind(new Date().toISOString(), zoneOf(score), score, note, clientId)
    .all<{ id: number }>();

  const [inserted] = results;

  // RETURNING can't run the Parts subquery, so the new row is read back.
  if (inserted) {
    const [checkIn] = await readCheckIns(env, "WHERE id = ?", inserted.id);

    if (checkIn === undefined) throw new Error("an inserted Check-in was not found");

    return { checkIn, created: true };
  }

  // Only a `client_id` conflict skips the INSERT, so that row exists.
  const [saved] = await readCheckIns(env, "WHERE client_id = ?", clientId);

  if (saved === undefined) throw new Error("a client_id conflict found no saved Check-in");

  return { checkIn: saved, created: false };
}

/** A past Check-in this close was most likely saved at the same place. */
export const NEAR_METRES = 150;

const EARTH_RADIUS_METRES = 6_371_000;
const RADIANS = Math.PI / 180;

/** Haversine distance along the Earth's surface. */
export function metresBetween(a: Position, b: Position) {
  const dLat = (b.latitude - a.latitude) * RADIANS;
  const dLng = (b.longitude - a.longitude) * RADIANS;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * RADIANS) * Math.cos(b.latitude * RADIANS) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(h));
}

// A routine repeats at about the same time of day, on the same kind of day.
const ROUTINE_HOURS = 1;

// One past Check-in at this time is a coincidence; two make a routine.
const ROUTINE_MIN_CHECK_INS = 2;

const HOURS_PER_DAY = 24;

interface Moment {
  weekend: boolean;
  hour: number;
}

const SATURDAY = 6;

// A routine follows the Toronto weekday and hour of an instant.
function momentOf(iso: string): Moment {
  const weekday = dayOfWeek(torontoDay(iso));

  return { weekend: weekday === 0 || weekday === SATURDAY, hour: minuteOfDay(iso) / 60 };
}

// Times of day wrap at midnight, so 23:30 and 00:15 are 45 minutes apart.
function sameRoutine(a: Moment, b: Moment) {
  const apart = Math.abs(a.hour - b.hour);

  return a.weekend === b.weekend && Math.min(apart, HOURS_PER_DAY - apart) <= ROUTINE_HOURS;
}

// Routines change, so only this recent a Check-in shows one.
const ROUTINE_DAYS = 90;
const DAY_MS = 24 * 60 * 60_000;

interface PastCheckIn {
  place: string;
  checkedInAt: string;
  latitude: number | null;
  longitude: number | null;
}

export interface PlaceQuery {
  at: string;
  position: Position | null;
}

// Recent Check-ins show a routine and Check-ins in the latitude band can be close by;
// each half of the UNION uses its own index, and `id` keeps two identical rows apart.
async function candidatesFor(env: Env, since: string, position: Position | null) {
  const select =
    "SELECT id, place, checked_in_at AS checkedInAt, latitude, longitude FROM check_ins";

  const recent = `${select} WHERE place != '' AND checked_in_at >= ?`;

  if (!position) {
    const { results } = await env.DB.prepare(recent).bind(since).all<PastCheckIn>();

    return results;
  }

  // A degree of latitude is the same length everywhere, so this band holds every candidate.
  const band = NEAR_METRES / (EARTH_RADIUS_METRES * RADIANS);

  const { results } = await env.DB.prepare(
    `${recent} UNION ${select} WHERE place != '' AND latitude BETWEEN ? AND ?`,
  )
    .bind(since, position.latitude - band, position.latitude + band)
    .all<PastCheckIn>();

  return results;
}

/**
 * The place to suggest for a Check-in at `at`, or null.
 * Close by (NEAR_METRES), the place logged most at this time of day wins and ties go to the nearest.
 * With nothing close by, the place logged at this time of day at least ROUTINE_MIN_CHECK_INS times wins.
 */
export async function guessPlace(env: Env, { at, position }: PlaceQuery) {
  const since = new Date(Date.parse(at) - ROUTINE_DAYS * DAY_MS).toISOString();
  const candidates = await candidatesFor(env, since, position);
  const now = momentOf(at);

  const routine = candidates.filter(
    (row) => row.checkedInAt >= since && sameRoutine(momentOf(row.checkedInAt), now),
  );

  const routineCount = (place: string) => routine.filter((r) => r.place === place).length;

  const nearby = position
    ? candidates
        .filter(
          (row): row is PastCheckIn & Position => row.latitude !== null && row.longitude !== null,
        )
        .map((row) => ({ place: row.place, metres: metresBetween(position, row) }))
        .filter(({ metres }) => metres <= NEAR_METRES)
    : [];

  // The place logged most at this time of day wins; ties go to the nearest.
  const nearest = nearby.toSorted((a, b) => {
    const byRoutine = routineCount(b.place) - routineCount(a.place);

    return byRoutine === 0 ? a.metres - b.metres : byRoutine;
  })[0];

  if (nearest) return nearest.place;

  const habitual = routine
    .map((row) => ({ place: row.place, count: routineCount(row.place) }))
    .toSorted((a, b) => b.count - a.count)[0];

  return habitual && habitual.count >= ROUTINE_MIN_CHECK_INS ? habitual.place : null;
}

/** The guess for Check-in `id` itself, from its own time and stored position; null when it doesn't exist. */
export async function placeQueryFor(env: Env, id: number) {
  const { results } = await env.DB.prepare(
    "SELECT checked_in_at AS checkedInAt, latitude, longitude FROM check_ins WHERE id = ?",
  )
    .bind(id)
    .all<Omit<PastCheckIn, "place">>();

  const [row] = results;

  if (!row) return null;
  const { checkedInAt: at, latitude, longitude } = row;

  // The PATCH saves both coordinates or neither.
  const position = latitude === null || longitude === null ? null : { latitude, longitude };

  return { at, position } satisfies PlaceQuery;
}
