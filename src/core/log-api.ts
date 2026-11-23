import * as z from "zod/mini";

import { CueType, Kind, RecordStyle, TRACKED_TARGET_TYPES, UsualWhen } from "./habits-view";

/** One entry to log, in the server's snake_case; the server checks every field. */
const LogItem = z.object({
  habit: z.string(),
  date: z.optional(z.string()),
  start_time: z.optional(z.string()),
  minutes: z.optional(z.number()),
  count: z.optional(z.number()),
  /** What the time or check was spent on, such as "Android wrapper". */
  note: z.optional(z.string()),
});

export type LogItem = z.infer<typeof LogItem>;

/** What a sentence said about one entry, before it names a Habit. */
export const LogEntry = z.omit(LogItem, { habit: true });

export type LogEntry = z.infer<typeof LogEntry>;

/** The model's guesses for a new Habit, which the owner edits in the Habit form before Create. */
export const NewHabit = z.object({
  name: z.string(),
  kind: Kind,
  record: RecordStyle,
  target_minutes: z.number(),
  target_type: z.enum(TRACKED_TARGET_TYPES),
  target_count: z.number(),
  target_days: z.array(z.number()),
});

export type NewHabit = z.infer<typeof NewHabit>;

const Strings = z.array(z.string());
const NullableId = z.nullable(z.string());
const GoalIds = z.array(z.number());

/** POST /api/habits/draft: the model's habit-loop guesses for a new Habit; any field it couldn't guess is missing. */
export const HabitDetails = z.object({
  description: z.optional(z.string()),
  why: z.optional(z.string()),
  usual_when: z.optional(UsualWhen),
  usual_where: z.optional(z.string()),
  cue: z.optional(z.string()),
  cue_type: z.optional(CueType),
  routine: z.optional(z.string()),
  reward: z.optional(z.string()),
  obstacles: z.optional(Strings),
  stacked_after: z.optional(NullableId),
  goals: z.optional(GoalIds),
});

export type HabitDetails = z.infer<typeof HabitDetails>;

/** A One-off to add, in the server's snake_case: a Habit done once, due on `date`. */
const NewOneOff = z.object({
  name: z.string(),
  date: z.string(),
  why: z.string(),
  usual_when: UsualWhen,
});

export type NewOneOff = z.infer<typeof NewOneOff>;

/** A drafted One-off; `date` is missing when the sentence named no day. */
export const DraftOneOff = z.extend(NewOneOff, { date: z.optional(z.string()) });

export type DraftOneOff = z.infer<typeof DraftOneOff>;

/** A proposed entry; `habit` is null when the model named no known Habit, so the owner picks one. */
export const DraftEntry = z.extend(LogEntry, { habit: z.nullable(z.string()) });

export type DraftEntry = z.infer<typeof DraftEntry>;

/** POST /api/log/draft: the model's guess, which opens a form; nothing is written until the owner saves. */
export const LogDraft = z.discriminatedUnion("type", [
  z.object({ type: z.literal("entries"), entries: z.array(DraftEntry) }),
  z.object({ type: z.literal("create"), habit: NewHabit, entry: LogEntry }),
  // `text` names the day in words, or asks which day it is.
  z.object({ type: z.literal("one-off"), one_off: DraftOneOff, text: z.string() }),
  z.object({ type: z.literal("unclear"), text: z.string() }),
]);

export type LogDraft = z.infer<typeof LogDraft>;

/** POST /api/log/entries and /api/log/one-off: `action` names the log_actions row the save wrote. */
export const Logged = z.object({ type: z.literal("logged"), text: z.string(), action: z.number() });

export type Logged = z.infer<typeof Logged>;

export const LOG_FAILED = "Couldn't reach the log box. Check your connection and try again.";
