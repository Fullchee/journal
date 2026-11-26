import {
  type Counts,
  type DayNotes,
  type Durations,
  type Draft,
  type Habit,
  MISSED,
  optOutLogs,
  Season,
  TreeSpan,
  type OptOutLog,
  type RestPeriod,
  type Skip,
  type SkipCause,
  type Skips,
  type StreakRecords,
} from "@/core";
import * as z from "zod/mini";
import type { D1, D1Statement, Env, SqlValue } from "./env";

export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_COUNT = 99;

export const IsoDate = z.string().check(z.regex(DATE));

// Each `habits` column besides `id`, and how a Habit fills it; the SELECT, INSERT and UPDATE lists all follow this order.
const COLUMNS = {
  name: (h: Draft) => h.name,
  description: (h: Draft) => h.description,
  usual_when: (h: Draft) => h.usualWhen,
  places: (h: Draft) => JSON.stringify(h.places),
  kind: (h: Draft) => h.kind,
  trees: (h: Draft) => JSON.stringify(h.trees),
  tree_ask_from: (h: Draft) => h.treeAskFrom,
  priority: (h: Draft) => h.priority,
  active: (h: Draft) => (h.active ? 1 : 0),
  auto_logged: (h: Draft) => (h.autoLogged ? 1 : 0),
  opt_out_from: (h: Draft) => h.optOutFrom,
  usual_minutes: (h: Draft) => h.usualMinutes,
  start_date: (h: Draft) => h.startDate,
  cue_type: (h: Draft) => h.cueType,
  stacked_after: (h: Draft) => h.stackedAfter,
  target_type: (h: Draft) => h.target.type,
  target_count: (h: Draft) => h.target.count,
  target_days: (h: Draft) => JSON.stringify(h.target.days),
  record: (h: Draft) => h.record,
  target_minutes: (h: Draft) => h.targetMinutes,
  alarm_time: (h: Draft) => h.alarm?.time ?? null,
  // The column is NOT NULL and means nothing while `alarm_time` is NULL, so no alarm stores the schema default.
  alarm_kind: (h: Draft) => h.alarm?.kind ?? "alarm",
  seasons: (h: Draft) => JSON.stringify(h.seasons),
  season_quiet_until: (h: Draft) => h.seasonQuietUntil,
  tiny_version: (h: Draft) => h.tinyVersion,
} satisfies Record<string, (habit: Draft) => SqlValue>;

type HabitRow = { id: string } & {
  [Column in keyof typeof COLUMNS]: ReturnType<(typeof COLUMNS)[Column]>;
};

const NAMES = Object.keys(COLUMNS);

const rowValues = (habit: Habit): SqlValue[] => [
  ...Object.values(COLUMNS).map((write) => write(habit)),
  habit.id,
];

const INSERT_SQL =
  `INSERT INTO habits (${NAMES.join(", ")}, id, position) ` +
  `VALUES (${NAMES.map(() => "?").join(", ")}, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM habits))`;

const SET_LIST = NAMES.map((n) => `${n} = ?`).join(", ");

const UPDATE_SQL = `UPDATE habits SET ${SET_LIST} WHERE id = ?`;

const StoredStrings = z.array(z.string());

const StoredDays = z.array(z.number());

const StoredSeasons = z.array(Season);

const StoredTrees = z.array(TreeSpan);

const toHabit = (row: HabitRow, goals: Map<string, number[]>): Habit => ({
  id: row.id,
  name: row.name,
  description: row.description,
  usualWhen: row.usual_when,
  places: StoredStrings.parse(JSON.parse(row.places)),
  kind: row.kind,
  trees: StoredTrees.parse(JSON.parse(row.trees)),
  treeAskFrom: row.tree_ask_from,
  priority: row.priority,
  active: row.active === 1,
  autoLogged: row.auto_logged === 1,
  optOutFrom: row.opt_out_from,
  usualMinutes: row.usual_minutes,
  startDate: row.start_date,
  cueType: row.cue_type,
  stackedAfter: row.stacked_after,
  target: {
    type: row.target_type,
    count: row.target_count,
    days: StoredDays.parse(JSON.parse(row.target_days)),
  },
  record: row.record,
  targetMinutes: row.target_minutes,
  goals: goals.get(row.id) ?? [],
  alarm: row.alarm_time === null ? null : { time: row.alarm_time, kind: row.alarm_kind },
  seasons: StoredSeasons.parse(JSON.parse(row.seasons)),
  seasonQuietUntil: row.season_quiet_until,
  tinyVersion: row.tiny_version,
});

