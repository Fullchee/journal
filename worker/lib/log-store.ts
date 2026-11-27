import { blankHabit, checkDraft, torontoDay, torontoTime, type Habit, type Logged } from "@/core";
import type { Env, SqlValue } from "./env";
import {
  addDurations,
  daysJson,
  dayStatesSql,
  DayState,
  deleteUnusedHabit,
  insertHabitStatement,
  newHabitId,
  readDayStates,
  readHabits,
  restoreDayStates,
  writeCheck,
  writeCheckNote,
} from "./habit-records";
import {
  dayInWords,
  isDueDate,
  receiptLine,
  spanLabel,
  type LogContext,
  type Write,
} from "./log-plan";
import { MAX_TEXT, type ModelOneOff } from "./log-thread";
import * as z from "zod/mini";

/** The log box sees only active Habits that have a target. */
export async function readLogContext(env: Env): Promise<LogContext> {
  const now = new Date();

  return {
    habits: await readHabits(env, "WHERE active = 1 AND target_type != 'none'"),
    today: torontoDay(now),
    time: torontoTime(now),
  };
}

// What one log box write did, stored in log_actions.applied so Undo can put each Day back. Both states are read inside the
// write's own batch, so they hold exactly what the writes left. `habit` is the Habit the log created.
const Applied = z.object({
  habit: z.nullable(z.string()),
  before: z.array(DayState),
  after: z.array(DayState),
});

type Applied = z.infer<typeof Applied>;

interface LogWrite {
  text: string;
  writes: Write[];
  created: Habit | null;
  today: string;
}

const nextActionId = async (env: Env) => {
  const { results } = await env.DB.prepare(
    "SELECT COALESCE(MAX(id), 0) + 1 AS next FROM log_actions",
  )
    .bind()
    .all<{ next: number }>();

  // The aggregate always returns one row; the 1 only types the empty case.
  return results.reduce((_, row) => row.next, 1);
};

const statement = (env: Env, sql: string, ...args: SqlValue[]) => env.DB.prepare(sql).bind(...args);

const readAction = async (env: Env, id: number) => {
  const { results } = await statement(
    env,
    "SELECT applied, undone_at FROM log_actions WHERE id = ?",
    id,
  ).all<{ applied: string; undone_at: string | null }>();

  return results;
};

function writeStatements(env: Env, write: Write) {
  const { habit, date, note } = write;

  if (write.record === "duration")
    return addDurations(
      env.DB,
      habit.id,
      [{ date, startTime: write.startTime, minutes: write.minutes, note }],
      "owner",
    );

  return [
    ...writeCheck(env.DB, { habit: habit.id, date, count: write.count, mode: "add" }),
    ...(note === "" ? [] : [writeCheckNote(env.DB, { habit: habit.id, date, note })]),
  ];
}

// A check or count write's receipt shows the Day's count; a duration write's, its minutes.
function dayTotal(after: DayState[], { habit, date, record }: Write) {
  const day = after.filter((state) => state.habit === habit.id && state.date === date);

  return record === "duration"
    ? day.flatMap(({ entries }) => entries).reduce((sum, { minutes }) => sum + minutes, 0)
    : day.reduce((_, { check }) => check?.count ?? 0, 0);
}

/** Writes every entry and its log_actions row in one D1 batch, and returns the row's id and the receipt. */
export async function applyLog(env: Env, { text, writes, created, today }: LogWrite) {
  // D1 runs a batch as one transaction, so if another write takes this id first the whole batch fails instead of mixing rows.
  const action = await nextActionId(env);
  const days = daysJson(writes.map(({ habit, date }) => ({ habit: habit.id, date })));

  await env.DB.batch([
    ...(created ? [insertHabitStatement(env, created)] : []),
    statement(
      env,
      `INSERT INTO log_actions (id, text, applied) VALUES (?1, ?2, json_object('habit', ?3, 'before', json(${dayStatesSql(4)})))`,
      action,
      text,
      created?.id ?? null,
      days,
    ),
    ...writes.flatMap((write) => writeStatements(env, write)),
    statement(
      env,
      `UPDATE log_actions SET applied = json_set(applied, '$.after', json(${dayStatesSql(2)})) WHERE id = ?1`,
      action,
      days,
    ),
  ]);

  const stored = await readAction(env, action);
  const after = stored.flatMap(({ applied }) => Applied.parse(JSON.parse(applied)).after);

  return {
    action,
    lines: writes.map((write) => receiptLine(write, dayTotal(after, write), today)),
  };
}

