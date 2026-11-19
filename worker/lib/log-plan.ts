import {
  clockLabel,
  formatDay,
  formatMinutes,
  KINDS,
  minutesLabel,
  minutesOf,
  RECORD_STYLES,
  shiftDay,
  type DraftOneOff,
  type Habit,
  type LogEntry,
  type NewHabit,
} from "@/core";
import * as z from "zod/mini";
import { DATE, isMinutes, MAX_COUNT } from "./habit-records";
import {
  MAX_TEXT,
  type ModelCreate,
  type ModelItem,
  type ModelOneOff,
  type ModelReply,
} from "./log-thread";

/** What the log box knows about a Habit; the model sees the same fields. */
export type LogHabit = Pick<Habit, "id" | "name" | "kind" | "record" | "targetMinutes">;

/** `today` and `time` are Toronto wall-clock, like habit_checks.date and alarm_time. */
export interface LogContext {
  habits: LogHabit[];
  today: string;
  time: string;
}

/** One checked write. A `check` Habit's count is always 1; a `count` Habit's count is what to add. */
export type Write =
  | {
      record: "duration";
      habit: LogHabit;
      date: string;
      startTime: string;
      minutes: number;
      endedNow: boolean;
    }
  | { record: "check" | "count"; habit: LogHabit; date: string; count: number };

/** Why an entry can't be saved, as a question to the owner. */
export interface Ask {
  type: "ask";
  text: string;
}

export type Plan = Ask | { type: "write"; writes: Write[] };

// A new `duration` Habit needs a bar; an hour is a guess the owner can edit on the Habit page.
const DEFAULT_TARGET_MINUTES = 60;
const MAX_NAME = 200;
const MINUTES_PER_DAY = 1440;
const TIME = /^(\d{1,2}):([0-5]\d)$/;

export const ASK_AGAIN: Ask = {
  type: "ask",
  text: "I couldn't tell what to log. Name the Habit and say how long or how many times.",
};

const ask = (text: string): Ask => ({ type: "ask", text });

const timeOf = (minute: number) => formatMinutes(minute % MINUTES_PER_DAY);

export const spanLabel = ({ startTime, minutes }: { startTime: string; minutes: number }) =>
  `${clockLabel(startTime)}–${clockLabel(timeOf(minutesOf(startTime) + minutes))}`;

/** The earliest date the writes touch, or `fallback` when there are none. */
export const earliestDate = (writes: Write[], fallback: string) =>
  writes.map((w) => w.date).toSorted((a, b) => a.localeCompare(b))[0] ?? fallback;

/** "today", "yesterday" or "Tue, Nov 3". */
export function dayLabel(date: string, today: string) {
  if (date === today) return "today";

  if (date === shiftDay(today, -1)) return "yesterday";

  return formatDay(date, { weekday: "short", month: "short", day: "numeric" });
}

export const isRealDate = (date: string) =>
  DATE.test(date) &&
  !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
  new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);

/** "8:00" and "08:00" both read as "08:00"; anything else is null. */
export function readTime(value: string) {
  const match = TIME.exec(value);

  const [, hour = "", minute = ""] = match ?? [];

  return match === null || Number(hour) > 23 ? null : `${hour.padStart(2, "0")}:${minute}`;
}

const unknownHabit = (name: string) =>
  ask(name === "" ? "Which Habit was that?" : `Which Habit is "${name}"?`);

const countOf = (value: number | undefined) =>
  value !== undefined && Number.isSafeInteger(value) && value >= 1 ? value : 1;

function durationWrite(
  habit: LogHabit,
  date: string,
  item: ModelItem,
  ctx: LogContext,
): Write | Ask {
  const { minutes, start_time: start } = item;

  if (!isMinutes(minutes)) return ask(`How many minutes of ${habit.name}?`);

  if (start !== undefined) {
    const startTime = readTime(start);

    if (startTime === null) return ask(`What time did ${habit.name} start?`);

    if (date === ctx.today && startTime > ctx.time)
      return ask(
        `${clockLabel(startTime)} today hasn't come yet. What time did ${habit.name} start?`,
      );

    return { record: "duration", habit, date, startTime, minutes, endedNow: false };
  }

  // "Ended just now" only means something today.
  if (date !== ctx.today) return ask(`What time did ${habit.name} start?`);
  const startMinute = minutesOf(ctx.time) - minutes;

  // An entry that started before midnight belongs to the day it started, like any entry that runs past midnight.
  return startMinute >= 0
    ? { record: "duration", habit, date, startTime: timeOf(startMinute), minutes, endedNow: true }
    : {
        record: "duration",
        habit,
        date: shiftDay(date, -1),
        startTime: timeOf(startMinute + MINUTES_PER_DAY),
        minutes,
        endedNow: true,
      };
}

function resolveItem(item: ModelItem | null, ctx: LogContext): Write | Ask {
  if (item === null) return ASK_AGAIN;
  const habit = ctx.habits.find((h) => h.id === item.habit);

  if (!habit) return unknownHabit(item.habit ?? "");

  const { date = ctx.today } = item;

  if (!isRealDate(date) || date > ctx.today) return ask(`Which day was ${habit.name}?`);

  if (habit.record === "duration") return durationWrite(habit, date, item, ctx);

  return {
    record: habit.record,
    habit,
    date,
    count: habit.record === "check" ? 1 : countOf(item.count),
  };
}