/** `where` is a fixed SQL clause from the caller, never request text; user text goes in `args`. */
export async function readHabits(env: Env, where = "", ...args: SqlValue[]) {
  const { results } = await env.DB.prepare(
    `SELECT id, ${NAMES.join(", ")} FROM habits ${where} ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, position, rowid`,
  )
    .bind(...args)
    .all<HabitRow>();

  const links = await env.DB.prepare("SELECT habit_id, goal_id FROM goal_habits ORDER BY goal_id")
    .bind()
    .all<{ habit_id: string; goal_id: number }>();

  const goals = new Map<string, number[]>();

  for (const { habit_id, goal_id } of links.results)
    goals.set(habit_id, [...(goals.get(habit_id) ?? []), goal_id]);

  return results.map((row) => toHabit(row, goals));
}

/** Each count since `since`, plus every answer to a One-off: an answered One-off must never look overdue again. */
async function readCounts(env: Env, since: string) {
  const { results } = await env.DB.prepare(
    "SELECT c.date, c.habit, c.count FROM habit_checks c LEFT JOIN habits h ON h.id = c.habit " +
      "WHERE c.date >= ? OR (h.target_type = 'once' AND c.date >= h.start_date) " +
      "ORDER BY c.date, c.habit",
  )
    .bind(since)
    .all<{ date: string; habit: string; count: number }>();

  const counts: Counts = {};

  for (const { date, habit, count } of results) {
    const day = counts[date] ?? {};
    day[habit] = count;
    counts[date] = day;
  }

  return counts;
}

/** Each `duration` Habit's entries since `since`, by date then Habit id, earliest first. */
async function readDurations(env: Env, since: string) {
  const { results } = await env.DB.prepare(
    "SELECT d.id, d.date, d.habit, d.start_time, d.minutes FROM habit_durations d " +
      "JOIN habits h ON h.id = d.habit AND h.record = 'duration' " +
      "WHERE d.date >= ? ORDER BY d.date, d.habit, d.start_time, d.id",
  )
    .bind(since)
    .all<{ id: number; date: string; habit: string; start_time: string; minutes: number }>();

  const durations: Durations = {};

  for (const { id, date, habit, start_time: startTime, minutes } of results) {
    const day = durations[date] ?? {};
    day[habit] = [...(day[habit] ?? []), { id, startTime, minutes }];
    durations[date] = day;
  }

  return durations;
}

/** Each Habit's non-empty notes since `since`: a Day's Duration entries' by start, then its check's. */
export async function readNotes(env: Env, since: string) {
  const { results } = await env.DB.prepare(
    "SELECT date, habit, note FROM (" +
      "SELECT date, habit, note, 0 AS source, start_time, id FROM habit_durations WHERE date >= ?1 AND note != '' " +
      "UNION ALL SELECT date, habit, note, 1, '', 0 FROM habit_checks WHERE date >= ?1 AND note != ''" +
      ") ORDER BY date, habit, source, start_time, id",
  )
    .bind(since)
    .all<{ date: string; habit: string; note: string }>();

  const notes: DayNotes = {};

  for (const { date, habit, note } of results) {
    const day = notes[date] ?? {};
    day[habit] = [...(day[habit] ?? []), note];
    notes[date] = day;
  }

  return notes;
}

/** A new Habit goes to the end of the list. */
export const insertHabitStatement = (env: Env, habit: Habit) =>
  env.DB.prepare(INSERT_SQL).bind(...rowValues(habit));

export async function insertHabit(env: Env, habit: Habit) {
  const { meta } = await insertHabitStatement(env, habit).run();

  return meta.changes > 0;
}