const isShortText = (value: string | undefined): value is string =>
  value !== undefined && value.length <= MAX_TEXT;

/** A One-off as a new Habit, or null when a field doesn't check out; it comes from the client, so nothing is trusted. */
export function oneOffHabit(oneOff: ModelOneOff | null, today: string): Habit | null {
  if (oneOff === null) return null;
  const { name, date, usual_when: usualWhen } = oneOff;

  if (!isShortText(name) || !isDueDate(date, today) || !isShortText(usualWhen)) return null;

  // `check`, because only that Record style can be answered Not done.
  const { draft } = checkDraft({
    ...blankHabit("good"),
    name,
    usualWhen: usualWhen.trim(),
    startDate: date,
    target: { type: "once", count: 1, days: [] },
    record: "check",
  });

  return draft ? { ...draft, id: newHabitId(draft.name) } : null;
}

/** Creates the One-off as a log action, so the log box's Undo removes it. */
export async function saveOneOff(
  env: Env,
  { text, habit, today }: { text: string; habit: Habit; today: string },
): Promise<Logged> {
  const { action } = await applyLog(env, {
    text,
    writes: [],
    created: habit,
    today,
  });

  return { type: "logged", text: `Added ${habit.name} on ${dayInWords(habit.startDate)}.`, action };
}

interface Refusal {
  status: 404 | 409;
  error: string;
}

const sameDay =
  ({ habit, date }: DayState) =>
  (state: DayState) =>
    state.habit === habit && state.date === date;

// Why putting `day` back would lose a change made since the log: a new count, a gone entry the log added, or anything else.
function changeOf(
  day: DayState,
  { before, now }: { before: DayState[]; now: DayState[] },
  name: string,
) {
  const count = (states: DayState[]) =>
    states.filter(sameDay(day)).reduce((_, { check }) => check?.count ?? 0, 0);

  const entries = (states: DayState[]) =>
    states
      .filter(sameDay(day))
      .flatMap((state) => state.entries.map((entry) => JSON.stringify(entry)));

  if (count(now) !== count([day]))
    return `${name} on ${day.date} changed since (now ${count(now)}), so Undo would lose that change.`;

  const [had, kept] = [entries(before), entries(now)];

  const gone = day.entries
    .filter((entry) => !had.includes(JSON.stringify(entry)))
    .find((entry) => !kept.includes(JSON.stringify(entry)));

  if (gone)
    return `${name} ${spanLabel({ startTime: gone.start_time, minutes: gone.minutes })} on ${day.date} was deleted since, so Undo can't remove it.`;

  return `${name} on ${day.date} changed since, so Undo would lose that change.`;
}

/** Why Undo would lose a later change, or null when every Day is as the log left it. */
async function changedSince(env: Env, { before, after }: Applied) {
  const now = await readDayStates(env.DB, after);
  // Entries and Days are compared whole: an entry id SQLite reused for a later entry must not match.
  const stored = new Set(now.map((state) => JSON.stringify(state)));
  const changed = after.find((day) => !stored.has(JSON.stringify(day)));

  if (!changed) return null;
  const habits = await readHabits(env);
  const name = habits.find(({ id }) => id === changed.habit)?.name ?? changed.habit;

  return changeOf(changed, { before, now }, name);
}

const undoStatements = (env: Env, id: number, { habit, before }: Applied) => [
  // First, so the log_actions_undo_once trigger aborts a second Undo before it changes anything.
  statement(
    env,
    "UPDATE log_actions SET undone_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
    id,
  ),
  ...restoreDayStates(env.DB, before),
  ...(habit === null ? [] : [deleteUnusedHabit(env.DB, habit)]),
];

/** Reverses one log box write; returns why it can't, or null when it did. */
export async function undoLog(env: Env, id: number): Promise<Refusal | null> {
  const [row] = await readAction(env, id);

  if (!row) return { status: 404, error: "No such log." };
  const undone: Refusal = { status: 409, error: "Already undone." };

  if (row.undone_at !== null) return undone;
  const applied = Applied.safeParse(JSON.parse(row.applied));

  // Logs saved before each Day's state was kept can't be put back exactly.
  if (!applied.success) return { status: 409, error: "This log is too old to undo." };
  const changed = await changedSince(env, applied.data);

  if (changed !== null) return { status: 409, error: changed };

  try {
    await env.DB.batch(undoStatements(env, id, applied.data));
  } catch (error) {
    // Another Undo of the same log finished between the read above and this batch.
    const now = await readAction(env, id);

    if (now.some(({ undone_at }) => undone_at !== null)) return undone;
    throw error;
  }

  return null;
}