/** Every item must check out; the first that doesn't becomes the question, and nothing is written. */
export function resolveItems(items: (ModelItem | null)[] | undefined, ctx: LogContext): Plan {
  if (items === undefined || items.length === 0) return ASK_AGAIN;
  const writes: Write[] = [];

  for (const item of items) {
    const resolved = resolveItem(item, ctx);

    if ("type" in resolved) return resolved;
    writes.push(resolved);
  }

  return { type: "write", writes };
}

const isOneOf = <Value extends string>(
  list: readonly Value[],
  value: string | undefined,
): value is Value => list.some((entry) => entry === value);

/** Only the fields the model gave, so the form leaves the rest empty. */
export function entryOf({ date, start_time, minutes, count }: ModelItem): LogEntry {
  return {
    ...(date !== undefined && { date }),
    ...(start_time !== undefined && { start_time }),
    ...(minutes !== undefined && { minutes }),
    ...(count !== undefined && { count }),
  };
}

const Weekdays = z.array(z.int().check(z.gte(0), z.lte(6))).check(z.minLength(1));

const WeeklyCount = z.int().check(z.gte(1), z.lte(7));

type Schedule = Pick<NewHabit, "target_type" | "target_count" | "target_days">;

// The owner confirms every guess, so a missing or broken schedule falls back to daily rather than asking.
function scheduleOf({
  target_type: type,
  target_count: count,
  target_days: days,
}: ModelCreate): Schedule {
  const weekly = WeeklyCount.safeParse(count).data;

  if (type === "weekly" && weekly !== undefined)
    return { target_type: type, target_count: weekly, target_days: [] };
  const weekdays = Weekdays.safeParse(days).data;

  if (type === "days" && weekdays !== undefined)
    return {
      target_type: type,
      target_count: 7,
      target_days: [...new Set(weekdays)].toSorted((a, b) => a - b),
    };

  return { target_type: "daily", target_count: 7, target_days: [] };
}

/** A new Habit the model proposed, with every field checked; the owner confirms it in the form before it is made. */
export function readCreate(
  create: ModelCreate | null | undefined,
): { habit: NewHabit; entry: LogEntry } | null {
  if (create === null || create === undefined) return null;
  const { name, kind, record, target_minutes: target, date, start_time, minutes, count } = create;

  if (
    name === undefined ||
    name.trim() === "" ||
    name.length > MAX_NAME ||
    !isOneOf(KINDS, kind) ||
    !isOneOf(RECORD_STYLES, record)
  )
    return null;

  return {
    habit: {
      name: name.trim(),
      kind,
      record,
      target_minutes: isMinutes(target) ? target : DEFAULT_TARGET_MINUTES,
      ...scheduleOf(create),
    },
    entry: entryOf({ date, start_time, minutes, count }),
  };
}

const present = <Value>(list: (Value | null)[] | undefined) =>
  (list ?? []).filter((value): value is Value => value !== null);

/** Candidate ids, from `habits` or, when the model ignores the prompt, ids it put in `options`. */
export const candidateIds = ({ habits, options }: ModelReply) =>
  [...present(habits), ...present(options)].map((id) => id.trim().toLowerCase());

const wordsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "short",
});

/** "Saturday 14 Nov": a One-off is planned ahead, so its day is named in full rather than as "today". */
export function dayInWords(date: string) {
  const p = Object.fromEntries(
    wordsFormat.formatToParts(new Date(`${date}T00:00:00Z`)).map((part) => [part.type, part.value]),
  );

  return `${p["weekday"]} ${p["day"]} ${p["month"]}`;
}

/** A One-off is due from its date on, so a date before today is a log of something done, not a plan. */
export const isDueDate = (date: string | undefined, today: string): date is string =>
  date !== undefined && isRealDate(date) && date >= today;

/** The model's One-off with every field checked; a missing or past date is left out, so the owner is asked which day. */
export function readOneOff(
  model: ModelOneOff | null | undefined,
  today: string,
): DraftOneOff | null {
  if (model === null || model === undefined) return null;
  const { name, date, time, why } = model;

  if (name === undefined || name.trim() === "" || name.length > MAX_NAME) return null;
  const clock = time === undefined ? null : readTime(time);

  return {
    name: name.trim(),
    ...(isDueDate(date, today) && { date }),
    why: why !== undefined && why.length <= MAX_TEXT ? why.trim() : "",
    usual_when: clock ?? "",
  };
}

export const whichDay = (name: string) => `Which day is ${name}?`;

/** `dayTotal` is the day's minutes for a `duration` Habit and the day's count otherwise, after this write. */
export function receiptLine(write: Write, dayTotal: number, today: string) {
  const { habit, date } = write;
  const day = dayLabel(date, today);

  if (write.record !== "duration")
    return write.record === "check"
      ? `Logged ${habit.name} for ${day}.`
      : `Logged ${habit.name}: +${write.count} (${day} ${dayTotal}).`;

  const bar = habit.targetMinutes === null ? "" : ` of ${minutesLabel(habit.targetMinutes)}`;
  const ended = write.endedNow ? ", ended just now" : "";

  return `Logged ${habit.name}: ${minutesLabel(write.minutes)} at ${clockLabel(write.startTime)}${ended} (${day} ${minutesLabel(dayTotal)}${bar}).`;
}

export const capCount = (count: number) => Math.min(count, MAX_COUNT);
