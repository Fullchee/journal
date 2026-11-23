import {
  blankHabit,
  MISSED,
  RESCHEDULE_CAUSES,
  shiftDay,
  torontoDay,
  torontoTime,
  type Counts,
  type DayNotes,
  type Habit,
  type Logged,
  type StreakRecords,
} from "@/core";
import type { D1Statement, Env, SqlValue } from "./env";
import {
  addDurations,
  clearCheck,
  deleteUnusedHabit,
  insertHabitStatement,
  newHabitId,
  readHabit,
  readHabits,
  readNotes,
  readRecords,
  removeDurations,
  writeCheck,
  writeCheckNote,
  writeSkip,
} from "./habit-records";
import {
  capCount,
  dayInWords,
  earliestDate,
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

// Entries with the same Habit, date, start and minutes are indistinguishable, so Undo matches on these, not on a row id.
const Entry = z.object({
  habit: z.string(),
  date: z.string(),
  start_time: z.string(),
  minutes: z.number(),
});

type Entry = z.infer<typeof Entry>;

// A count of 0 means the day had no habit_checks row. `note` is the check's note before, kept only when the log changed it.
const CountChange = z.object({
  habit: z.string(),
  date: z.string(),
  before: z.number(),
  after: z.number(),
  note: z.optional(z.string()),
});

type CountChange = z.infer<typeof CountChange>;

// A Skipped Day the write made done; a Skip given without a cause has none.
const SkippedDay = z.object({
  habit: z.string(),
  date: z.string(),
  cause: z.nullable(z.enum(RESCHEDULE_CAUSES)),
  note: z.string(),
});

type SkippedDay = z.infer<typeof SkippedDay>;

// What one log box write did, stored in log_actions.applied so Undo can reverse exactly that.
// Rows from the retired chat may also hold `removed`; their Receipts are gone, so it is dropped.
// Rows from before Skips were kept hold no `skipped`.
const Applied = z.object({
  habit: z.nullable(z.string()),
  added: z.array(Entry),
  counts: z.array(CountChange),
  skipped: z.optional(z.array(SkippedDay)),
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

type CountWrite = Exclude<Write, { record: "duration" }>;

// Several writes to one Habit on one day stack, so each starts from the count the one before left.
function countChange(
  changes: Map<string, CountChange>,
  { counts, notes }: { counts: Counts; notes: DayNotes },
  write: CountWrite,
): CountChange {
  const earlier = changes.get(`${write.date} ${write.habit.id}`);
  const before = earlier?.before ?? counts[write.date]?.[write.habit.id] ?? 0;
  const current = earlier?.after ?? before;
  const after = write.record === "check" ? 1 : capCount(Math.max(0, current) + write.count);
  // A check or count Habit has no Duration entries, so its Day's only note is its check's.
  const stored = notes[write.date]?.[write.habit.id]?.[0] ?? "";
  const note = earlier?.note ?? (write.note === "" ? undefined : stored);

  return {
    habit: write.habit.id,
    date: write.date,
    before,
    after,
    ...(note !== undefined && { note }),
  };
}

// A done write replaces the Day's Skip, so the Receipt keeps it for Undo to put back.
function skippedDay(
  { counts, skips }: StreakRecords,
  habit: string,
  date: string,
): SkippedDay | null {
  if (counts[date]?.[habit] !== MISSED) return null;
  const skip = skips[date]?.[habit];

  return { habit, date, cause: skip?.cause ?? null, note: skip?.note ?? "" };
}

/** Writes every entry and its log_actions row in one D1 batch, and returns the row's id and the receipt. */
export async function applyLog(env: Env, { text, writes, created, today }: LogWrite) {
  // An entry from the day before can run past midnight into the first day written.
  const since = shiftDay(earliestDate(writes, "9999-12-31"), -1);

  const [records, notes] = await Promise.all([
    readRecords(env, since, new Date()),
    readNotes(env, since),
  ]);

  const { counts, durations: entries } = records;

  // D1 runs a batch as one transaction, so if another write takes this id first the whole batch fails instead of mixing rows.
  const action = await nextActionId(env);

  const statements: D1Statement[] = created ? [insertHabitStatement(env, created)] : [];
  const applied: Applied = { habit: created?.id ?? null, added: [], counts: [] };
  const changes = new Map<string, CountChange>();
  const skipped = new Map<string, SkippedDay>();

  // A day's total counts every write of the log, so each receipt is built once the loop has them all.
  const receipts: (() => string)[] = [];

  // One count change stays per Habit and day, the last, so every receipt of theirs shows the same total.
  const countAfter = (write: Write) =>
    applied.counts
      .filter(({ date, habit }) => date === write.date && habit === write.habit.id)
      .reduce((_, change) => change.after, 0);

  for (const write of writes) {
    const skip = skippedDay(records, write.habit.id, write.date);

    if (skip) skipped.set(`${write.date} ${write.habit.id}`, skip);

    if (write.record !== "duration") {
      changes.set(
        `${write.date} ${write.habit.id}`,
        countChange(changes, { counts, notes }, write),
      );
      statements.push(
        ...writeCheck(env.DB, {
          habit: write.habit.id,
          date: write.date,
          count: write.count,
          mode: "add",
        }),
      );

      if (write.note !== "")
        statements.push(
          writeCheckNote(env.DB, { habit: write.habit.id, date: write.date, note: write.note }),
        );
      receipts.push(() => receiptLine(write, countAfter(write), today));
      continue;
    }

    const added: Entry = {
      habit: write.habit.id,
      date: write.date,
      start_time: write.startTime,
      minutes: write.minutes,
    };

    statements.push(
      ...addDurations(
        env.DB,
        added.habit,
        [
          {
            date: added.date,
            startTime: added.start_time,
            minutes: added.minutes,
            note: write.note,
          },
        ],
        "owner",
      ),
    );
    applied.added.push(added);
    receipts.push(() => receiptLine(write, minutesOn(write.date, write.habit.id), today));
  }

  applied.counts.push(...changes.values());
  applied.skipped = [...skipped.values()];

  statements.push(
    statement(
      env,
      "INSERT INTO log_actions (id, text, applied) VALUES (?, ?, ?)",
      action,
      text,
      JSON.stringify(applied),
    ),
  );
  await env.DB.batch(statements);

  const minutesOn = (date: string, habit: string) =>
    (entries[date]?.[habit] ?? []).reduce((sum, entry) => sum + entry.minutes, 0) +
    applied.added
      .filter((entry) => entry.date === date && entry.habit === habit)
      .reduce((sum, entry) => sum + entry.minutes, 0);

  return { action, lines: receipts.map((receipt) => receipt()) };
}

const isShortText = (value: string | undefined): value is string =>
  value !== undefined && value.length <= MAX_TEXT;

/** A One-off as a new Habit, or null when a field doesn't check out; it comes from the client, so nothing is trusted. */
export function oneOffHabit(oneOff: ModelOneOff | null, today: string): Habit | null {
  if (oneOff === null) return null;
  const { name, date, usual_when: usualWhen } = oneOff;

  if (!isShortText(name) || !isDueDate(date, today) || !isShortText(usualWhen)) return null;

  // `check`, because only that Record style can be answered Not done.
  const draft = readHabit({
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

const earliestOf = ({ added, counts, skipped = [] }: Applied) =>
  [...added, ...counts, ...skipped]
    .map(({ date }) => date)
    .toSorted((x, y) => x.localeCompare(y))[0];

// A count the owner changed after logging would be lost, so Undo refuses rather than overwrite it.
function changedCount(
  records: StreakRecords,
  changes: CountChange[],
  nameOf: (id: string) => string,
) {
  const changed = changes.find(
    ({ habit, date, after }) => (records.counts[date]?.[habit] ?? 0) !== after,
  );

  return changed
    ? `${nameOf(changed.habit)} on ${changed.date} changed since (now ${records.counts[changed.date]?.[changed.habit] ?? 0}), so Undo would lose that change.`
    : null;
}

const sameEntry = (a: Entry, b: Entry) =>
  a.habit === b.habit &&
  a.date === b.date &&
  a.start_time === b.start_time &&
  a.minutes === b.minutes;

// An added entry the tracker deleted since can't be removed again, so Undo refuses rather than undo only part of the log.
function missingEntry(records: StreakRecords, added: Entry[], nameOf: (id: string) => string) {
  const stored = (entry: Entry) =>
    (records.durations[entry.date]?.[entry.habit] ?? []).filter(
      ({ startTime, minutes }) => startTime === entry.start_time && minutes === entry.minutes,
    ).length;

  const missing = added.find(
    (entry) => stored(entry) < added.filter((other) => sameEntry(other, entry)).length,
  );

  if (!missing) return null;
  const span = spanLabel({ startTime: missing.start_time, minutes: missing.minutes });

  return `${nameOf(missing.habit)} ${span} on ${missing.date} was deleted since, so Undo can't remove it.`;
}

/** Why Undo would lose a later change, or null when nothing changed since the log. */
async function changedSince(env: Env, applied: Applied) {
  const since = earliestOf(applied);

  if (since === undefined) return null;

  const [records, habits] = await Promise.all([
    readRecords(env, since, new Date()),
    readHabits(env),
  ]);

  const nameOf = (id: string) => habits.find((habit) => habit.id === id)?.name ?? id;

  return (
    changedCount(records, applied.counts, nameOf) ?? missingEntry(records, applied.added, nameOf)
  );
}

// A Day the log made done goes back to Skipped, its cause included: a count change from MISSED, or a replaced Skip.
function restoredSkips({ counts, skipped = [] }: Applied) {
  const days = new Map<string, SkippedDay>();

  for (const { habit, date, before } of counts)
    if (before === MISSED) days.set(`${date} ${habit}`, { habit, date, cause: null, note: "" });

  for (const day of skipped) days.set(`${day.date} ${day.habit}`, day);

  return [...days.values()];
}

function undoStatements(env: Env, id: number, applied: Applied) {
  const { habit, added, counts } = applied;

  return [
    // First, so the log_actions_undo_once trigger aborts a second Undo before it changes anything.
    statement(
      env,
      "UPDATE log_actions SET undone_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
      id,
    ),
    ...added.flatMap(({ habit: entryHabit, date, start_time: startTime, minutes }) =>
      removeDurations(env.DB, { entry: { habit: entryHabit, date, startTime, minutes } }),
    ),
    ...counts.flatMap(({ date, habit: counted, before, note }) => {
      if (before <= 0) return clearCheck(env.DB, { habit: counted, date });
      const restored = writeCheck(env.DB, { habit: counted, date, count: before, mode: "set" });

      return note === undefined
        ? restored
        : [...restored, writeCheckNote(env.DB, { habit: counted, date, note })];
    }),
    // `fill`, so a Day logged again since keeps that answer.
    ...restoredSkips(applied).flatMap(({ habit: skippedHabit, date, cause, note }) =>
      writeSkip(env.DB, {
        habit: skippedHabit,
        date,
        mode: "fill",
        cause: cause ?? undefined,
        note,
      }),
    ),
    ...(habit === null ? [] : [deleteUnusedHabit(env.DB, habit)]),
  ];
}

/** Reverses one log box write; returns why it can't, or null when it did. */
export async function undoLog(env: Env, id: number): Promise<Refusal | null> {
  const readAction = async () => {
    const { results } = await statement(
      env,
      "SELECT applied, undone_at FROM log_actions WHERE id = ?",
      id,
    ).all<{ applied: string; undone_at: string | null }>();

    return results[0];
  };

  const row = await readAction();

  if (!row) return { status: 404, error: "No such log." };
  const undone: Refusal = { status: 409, error: "Already undone." };

  if (row.undone_at !== null) return undone;
  const applied = Applied.parse(JSON.parse(row.applied));

  const changed = await changedSince(env, applied);

  if (changed !== null) return { status: 409, error: changed };

  try {
    await env.DB.batch(undoStatements(env, id, applied));
  } catch (error) {
    // Another Undo of the same log finished between the read above and this batch.
    const after = await readAction();

    if (after?.undone_at !== null && after?.undone_at !== undefined) return undone;
    throw error;
  }

  return null;
}