const slug = (name: string) => {
  const words = name
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 24);

  return words === "" ? "habit" : words;
};

/** A readable id that two Habits with the same name still can't share. */
export const newHabitId = (name: string) => `${slug(name)}-${crypto.randomUUID().slice(0, 6)}`;

/** False when no Habit has that id. */
export async function updateHabit(env: Env, habit: Habit) {
  const { meta } = await env.DB.prepare(UPDATE_SQL)
    .bind(...rowValues(habit))
    .run();

  return meta.changes > 0;
}

/** Stores a Habit's tree answers; false when no Habit has that id. */
export async function updateTrees(
  env: Env,
  id: string,
  { trees, treeAskFrom }: Pick<Habit, "trees" | "treeAskFrom">,
) {
  const { meta } = await env.DB.prepare(
    "UPDATE habits SET trees = ?, tree_ask_from = ? WHERE id = ?",
  )
    .bind(JSON.stringify(trees), treeAskFrom, id)
    .run();

  return meta.changes > 0;
}

// Every read and write of a Habit's Days goes through the functions below: habit_checks, habit_durations and
// habit_skips stay in step only if no other module touches them. Each statement binds the Habit as ?1, the Day as ?2.

const DAY = "habit = ?1 AND date = ?2";

const IS_SKIPPED = `EXISTS (SELECT 1 FROM habit_checks WHERE ${DAY} AND count = ${MISSED})`;

// A Skip always has its MISSED check, so a check or a Duration entry covers every answer.
const ANSWERED = `(EXISTS (SELECT 1 FROM habit_checks WHERE ${DAY}) OR EXISTS (SELECT 1 FROM habit_durations WHERE ${DAY}))`;

const HABIT_EXISTS = "EXISTS (SELECT 1 FROM habits WHERE id = ?1)";

const IS_DURATION = "EXISTS (SELECT 1 FROM habits WHERE id = ?1 AND record = 'duration')";

// A `duration` Habit logs Duration entries and never a count; only an Opt-out one can be Skipped.
const CAN_SKIP =
  "NOT EXISTS (SELECT 1 FROM habits WHERE id = ?1 AND record = 'duration' AND opt_out_from IS NULL)";

/** Each Skip from `since` on, by date then Habit id. */
async function readSkips(env: Env, since: string) {
  const { results } = await env.DB.prepare(
    "SELECT habit, date, cause, note FROM habit_skips WHERE date >= ? ORDER BY date, habit",
  )
    .bind(since)
    .all<{ habit: string; date: string } & Skip>();

  const skips: Skips = {};

  for (const { habit, date, cause, note } of results)
    skips[date] = { ...skips[date], [habit]: { cause, note } };

  return skips;
}

async function readRestPeriods(env: Env, since: string) {
  const { results } = await env.DB.prepare(
    "SELECT start_date AS start, end_date AS end FROM rest_periods WHERE end_date >= ? ORDER BY start_date",
  )
    .bind(since)
    .all<RestPeriod>();

  return results;
}

const fillEntry = (db: D1, { date, habit, startTime, minutes }: OptOutLog & { minutes: number }) =>
  db
    .prepare(
      "INSERT INTO habit_durations (habit, date, start_time, minutes) " +
        `SELECT ?1, ?2, ?3, ?4 WHERE ${IS_DURATION} AND NOT ${ANSWERED}`,
    )
    .bind(habit, date, startTime, minutes);

// Each write rechecks the Day, so a read racing another read or a Skip never logs a Day twice or over a Skip.
const optOutWrite = (db: D1, log: OptOutLog) =>
  log.minutes === null
    ? writeCheck(db, { habit: log.habit, date: log.date, count: 1, mode: "fill" })
    : [fillEntry(db, { ...log, minutes: log.minutes })];

