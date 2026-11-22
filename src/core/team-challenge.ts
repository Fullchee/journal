import * as z from "zod/mini";

import { shiftDay, daysBetween, torontoDay } from "./calendar";
import { csvRows } from "./csv-import";

/** The team's Pull up and Cardio Challenge sheet has one tab per kind. */
export const TEAM_CHALLENGE_KINDS = ["cardio", "pullups"] as const;

export type TeamChallengeKind = (typeof TEAM_CHALLENGE_KINDS)[number];

/** The challenge's first Day; a request without `since` starts here. */
export const CHALLENGE_START = "2026-10-25";

/** The owner's name in the sheet's Athlete column; teammates log on the same tabs. */
export const SHEET_OWNER = "Fullchee Zhang";

/** Google Sheets counts dates as days since this one. */
const SHEETS_EPOCH = "1899-12-30";

const CARDIO_TOLERANCE_KM = 0.1;
const LOAD_TOLERANCE_KG = 0.5;
const LB_TO_KG = 0.4536;

// The sheet scores Stair climber per active minute; every other activity per km.
const MINUTE_ACTIVITIES = new Set(["Stair climber"]);

// The owner counts a ride only past this distance, so short commutes stay out (km).
const MIN_KM = new Map([["Outdoor cycling", 6]]);

const NO_SHEET_ACTIVITY = "no matching sheet activity";

/** A cell as Sheets' `get_values` returns it: formatted text, or an unformatted number. */
export type SheetCell = string | number;

export type SheetRow = SheetCell[];

/** One workout as a source recorded it; `activity` is null when the sheet has no match. */
export interface CardioSession {
  date: string;
  exercise: string;
  activity: string | null;
  km: number | null;
  minutes: number | null;
}

export interface CardioRow {
  date: string;
  activity: string;
  quantity: number;
}

export interface PullUpRow {
  date: string;
  variation: string;
  reps: number;
  assistance_kg: number;
  added_kg: number;
}

/** A record the sheet won't score; `exercise` is the source's own name for it. */
export interface SkippedWorkout {
  date: string;
  exercise: string;
  quantity: number | null;
  reason: string;
}

export interface SheetRows<Row> {
  rows: Row[];
  skipped: SkippedWorkout[];
}

const roundTo = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

const byDate = <Row extends { date: string }>(a: Row, b: Row) => a.date.localeCompare(b.date);

/** Skipped workouts, oldest first. */
export const skippedByDate = (skipped: SkippedWorkout[]) => skipped.toSorted(byDate);

function quantityOf(activity: string, session: CardioSession) {
  if (MINUTE_ACTIVITIES.has(activity))
    return session.minutes === null ? null : roundTo(session.minutes, 1);

  return session.km === null ? null : roundTo(session.km, 2);
}

const noQuantity = (activity: string) =>
  MINUTE_ACTIVITIES.has(activity) ? "no active minutes" : "no distance";

/** Rows the sheet scores, oldest first, and the sessions it won't, each with its reason; a session with no km is never a 0 row. */
export function cardioRows(sessions: CardioSession[]): SheetRows<CardioRow> {
  const rows: CardioRow[] = [];
  const skipped: SkippedWorkout[] = [];

  for (const session of sessions.toSorted(byDate)) {
    const { activity, date, exercise } = session;

    if (activity === null) {
      skipped.push({ date, exercise, quantity: null, reason: NO_SHEET_ACTIVITY });
      continue;
    }

    const quantity = quantityOf(activity, session);
    const minKm = MIN_KM.get(activity) ?? 0;

    if (quantity === null || quantity <= 0)
      skipped.push({ date, exercise, quantity, reason: noQuantity(activity) });
    else if (quantity <= minKm)
      skipped.push({ date, exercise, quantity, reason: `under ${minKm} km minimum` });
    else rows.push({ date, activity, quantity });
  }

  return { rows, skipped };
}

