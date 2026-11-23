import * as z from "zod/mini";

import {
  clockLabel,
  formatMinutes,
  minuteOfDay,
  minutesOf,
  shiftDay,
  torontoDay,
} from "./calendar";
import {
  blankHabit,
  cleanNote,
  isReference,
  type Draft,
  type Durations,
  type Habit,
} from "./habits-view";
import { DraftEntry, type HabitDetails, type LogItem, type NewHabit } from "./log-api";

/** One row of the log form; numbers stay text while the owner types them. */
export interface FormEntry {
  habit: string | null;
  date: string;
  startTime: string;
  minutes: string;
  count: string;
  note: string;
}

const MINUTES_PER_DAY = 1440;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** The log box writes to the Habits the owner is tracking, not Backlog or Reference ones. */
export const loggableHabits = (habits: Habit[]) =>
  habits.filter((h) => h.active && !isReference(h));

/** "Walked 25 min" with no start means it ended just now; an earlier day leaves the start for the owner. */
function formEntryOf(entry: DraftEntry, now: Date): FormEntry {
  const today = torontoDay(now);
  const date = entry.date ?? today;

  const endedNow =
    date === today && entry.minutes !== undefined ? minuteOfDay(now) - entry.minutes : -1;

  return {
    habit: entry.habit,
    date,
    startTime: entry.start_time ?? (endedNow >= 0 ? formatMinutes(endedNow) : ""),
    minutes: entry.minutes === undefined ? "" : String(entry.minutes),
    count: String(entry.count ?? 1),
    note: entry.note ?? "",
  };
}

const wholeNumber = (text: string, max: number) => {
  const n = Number(text.trim());

  return text.trim() !== "" && Number.isSafeInteger(n) && n >= 1 && n <= max ? n : null;
};

const readTime = (text: string) => {
  const match = TIME.exec(text.trim());

  return match ? `${pad(Number(match[1]))}:${match[2]}` : null;
};

/** What stops this row from saving, or null when it can. */
function entryProblem(entry: FormEntry, habit: Habit | undefined, now: Date): string | null {
  if (!habit) return "Pick a Habit.";
  const today = torontoDay(now);

  if (entry.date > today) return "Pick a day that isn't in the future.";

  if (habit.record === "count")
    return wholeNumber(entry.count, Number.MAX_SAFE_INTEGER) === null
      ? `Enter how many times for ${habit.name}.`
      : null;

  if (habit.record !== "duration") return null;

  if (wholeNumber(entry.minutes, MINUTES_PER_DAY) === null)
    return `Enter minutes for ${habit.name}, 1 to 1440.`;
  const start = readTime(entry.startTime);

  if (start === null) return `Enter when ${habit.name} started, like 08:30.`;

  return entry.date === today && start > formatMinutes(minuteOfDay(now))
    ? `${start} today hasn't come yet.`
    : null;
}

function logItemOf(entry: FormEntry, habit: Habit): LogItem {
  const note = cleanNote(entry.note);
  const base = { habit: habit.id, date: entry.date, ...(note !== "" && { note }) };

  switch (habit.record) {
    case "duration": {
      return {
        ...base,
        // An entry that reaches here passed `entryProblem`, so the time is H:MM or HH:MM.
        start_time: entry.startTime.trim().padStart(5, "0"),
        minutes: Number(entry.minutes),
      };
    }

    case "count": {
      return { ...base, count: Number(entry.count) };
    }

    case "check": {
      return base;
    }
  }
}

/** The model's guesses as a Habit form draft, the same fields the server's Create made from them. */
export const draftOfNewHabit = (habit: NewHabit): Draft => ({
  ...blankHabit(habit.kind),
  name: habit.name,
  record: habit.record,
  targetMinutes: habit.record === "duration" ? habit.target_minutes : null,
  target: { type: habit.target_type, count: habit.target_count, days: habit.target_days },
});

const orBlank = (current: string, offered: string | undefined) =>
  offered !== undefined && current.trim() === "" ? offered : current;

// A stacked cue names the Habit it comes after, as the form's "After what?" picker does.
function cueOf(current: Draft, details: HabitDetails): Pick<Draft, "cueType" | "stackedAfter"> {
  const cueType = current.cueType === "" ? (details.cue_type ?? "") : current.cueType;

  return {
    cueType,
    stackedAfter:
      cueType === "stacked"
        ? (current.stackedAfter ?? details.stacked_after ?? null)
        : current.stackedAfter,
  };
}