/** Stores each Opt-out Day that has passed unanswered by `now` as done, so it can be edited like any other. */
async function storeOptOutDays(env: Env, now: Date) {
  const habits = await readHabits(env, "WHERE active = 1 AND opt_out_from IS NOT NULL");

  const first = habits
    .map(({ optOutFrom }) => optOutFrom)
    .filter((start) => start !== null)
    .toSorted((a, b) => a.localeCompare(b))[0];

  if (first === undefined) return;

  const [counts, durations] = await Promise.all([
    readCounts(env, first),
    readDurations(env, first),
  ]);

  const logs = habits.flatMap((habit) => optOutLogs(habit, { counts, durations }, now));

  if (logs.length > 0) await env.DB.batch(logs.flatMap((log) => optOutWrite(env.DB, log)));
}

/**
 * Every Habit's records from `since` on: counts (every One-off answer too), Duration entries, Skips and the Rest
 * periods that reach it. Stores the passed Opt-out Days first, so every read counts them.
 */
export async function readRecords(env: Env, since: string, now: Date): Promise<StreakRecords> {
  await storeOptOutDays(env, now);

  const [counts, durations, skips, restPeriods] = await Promise.all([
    readCounts(env, since),
    readDurations(env, since),
    readSkips(env, since),
    readRestPeriods(env, since),
  ]);

  return { counts, durations, skips, restPeriods };
}

/** The statements of one write, to run in one batch; the first stores the check, Skip or entries it names. */
export type RecordWrite = D1Statement[];

/** Runs a write on its own and returns how many rows its first statement stored; 0 means it was refused. */
export async function applyWrite(db: D1, write: RecordWrite) {
  const runs = await db.batch(write);

  // D1 answers one run per statement; the 0 only types the empty case.
  return runs.slice(0, 1).reduce((_, { meta }) => meta.changes, 0);
}

// A done write ends a Skip: the Day's MISSED check gives way to its Duration entries, and a Skip goes with its MISSED check.
function endSkips(db: D1, habit: string, dates: string[]) {
  const days = JSON.stringify([...new Set(dates)]);
  const onDays = "date IN (SELECT value FROM json_each(?2))";

  return [
    db
      .prepare(
        `DELETE FROM habit_checks WHERE habit = ?1 AND ${onDays} AND count = ${MISSED} ` +
          "AND EXISTS (SELECT 1 FROM habit_durations d WHERE d.habit = ?1 AND d.date = habit_checks.date)",
      )
      .bind(habit, days),
    db
      .prepare(
        `DELETE FROM habit_skips WHERE habit = ?1 AND ${onDays} AND NOT EXISTS ` +
          `(SELECT 1 FROM habit_checks c WHERE c.habit = ?1 AND c.date = habit_skips.date AND c.count = ${MISSED})`,
      )
      .bind(habit, days),
  ];
}

/**
 * `set` is the owner's own answer; `add` is the log box's, adding to the Day's count (a check Habit is just done);
 * `fill` is an automatic source's, which never overrides a Day already answered.
 */
export type CountMode = "set" | "add" | "fill";

const UPSERT_COUNT = "ON CONFLICT (date, habit) DO UPDATE SET count = excluded.count";

const COUNT_SQL: Record<CountMode, string> = {
  set: `INSERT INTO habit_checks (habit, date, count) SELECT ?1, ?2, ?3 WHERE NOT ${IS_DURATION} ${UPSERT_COUNT}`,
  add:
    "INSERT INTO habit_checks (habit, date, count) SELECT ?1, ?2, " +
    "CASE WHEN EXISTS (SELECT 1 FROM habits WHERE id = ?1 AND record = 'check') THEN 1 " +
    `ELSE min(${MAX_COUNT}, max(0, coalesce((SELECT count FROM habit_checks WHERE ${DAY}), 0)) + ?3) END ` +
    `WHERE NOT ${IS_DURATION} ${UPSERT_COUNT}`,
  fill: `INSERT INTO habit_checks (habit, date, count) SELECT ?1, ?2, ?3 WHERE ${HABIT_EXISTS} AND NOT ${IS_DURATION} AND NOT ${ANSWERED}`,
};

interface DayOf {
  habit: string;
  date: string;
}