// Health Connect's ExerciseType codes for the sessions the sheet scores.
const EXERCISE_TYPE = {
  BIKING: 8,
  BIKING_STATIONARY: 9,
  ROWING_MACHINE: 54,
  RUNNING: 56,
  RUNNING_TREADMILL: 57,
  STAIR_CLIMBING: 68,
  STAIR_CLIMBING_MACHINE: 69,
  SWIMMING_OPEN_WATER: 73,
  SWIMMING_POOL: 74,
  WALKING: 79,
} as const;

// Health Connect has no GPS flag, so a plain biking session counts as a ride outdoors.
const FITBIT_ACTIVITY = new Map<number, string>([
  [EXERCISE_TYPE.BIKING, "Outdoor cycling"],
  [EXERCISE_TYPE.BIKING_STATIONARY, "Indoor cycling"],
  [EXERCISE_TYPE.RUNNING, "Running"],
  [EXERCISE_TYPE.RUNNING_TREADMILL, "Running"],
  [EXERCISE_TYPE.STAIR_CLIMBING, "Stair climber"],
  [EXERCISE_TYPE.STAIR_CLIMBING_MACHINE, "Stair climber"],
  [EXERCISE_TYPE.SWIMMING_OPEN_WATER, "Swimming"],
  [EXERCISE_TYPE.SWIMMING_POOL, "Swimming"],
  [EXERCISE_TYPE.WALKING, "Walking"],
]);

// Hevy logs the rowing machine and the assault bike with the real distance, so the watch's copy would double-count.
// Health Connect has no assault-bike type, so its title names it.
const ASSAULT_BIKE = /\b(?:assault|air) bike\b/i;

/** A `fitbit_sessions` row: `distance_m` is null when Fitbit wrote no Distance during it. */
export interface FitbitSessionRow {
  exercise_type: number;
  title: string | null;
  start_date: string;
  duration_s: number;
  distance_m: number | null;
}

const isHevyLogged = (row: FitbitSessionRow) =>
  row.exercise_type === EXERCISE_TYPE.ROWING_MACHINE || ASSAULT_BIKE.test(row.title ?? "");