/** The model's details fill only the fields still blank, so anything the owner typed first wins. */
export const withDetails = (current: Draft, details: HabitDetails): Draft => ({
  ...current,
  ...cueOf(current, details),
  description: orBlank(current.description, details.description),
  usualWhen: orBlank(current.usualWhen, details.usual_when),
  goals: current.goals.length === 0 ? (details.goals ?? []) : current.goals,
});

interface Span {
  habit: string;
  date: string;
  start: number;
  minutes: number;
}

/** A Span of a form row, with the name of the Habit it logs for the warning. */
interface NamedSpan extends Span {
  name: string;
}

const DAY_MINUTES = 1440;

// Minutes since 1970-01-01, so an entry that runs past midnight meets the next day's.
const absoluteStart = ({ date, start }: Span) => Date.parse(`${date}T00:00:00Z`) / 60_000 + start;

const overlaps = (a: Span, b: Span) =>
  a.habit === b.habit &&
  absoluteStart(a) < absoluteStart(b) + b.minutes &&
  absoluteStart(b) < absoluteStart(a) + a.minutes;

function spanOf(entry: FormEntry, habits: Habit[]): NamedSpan | null {
  const habit = habits.find((h) => h.id === entry.habit);
  const start = readTime(entry.startTime);
  const minutes = wholeNumber(entry.minutes, DAY_MINUTES);

  return start === null || minutes === null || habit?.record !== "duration"
    ? null
    : { habit: habit.id, name: habit.name, date: entry.date, start: minutesOf(start), minutes };
}

const spanLabel = ({ start, minutes }: Span) =>
  `${clockLabel(formatMinutes(start))}–${clockLabel(formatMinutes((start + minutes) % DAY_MINUTES))}`;

function overlapWarnings(
  entries: FormEntry[],
  habits: Habit[],
  durations: Durations,
): (string | null)[] {
  const spans = entries.map((entry) => spanOf(entry, habits));

  return spans.map((span, index) => {
    if (span === null) return null;
    const { name } = span;

    const logged = [-1, 0, 1].flatMap((days) => {
      const date = shiftDay(span.date, days);

      return (durations[date]?.[span.habit] ?? []).map((e) => ({
        habit: span.habit,
        date,
        start: minutesOf(e.startTime),
        minutes: e.minutes,
      }));
    });

    const clash = logged.find((other) => overlaps(span, other));

    if (clash) return `Overlaps ${name} ${spanLabel(clash)}, already logged.`;

    return spans.slice(0, index).some((other) => other !== null && overlaps(span, other))
      ? `Overlaps another ${name} row.`
      : null;
  });
}

export const blankEntry = (now: Date) => formEntryOf({ habit: null }, now);

const DraftEntries = z.array(DraftEntry);

/** The log box's guesses arrive as JSON in `?draft`; one that doesn't parse opens a single blank row. */
export function openEntries(draft: string | undefined, now: Date): FormEntry[] {
  let entries: DraftEntry[] = [];

  try {
    entries = DraftEntries.safeParse(JSON.parse(draft ?? "")).data ?? [];
  } catch {
    // Not JSON: open a blank row like an empty draft.
  }

  return entries.length > 0 ? entries.map((entry) => formEntryOf(entry, now)) : [blankEntry(now)];
}

/** One row of the form as shown: its Habit, what stops it saving, and an overlap warning once nothing does. */
export interface LogFormRow {
  entry: FormEntry;
  habit: Habit | undefined;
  problem: string | null;
  overlap: string | null;
}

/** The form's rows, and what Save sends: `items` is null while any row has a problem. */
export interface LogForm {
  rows: LogFormRow[];
  items: LogItem[] | null;
}

/**
 * An overlap only warns, since two sessions can be real; `durations` holds the logged entries the form knows about.
 */
export function logForm(
  entries: FormEntry[],
  { habits, durations, now }: { habits: Habit[]; durations: Durations; now: Date },
): LogForm {
  const warnings = overlapWarnings(entries, habits, durations);

  const rows = entries.map((entry, index): LogFormRow => {
    const habit = habits.find((h) => h.id === entry.habit);
    const problem = entryProblem(entry, habit, now);

    return { entry, habit, problem, overlap: problem === null ? (warnings[index] ?? null) : null };
  });

  const items = rows.flatMap(({ entry, habit, problem }) =>
    habit && problem === null ? [logItemOf(entry, habit)] : [],
  );

  return { rows, items: items.length === rows.length ? items : null };
}