/** A done count, from 1 up; a `duration` Habit takes none. A Skip goes through `writeSkip`. */
export const writeCheck = (
  db: D1,
  { habit, date, count, mode }: DayOf & { count: number; mode: CountMode },
): RecordWrite => [
  db.prepare(COUNT_SQL[mode]).bind(habit, date, count),
  ...endSkips(db, habit, [date]),
];

/** The note of the Day's check; a Day with no done check keeps none. */
export const writeCheckNote = (db: D1, { habit, date, note }: DayOf & { note: string }) =>
  db
    .prepare(`UPDATE habit_checks SET note = ?3 WHERE ${DAY} AND count > 0`)
    .bind(habit, date, note);

/** `set` is the owner's Skip, over any answer; `fill` is an automatic source's, only on an unanswered Day. */
export type SkipMode = "set" | "fill";

const SKIP_SQL: Record<SkipMode, { check: string; cause: string }> = {
  set: {
    check: `INSERT INTO habit_checks (habit, date, count) SELECT ?1, ?2, ${MISSED} WHERE ${CAN_SKIP} ${UPSERT_COUNT}`,
    cause:
      `INSERT INTO habit_skips (habit, date, cause, note) SELECT ?1, ?2, ?3, ?4 WHERE ${IS_SKIPPED} ` +
      "ON CONFLICT (habit, date) DO UPDATE SET cause = excluded.cause, note = excluded.note",
  },
  fill: {
    check: `INSERT INTO habit_checks (habit, date, count) SELECT ?1, ?2, ${MISSED} WHERE ${HABIT_EXISTS} AND ${CAN_SKIP} AND NOT ${ANSWERED}`,
    cause: `INSERT INTO habit_skips (habit, date, cause, note) SELECT ?1, ?2, ?3, ?4 WHERE ${HABIT_EXISTS} AND ${CAN_SKIP} AND NOT ${ANSWERED}`,
  },
};

/**
 * A Skip: the Day's MISSED check, and its cause when one is given (a Skip without one keeps any cause it had).
 * A skipped Day was not done, so it keeps no Duration entry, such as the usual length an Opt-out Day logged.
 */
export function writeSkip(
  db: D1,
  {
    habit,
    date,
    mode,
    cause,
    note = "",
  }: DayOf & { mode: SkipMode; cause?: SkipCause | undefined; note?: string | undefined },
): RecordWrite {
  const sql = SKIP_SQL[mode];
  const check = db.prepare(sql.check).bind(habit, date);
  const causes = cause === undefined ? [] : [db.prepare(sql.cause).bind(habit, date, cause, note)];

  const dropEntries = db
    .prepare(`DELETE FROM habit_durations WHERE ${DAY} AND ${IS_SKIPPED}`)
    .bind(habit, date);

  // `fill` stores the cause while the Day still reads unanswered; `set` only once the Day is MISSED.
  return mode === "set" ? [check, ...causes, dropEntries] : [...causes, check, dropEntries];
}

/** Clears the Day's answer: its check and any Skip. */
export const clearCheck = (db: D1, { habit, date }: DayOf): RecordWrite => [
  db.prepare(`DELETE FROM habit_checks WHERE ${DAY}`).bind(habit, date),
  db.prepare(`DELETE FROM habit_skips WHERE ${DAY}`).bind(habit, date),
];

/** One new Duration entry; `id` names the calendar event it logs. Only the owner writes a `note`. */
export interface NewEntry {
  date: string;
  startTime: string;
  minutes: number;
  id?: string;
  note?: string;
}

/** `owner` adds every entry; `import` skips one whose date and start the Habit has; `calendar` logs each event once, never on a Skipped Day. */
export type EntrySource = "owner" | "import" | "calendar";

const ENTRY = "e.value ->> 'date', e.value ->> 'startTime', e.value ->> 'minutes'";

const SAME_START =
  "SELECT 1 FROM habit_durations d WHERE d.habit = ?1 AND d.date = e.value ->> 'date' AND d.start_time = e.value ->> 'startTime'";