/** Fitbit sessions as cardio sessions, and the ones Hevy logs instead. */
export function fitbitCardio(rows: FitbitSessionRow[]) {
  const sessions: CardioSession[] = [];
  const skipped: SkippedWorkout[] = [];

  for (const row of rows) {
    const date = row.start_date;
    const exercise = row.title ?? `exercise type ${row.exercise_type}`;

    if (isHevyLogged(row)) {
      skipped.push({ date, exercise, quantity: null, reason: "logged from Hevy" });
      continue;
    }

    sessions.push({
      date,
      exercise,
      activity: FITBIT_ACTIVITY.get(row.exercise_type) ?? null,
      km: row.distance_m === null ? null : row.distance_m / 1000,
      minutes: row.duration_s / 60,
    });
  }

  return { sessions, skipped };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Hevy writes start_time in local time, in the phone's locale: "5 Nov 2026, 17:48" or "Nov 5, 2026, 5:48 PM".
const HEVY_START_DAY_FIRST =
  /^(?<day>\d{1,2}) (?<month>[A-Z][a-z]{2}) (?<year>\d{4}), \d{2}:\d{2}$/;

const HEVY_START_MONTH_FIRST =
  /^(?<month>[A-Z][a-z]{2}) (?<day>\d{1,2}), (?<year>\d{4}), \d{1,2}:\d{2} [AP]M$/;

/** The Day of a Hevy start_time, or null when it isn't one. */
function hevyDay(startTime: string) {
  const match = HEVY_START_DAY_FIRST.exec(startTime) ?? HEVY_START_MONTH_FIRST.exec(startTime);
  const { day = "", month = "", year = "" } = match?.groups ?? {};

  const monthIndex = MONTHS.indexOf(month);

  return monthIndex === -1
    ? null
    : `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

const HevyStart = z.pipe(
  z.string(),
  z.transform((text, ctx) => {
    const day = hevyDay(text);

    if (day === null) ctx.issues.push({ code: "custom", message: "not a Hevy start", input: text });

    return { text, day: day ?? z.NEVER };
  }),
);

/** One set from Hevy's workout CSV export (Profile → Settings → Export & Import Data), with weights in lb. */
const HevyCsvSet = z.object({
  exercise_title: z.string(),
  start_time: HevyStart,
  exercise_notes: z.string(),
  reps: z.string(),
  weight_lbs: z.string(),
  distance_km: z.string(),
});

/** One Hevy set, from the CSV export or the synced `hevy_sets`; `workout` tells one workout from another. */
export interface HevySet {
  workout: string;
  day: string;
  exercise_title: string;
  exercise_notes: string;
  reps: number;
  weight_kg: number;
  distance_km: number | null;
}

const csvNumber = (cell: string) => (cell === "" ? null : Number(cell));

/** The sets in Hevy's workout CSV export, or null when the text isn't one. */
export function hevySets(csv: string): HevySet[] | null {
  const [header = [], ...rows] = csvRows(csv);

  const records = rows.map((cells) =>
    Object.fromEntries(header.map((name, column) => [name, cells[column]])),
  );

  return (
    z
      .array(HevyCsvSet)
      .safeParse(records)
      .data?.map((set) => ({
        workout: set.start_time.text,
        day: set.start_time.day,
        exercise_title: set.exercise_title,
        exercise_notes: set.exercise_notes,
        reps: Number(set.reps),
        weight_kg: Number(set.weight_lbs) * LB_TO_KG,
        distance_km: csvNumber(set.distance_km),
      })) ?? null
  );
}

/** A `hevy_sets` row joined to its workout's `start_time`, an ISO instant. */
export interface HevySetRow {
  workout_id: string;
  start_time: string;
  exercise_title: string;
  exercise_notes: string | null;
  reps: number | null;
  weight_kg: number | null;
  distance_m: number | null;
}

/** Synced sets on their workout's Toronto Day. */
export const storedHevySets = (rows: HevySetRow[]): HevySet[] =>
  rows.map((row) => ({
    workout: row.workout_id,
    day: torontoDay(row.start_time),
    exercise_title: row.exercise_title,
    exercise_notes: row.exercise_notes ?? "",
    reps: row.reps ?? 0,
    weight_kg: row.weight_kg ?? 0,
    distance_km: row.distance_m === null ? null : row.distance_m / 1000,
  }));

export interface ChallengeRange {
  since: string;
  until: string;
}

const inRange = (day: string, { since, until }: ChallengeRange) => since <= day && day <= until;

const BANDED = "Banded pull-up";
const MACHINE_ASSISTED = "Machine-assisted pull-up";
const WEIGHTED = "Weighted pull-up";
const BAND_TIERS = ["heavy", "medium", "light"];

// Hevy exercise_title → the sheet's Exercise variation. The owner counts chin-ups as pull-ups.
const SHEET_VARIATION = new Map([
  ["Pull Up", "Bodyweight pull-up"],
  ["Chin Up", "Bodyweight pull-up"],
  ["Pull Up (Weighted)", WEIGHTED],
  ["Chin Up (Weighted)", WEIGHTED],
  ["Pull Up (Assisted)", MACHINE_ASSISTED],
  ["Chin Up (Assisted)", MACHINE_ASSISTED],
  ["Pull Up (Band)", BANDED],
]);

const PULL_UP_TITLE = /\b(?:pull|chin)[ -]?up\b/i;

/** Hevy has no band field, so the owner writes the tier in the exercise notes. */
const bandTier = (notes: string) => BAND_TIERS.find((tier) => notes.toLowerCase().includes(tier));

// A banded variation names its tier from the notes.
function variationOf(title: string, notes: string): { variation: string } | { reason: string } {
  const variation = SHEET_VARIATION.get(title);

  if (variation === undefined) return { reason: "no matching sheet variation" };

  if (variation !== BANDED) return { variation };
  const tier = bandTier(notes);

  return tier === undefined
    ? { reason: "band tier missing from notes" }
    : { variation: `${BANDED} \u{2014} ${tier} assist` };
}

function comparePullUps(a: PullUpRow, b: PullUpRow) {
  const byName = `${a.date} ${a.variation}`.localeCompare(`${b.date} ${b.variation}`);

  if (byName !== 0) return byName;

  return a.assistance_kg === b.assistance_kg
    ? a.added_kg - b.added_kg
    : a.assistance_kg - b.assistance_kg;
}

/** Reps summed per Day, variation and load, oldest first; warm-up sets count like any other. */
export function hevyPullUps(sets: HevySet[], range: ChallengeRange): SheetRows<PullUpRow> {
  const rows = new Map<string, PullUpRow>();
  const skipped: SkippedWorkout[] = [];

  for (const set of sets) {
    const title = set.exercise_title;
    const date = set.day;

    if (!PULL_UP_TITLE.test(title) || !inRange(date, range)) continue;
    const { reps } = set;
    const match = variationOf(title, set.exercise_notes);

    if ("reason" in match) {
      skipped.push({ date, exercise: title, quantity: reps, reason: match.reason });
      continue;
    }

    const { variation } = match;
    const kg = roundTo(set.weight_kg, 2);
    const assistanceKg = variation === MACHINE_ASSISTED ? kg : 0;
    const addedKg = variation === WEIGHTED ? kg : 0;
    const key = JSON.stringify([date, variation, assistanceKg, addedKg]);
    const row = rows.get(key);

    if (row === undefined)
      rows.set(key, { date, variation, reps, assistance_kg: assistanceKg, added_kg: addedKg });
    else row.reps += reps;
  }

  return { rows: [...rows.values()].toSorted(comparePullUps), skipped };
}

// Hevy exercise_title → the sheet's Activity. Air Bike is the sheet's nearest bike.
const HEVY_ACTIVITY = new Map([
  ["Rowing Machine", "Indoor rowing"],
  ["Air Bike", "Indoor cycling"],
]);

// Hevy's Air Bike set has no distance field, so the owner writes it in the notes ("3k").
const NOTES_KM = /\b(\d+(?:\.\d+)?) ?km?\b/i;

function setKm({ distance_km: distanceKm, exercise_notes: notes }: HevySet) {
  if (distanceKm !== null) return distanceKm;
  const [, km] = NOTES_KM.exec(notes) ?? [];

  return km === undefined ? null : Number(km);
}

/** One session per workout and activity, km summed over its sets; a set with no distance stays its own session, so `cardioRows` skips it. */
export function hevyCardio(sets: HevySet[], range: ChallengeRange): CardioSession[] {
  const workouts = new Map<string, CardioSession & { km: number }>();
  const noDistance: CardioSession[] = [];

  for (const set of sets) {
    const exercise = set.exercise_title;
    const activity = HEVY_ACTIVITY.get(exercise);
    const date = set.day;

    if (activity === undefined || !inRange(date, range)) continue;
    const km = setKm(set);

    if (km === null) {
      noDistance.push({ date, exercise, activity, km: null, minutes: null });
      continue;
    }

    const key = JSON.stringify([set.workout, exercise]);
    const workout = workouts.get(key);

    if (workout === undefined) workouts.set(key, { date, exercise, activity, km, minutes: null });
    else workout.km += km;
  }

  return [...noDistance, ...workouts.values()];
}

/** Google Sheets stores dates as days since 1899-12-30; a date sent as text never parses. */
export const dateSerial = (day: string) => daysBetween(SHEETS_EPOCH, day);

/** `get_values` returns the formatted YYYY-MM-DD or, unformatted, the serial number; anything else stays as text. */
export function sheetDay(cell: SheetCell) {
  const text = String(cell);

  if (text.includes("-")) return text;
  const serial = Math.trunc(Number(cell));

  return Number.isFinite(serial) ? shiftDay(SHEETS_EPOCH, serial) : text;
}

/** A blank or missing input cell counts as 0, as the sheet's formulas read it. */
function numberAt(row: SheetRow, column: number) {
  const cell = row[column] ?? "";

  return cell === "" ? 0 : Number(cell);
}

/** How one tab matches a new row: the field its column C holds, and whether a same-day row with that C is the same workout. */
export interface SheetRule<Row> {
  label: (row: Row) => string;
  isLogged: (row: Row, sheetRow: SheetRow) => boolean;
}

export const CARDIO_RULE: SheetRule<CardioRow> = {
  label: (row) => row.activity,
  // Rounding first keeps float noise (1.1 - 1.0 = 0.10000000000000009) inside the tolerance.
  isLogged: (row, sheetRow) =>
    roundTo(Math.abs(numberAt(sheetRow, 3) - row.quantity), 6) <= CARDIO_TOLERANCE_KM,
};

export const PULL_UP_RULE: SheetRule<PullUpRow> = {
  label: (row) => row.variation,
  // Columns F and G hold assistance and added kg; rows at other loads score differently.
  isLogged: (row, sheetRow) =>
    Math.trunc(numberAt(sheetRow, 3)) === row.reps &&
    Math.abs(numberAt(sheetRow, 5) - row.assistance_kg) <= LOAD_TOLERANCE_KG &&
    Math.abs(numberAt(sheetRow, 6) - row.added_kg) <= LOAD_TOLERANCE_KG,
};

export interface SheetDedupe<Row> {
  to_log: (Row & { date_serial: number })[];
  already_logged: Row[];
  ask: { new: Row; sheet_row: SheetRow }[];
}

interface OwnerRow {
  day: string;
  label: SheetCell;
  row: SheetRow;
}

// Only the owner's rows count; a header or a short row has no Athlete to match.
function ownerRows(sheet: SheetRow[]) {
  const owned: OwnerRow[] = [];

  for (const row of sheet) {
    const [day, athlete, label] = row;

    if (athlete === SHEET_OWNER && day !== undefined && label !== undefined && row.length >= 4)
      owned.push({ day: sheetDay(day), label, row });
  }

  return owned;
}

/** Splits new rows into `to_log` (with `date_serial`), `already_logged` and `ask` pairs against the sheet's rows. */
export function dedupeSheet<Row extends { date: string }>(
  rule: SheetRule<Row>,
  sheet: SheetRow[],
  rows: Row[],
): SheetDedupe<Row> {
  const owned = ownerRows(sheet);
  // One sheet row vouches for one new row, and exact matches claim theirs before any ask does.
  const used = new Set<OwnerRow>();

  const sameDay = (row: Row) =>
    owned.filter(
      (sheetRow) =>
        !used.has(sheetRow) && sheetRow.day === row.date && sheetRow.label === rule.label(row),
    );

  const unmatched: Row[] = [];
  const result: SheetDedupe<Row> = { to_log: [], already_logged: [], ask: [] };

  for (const row of rows) {
    const logged = sameDay(row).find((sheetRow) => rule.isLogged(row, sheetRow.row));

    if (logged === undefined) {
      unmatched.push(row);
    } else {
      used.add(logged);
      result.already_logged.push(row);
    }
  }

  for (const row of unmatched) {
    const candidates = sameDay(row);

    for (const candidate of candidates) {
      used.add(candidate);
      result.ask.push({ new: row, sheet_row: candidate.row });
    }

    if (candidates.length === 0) result.to_log.push({ ...row, date_serial: dateSerial(row.date) });
  }

  return result;
}