const ADD_SQL: Record<EntrySource, string[]> = {
  owner: [
    "INSERT INTO habit_durations (habit, date, start_time, minutes, note) " +
      `SELECT ?1, ${ENTRY}, coalesce(e.value ->> 'note', '') FROM json_each(?2) e WHERE ${IS_DURATION}`,
  ],
  // One statement whatever the import's size, so a re-import adds only new workouts.
  import: [
    "INSERT INTO habit_durations (habit, date, start_time, minutes) " +
      "SELECT ?1, e.value ->> 'date', e.value ->> 'startTime', MAX(e.value ->> 'minutes') FROM json_each(?2) e " +
      `WHERE ${IS_DURATION} AND NOT EXISTS (${SAME_START}) GROUP BY 2, 3`,
  ],
  // The morning job confirms events with no one there, so an event never replaces a Skip.
  calendar: [
    "INSERT INTO habit_durations (habit, date, start_time, minutes, calendar_event_id) " +
      `SELECT ?1, ${ENTRY}, e.value ->> 'id' FROM json_each(?2) e WHERE ${IS_DURATION} ` +
      `AND NOT EXISTS (SELECT 1 FROM habit_checks c WHERE c.habit = ?1 AND c.date = e.value ->> 'date' AND c.count = ${MISSED}) ` +
      "ON CONFLICT (calendar_event_id) DO NOTHING",
  ],
};

/** New entries for a `duration` Habit, refused for any other; each one ends its Day's Skip, except a `calendar` one. */
export const addDurations = (
  db: D1,
  habit: string,
  entries: NewEntry[],
  source: EntrySource,
): RecordWrite => [
  ...ADD_SQL[source].map((sql) => db.prepare(sql).bind(habit, JSON.stringify(entries))),
  ...endSkips(
    db,
    habit,
    entries.map(({ date }) => date),
  ),
];

/** Entries with the same Habit, date, start and minutes are indistinguishable, so this matches one of them. */
export interface EntryMatch extends DayOf {
  startTime: string;
  minutes: number;
}

/** One entry by id or by match. */
export type EntriesToRemove = { id: number } | { entry: EntryMatch };

const removeSql = (db: D1, which: EntriesToRemove) => {
  if ("id" in which) return db.prepare("DELETE FROM habit_durations WHERE id = ?").bind(which.id);

  const { habit, date, startTime, minutes } = which.entry;

  return db
    .prepare(
      "DELETE FROM habit_durations WHERE id = (SELECT id FROM habit_durations " +
        "WHERE habit = ? AND date = ? AND start_time = ? AND minutes = ? LIMIT 1)",
    )
    .bind(habit, date, startTime, minutes);
};

export const removeDurations = (db: D1, which: EntriesToRemove): RecordWrite => [
  removeSql(db, which),
];

/** Every check, Duration entry and Skip of a Habit, before the Habit itself goes. */
export const deleteHabitRecords = (db: D1, habit: string): RecordWrite =>
  ["habit_checks", "habit_durations", "habit_skips"].map((table) =>
    db.prepare(`DELETE FROM ${table} WHERE habit = ?`).bind(habit),
  );

/** Deletes a Habit unless anything uses it by now: a record, Goal, Reschedule, Calendar link or another Habit's link. */
export const deleteUnusedHabit = (db: D1, habit: string) =>
  db
    .prepare(
      "DELETE FROM habits WHERE id = ?1 " +
        "AND NOT EXISTS (SELECT 1 FROM habit_checks WHERE habit = ?1) " +
        "AND NOT EXISTS (SELECT 1 FROM habit_durations WHERE habit = ?1) " +
        "AND NOT EXISTS (SELECT 1 FROM goal_habits WHERE habit_id = ?1) " +
        "AND NOT EXISTS (SELECT 1 FROM habit_reschedules WHERE habit = ?1) " +
        "AND NOT EXISTS (SELECT 1 FROM habit_skips WHERE habit = ?1) " +
        "AND NOT EXISTS (SELECT 1 FROM habit_calendar_links WHERE habit = ?1) " +
        "AND NOT EXISTS (SELECT 1 FROM habits WHERE stacked_after = ?1)",
    )
    .bind(habit);
