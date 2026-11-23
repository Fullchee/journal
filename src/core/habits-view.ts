import * as z from "zod/mini";

import { clockLabel, dayOfWeek, shiftDay, torontoDay } from "./calendar";
import type { CheckIn } from "./check-in-view";
import { Season } from "./season";

export interface ChipCount {
  name: string;
  count: number;
}

/**
 * Each list below is the one source for its values: the TS type, the server's checks and the schema test derive from it.
 */
export const KINDS = ["good", "bad"] as const;

export const Kind = z.enum(KINDS);

export type Kind = z.infer<typeof Kind>;

export const STAGES = [
  { id: "seed", label: "Seed", icon: "🌱", hint: "Just started; needs daily attention" },
  { id: "sprout", label: "Sprout", icon: "🌿", hint: "Taking hold" },
  { id: "plant", label: "Plant", icon: "🪴", hint: "Mostly steady" },
  { id: "tree", label: "Tree", icon: "🌳", hint: "Automatic; hidden from the tracker" },
] as const;

export const Stage = z.enum(STAGES.map((s) => s.id));

export type Stage = z.infer<typeof Stage>;

export const PRIORITIES = [
  { id: "high", label: "High" },
  { id: "normal", label: "Normal" },
  { id: "low", label: "Low" },
] as const;

export const Priority = z.enum(PRIORITIES.map((p) => p.id));

export type Priority = z.infer<typeof Priority>;

export const RECORD_STYLES = ["check", "count", "duration"] as const;

export const RecordStyle = z.enum(RECORD_STYLES);

export type RecordStyle = z.infer<typeof RecordStyle>;

/** The repeating Target types: `none` marks a Reference Habit and `once` a One-off. */
export const TRACKED_TARGET_TYPES = ["daily", "weekly", "days", "monthly", "interval"] as const;

/**
 * The bounds of a counted Frequency's `count`: times a week, times a month, or the days between due days.
 * Every 1 day is Every day, so an interval starts at 2.
 */
const COUNT_RANGES = {
  weekly: { min: 1, max: 7 },
  monthly: { min: 1, max: 31 },
  interval: { min: 2, max: 30 },
} as const;

export type CountedTargetType = keyof typeof COUNT_RANGES;

export const isCountedTarget = (type: string): type is CountedTargetType =>
  Object.hasOwn(COUNT_RANGES, type);

/** The counts a Frequency allows; every day and fixed weekdays store 7, which the form never changes. */
export const targetCountRange = (type: string) =>
  isCountedTarget(type) ? COUNT_RANGES[type] : { min: 1, max: 7 };

/** The server stores a `once` Target as count 1 with no days; its Habit's `startDate` is the due date (ADR 0012). */
export const TARGET_TYPES = [...TRACKED_TARGET_TYPES, "none", "once"] as const;

const Target = z.object({
  type: z.enum(TARGET_TYPES),
  count: z.number(),
  days: z.array(z.number()),
});

export type Target = z.infer<typeof Target>;

/** The Target after picking another Frequency, its count moved into what that Frequency allows. */
export function withTargetType(target: Target, type: Target["type"]): Target {
  const { min, max } = targetCountRange(type);

  return { ...target, type, count: Math.min(max, Math.max(min, target.count)) };
}

/** Duhigg's five cue categories, with habit stacking as the sixth. */
/** In the form's order; `time` is the Scheduled cue, whose label depends on Kind (`cueChoices`). */
export const CUE_TYPES = [
  { id: "time", label: "Scheduled" },
  { id: "stacked", label: "Stacked habit" },
  { id: "action", label: "Previous Action" },
  { id: "emotion", label: "Emotional State" },
  { id: "people", label: "People" },
  { id: "location", label: "Location" },
] as const;

export const CueType = z.enum(CUE_TYPES.map((c) => c.id));

export type CueType = z.infer<typeof CueType>;

export const ALARM_KINDS = ["alarm", "persistent"] as const;

/** A Habit's alarm: `time` is HH:MM; an `alarm` rings with sound, a `persistent` one shows quietly. */
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** A 24-hour time of day, HH:MM. */
export const ClockTime = z.string().check(z.regex(CLOCK_TIME));

/** A Habit's usual start time as HH:MM, or "" when it has none. */
export const UsualWhen = z.union([z.literal(""), ClockTime]);

const Alarm = z.object({ time: z.string(), kind: z.enum(ALARM_KINDS) });

export type Alarm = z.infer<typeof Alarm>;

/** A pickable Goal; `state` lets the form mark a retired one. */
export const Goal = z.object({
  id: z.number(),
  title: z.string(),
  state: z.enum(["active", "achieved", "retired"]),
});

export type Goal = z.infer<typeof Goal>;

export const Habit = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  why: z.string(),
  /** The form's Time; Today orders Habits by it when there is no alarm (`habitTime`). */
  usualWhen: UsualWhen,
  /** The usual spot, free text finer than `places`; the editor no longer shows it, and a save keeps the stored value. */
  usualWhere: z.string(),
  /** Check-in places where the Habit can be done; empty means anywhere (`fitsPlace`). */
  places: z.array(z.string()),
  kind: Kind,
  stage: Stage,
  priority: Priority,
  active: z.boolean(),
  /** Logged by an import, such as Hevy workouts, instead of by hand; Today leaves it out. */
  autoLogged: z.boolean(),
  /** The Day it became Opt-out, done on each due day unless I Skip; null when it isn't. Earlier days never count. */
  optOutFrom: z.nullable(z.string()),
  /** An Opt-out `duration` Habit's usual length: each counted day logs one Duration entry of it. */
  usualMinutes: z.nullable(z.number()),
  startDate: z.string(),
  cue: z.string(),
  cueType: z.union([CueType, z.literal("")]),
  routine: z.string(),
  reward: z.string(),
  obstacles: z.array(z.string()),
  replaces: z.nullable(z.string()),
  stackedAfter: z.nullable(z.string()),
  target: Target,
  record: RecordStyle,
  /**
   * A `duration` Habit's minutes a day: a minimum for `good`, a ceiling for `bad`. Null for the other Record styles.
   */
  targetMinutes: z.nullable(z.number()),
  goals: z.array(z.number()),
  alarm: z.nullable(Alarm),
  /** When a recurring Habit is due, earliest first; empty means all year. */
  seasons: z.array(Season),
  /** Today doesn't ask whether a Season started on or before this day. */
  seasonQuietUntil: z.nullable(z.string()),
  /** The smallest form that still counts as Done, offered on Rain and Storm days; empty when it has none. */
  tinyVersion: z.string(),
});

export type Habit = z.infer<typeof Habit>;

/** A `duration` Habit always has its minutes a day; the server refuses one without. */
export type TimedHabit = Habit & { record: "duration"; targetMinutes: number };

export const isTimed = (habit: Habit): habit is TimedHabit => habit.record === "duration";

/** One occurrence of a `duration` Habit: a local HH:MM start and its minutes. */
const DurationEntry = z.object({
  id: z.number(),
  startTime: z.string(),
  minutes: z.number(),
});

export type DurationEntry = z.infer<typeof DurationEntry>;

/** `durations` maps an ISO date to each `duration` Habit's entries that day, earliest first. */
export const Durations = z.record(z.string(), z.record(z.string(), z.array(DurationEntry)));

export type Durations = z.infer<typeof Durations>;

/** The longest note a Duration entry or a Habit check keeps: one line. */
export const MAX_NOTE = 200;

/** `notes` maps an ISO date to each Habit's non-empty notes that day: its Duration entries' by start, then its check's. */
const HabitNotes = z.record(z.string(), z.array(z.string()));

export const DayNotes = z.record(z.string(), HabitNotes);

export type DayNotes = z.infer<typeof DayNotes>;

/** A note as stored: one line, trimmed, at most MAX_NOTE characters. */
export const cleanNote = (note: string) => note.replaceAll(/\s+/g, " ").trim().slice(0, MAX_NOTE);

/** `outside`: weather, a cancellation, someone else's plans; `avoidance`: I put it off. */
export const RESCHEDULE_CAUSES = ["outside", "avoidance"] as const;

/** One move of a One-off to a new date; history is never overwritten. */
export const Reschedule = z.object({
  from: z.string(),
  to: z.string(),
  cause: z.enum(RESCHEDULE_CAUSES),
  /** Empty when none was given. */
  note: z.string(),
  createdAt: z.string(),
});

export type Reschedule = z.infer<typeof Reschedule>;

/** `reschedules` maps a One-off's id to its Reschedules, earliest first. */
export const Reschedules = z.record(z.string(), z.array(Reschedule));

export type Reschedules = z.infer<typeof Reschedules>;

/** Why a recurring Habit was skipped on a day; the day itself is stored as Not done. */
export const Skip = z.object({
  cause: z.enum(RESCHEDULE_CAUSES),
  /** Empty when none was given. */
  note: z.string(),
});

export type Skip = z.infer<typeof Skip>;

/** `skips` maps an ISO date to each skipped Habit's cause that day; a Skip with no cause has no entry. */
export const Skips = z.record(z.string(), z.record(z.string(), Skip));

export type Skips = z.infer<typeof Skips>;

const CAUSE_LABELS = { outside: "Outside", avoidance: "Avoidance" } as const;

/** A Reschedule's or a Skip's cause as history shows it, with the note after it when there is one. */
export const causeLine = ({ cause, note }: Pick<Skip, "cause" | "note">) =>
  note === "" ? CAUSE_LABELS[cause] : `${CAUSE_LABELS[cause]}: ${note}`;

export type Draft = Omit<Habit, "id"> & { id?: string };

/**
 * Wording that changes with Kind: a good habit has a target and "I will"; a bad one has a limit and "I usually".
 */
export const KIND_COPY: Record<
  Kind,
  {
    target: string;
    scheduledCue: string;
    cue: string;
    routine: string;
    routineLead: string;
    schedule: string;
    recordDefault: RecordStyle;
  }
> = {
  good: {
    target: "Frequency",
    scheduledCue: "Scheduled",
    cue: "After / when…",
    routine: "I will…",
    routineLead: "I will",
    schedule: "Due",
    recordDefault: "check",
  },
  bad: {
    target: "Limit",
    // "Scheduled" reads as a plan, which a bad habit isn't.
    scheduledCue: "Time",
    cue: "When…",
    routine: "I usually…",
    routineLead: "I usually",
    schedule: "At most",
    recordDefault: "count",
  },
};

/** A Habit's time of day as HH:MM: its Alarm, else its usual when; null when it has neither. */
export const habitTime = ({ alarm, usualWhen }: Pick<Habit, "alarm" | "usualWhen">) =>
  alarm?.time ?? (usualWhen === "" ? null : usualWhen);

/** The cue picker's choices; Places covers location, so it shows only while an older Habit still holds it. */
export function cueChoices(kind: Kind, current: CueType | "") {
  const choices: { id: CueType; label: string }[] = [];

  for (const { id, label } of CUE_TYPES)
    if (current === "location" || id !== "location")
      choices.push({ id, label: id === "time" ? KIND_COPY[kind].scheduledCue : label });

  return choices;
}

/** What a cue still needs before save: a stacked cue the Habit it follows, a Scheduled cue its time. A One-off has no cue. */
export function cueMissing(habit: Draft) {
  if (isOneOff(habit)) return null;

  if (habit.cueType === "stacked" && habit.stackedAfter === null) return "stacked";

  return habit.cueType === "time" && habitTime(habit) === null ? "time" : null;
}

/** The editor's empty new Habit: a good one starts with a Scheduled cue. */
export const newHabitDraft = (kind: Kind): Draft => ({
  ...blankHabit(kind),
  cueType: kind === "good" ? "time" : "",
});

export const stageOf = (stage: Stage) => STAGES.find((s) => s.id === stage);

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Nov". */
export const dayMonthLabel = (day: string) =>
  `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

/** "Sat 14 Nov". */
export const dueDateLabel = (day: string) => `${WEEKDAYS[dayOfWeek(day)]} ${dayMonthLabel(day)}`;

/** The tracker needs this week so far, within the last 7 days, and this month so far for an N× a month Habit. */
export function checksSince(now = new Date()) {
  const today = torontoDay(now);
  const weekBack = shiftDay(today, -6);
  const monthStart = `${today.slice(0, 7)}-01`;

  return monthStart < weekBack ? monthStart : weekBack;
}

/** `counts` maps an ISO date to each habit's count that day. */
export const Counts = z.record(z.string(), z.record(z.string(), z.number()));

export type Counts = z.infer<typeof Counts>;

const RECORD_SUFFIX = { count: "counted", duration: "timed" } as const;

/**
 * "Every day", "3× a week", "Mon, Wed", "2× a month", "Every 3 days", "Once, Sat 14 Nov" or "Reference";
 * a counted or timed habit says so.
 */
export const scheduleLabel = ({ target, record, startDate }: Habit) => {
  const when = {
    daily: "Every day",
    weekly: `${target.count}× a week`,
    days: target.days.map((d) => WEEKDAYS[d]).join(", "),
    monthly: `${target.count}× a month`,
    interval: `Every ${target.count} days`,
    none: "Reference",
    once: `Once, ${dueDateLabel(startDate)}`,
  }[target.type];

  return record === "check" || target.type === "none" ? when : `${when}, ${RECORD_SUFFIX[record]}`;
};

/** A Reference Habit has no target; it is prose for the Library, never tracked. */
export const isReference = ({ target }: Habit) => target.type === "none";

/** A One-off is a Habit with a `once` Target; its start date is its due date (ADR 0012). */
export const isOneOff = ({ target }: Pick<Habit, "target">) => target.type === "once";

/**
 * A One-off moves through a Reschedule so the Session brief sees it; a plain date fix hides no avoidance
 * only while its date hasn't come and it was never moved. Matches journal's rule for habit edits.
 */
export const canFixDate = (
  { startDate }: Pick<Habit, "startDate">,
  reschedules: Reschedule[],
  today: string,
) => canFixStartDate(startDate, reschedules.length > 0, today);

/** The date-fix rule alone: any earlier Reschedule, or a date already come, turns the move into one. */
export const canFixStartDate = (startDate: string, hadReschedule: boolean, today: string) =>
  !hadReschedule && startDate > today;

/** Only a good recurring Habit has a Tiny version: a weed, a One-off and a Reference Habit never ask for one. */
export const hasTinyVersion = ({ kind, target }: { kind: Kind; target: Pick<Target, "type"> }) =>
  kind === "good" && target.type !== "once" && target.type !== "none";

/** Today offers Tiny versions while the day's newest Check-in is Rain or Storm. */
export function isTinyDay(checkIns: Pick<CheckIn, "checkedInAt" | "zone">[], now: Date) {
  const today = torontoDay(now);

  const newest = checkIns
    .filter((c) => torontoDay(c.checkedInAt) === today)
    .toSorted((a, b) => Date.parse(b.checkedInAt) - Date.parse(a.checkedInAt))
    .at(0);

  return newest?.zone === "Rain" || newest?.zone === "Storm";
}

/** The weekly Habit tracker counts repeating Habits only. */
export const inTracker = (habit: Habit) => !isReference(habit) && !isOneOff(habit);

/** Reference Habits for the Library, by name. */
export const libraryHabits = (habits: Habit[]) =>
  habits.filter((h) => isReference(h)).toSorted((a, b) => a.name.localeCompare(b.name));

/** Tracked Habits have their own page, so the Library opens only references. */
export const libraryHabit = (habits: Habit[], id: string) =>
  habits.find((h) => h.id === id && isReference(h));

export const blankHabit = (kind: Kind): Draft => ({
  name: "",
  description: "",
  why: "",
  usualWhen: "",
  usualWhere: "",
  places: [],
  kind,
  stage: "seed",
  priority: "normal",
  active: true,
  autoLogged: false,
  optOutFrom: null,
  usualMinutes: null,
  startDate: torontoDay(new Date()),
  cue: "",
  cueType: "",
  routine: "",
  reward: "",
  obstacles: [],
  replaces: null,
  stackedAfter: null,
  target: { type: "daily", count: 7, days: [] },
  record: KIND_COPY[kind].recordDefault,
  targetMinutes: null,
  goals: [],
  alarm: null,
  seasons: [],
  seasonQuietUntil: null,
  tinyVersion: "",
});

/** Built-in obstacles plus ones used on other habits, most used first. */
export const obstacleSuggestions = (habits: Habit[], builtIn: readonly string[]): ChipCount[] => {
  const counts = new Map(builtIn.map((name) => [name, 0]));

  const used = habits.flatMap((h) => h.obstacles);

  for (const name of used) counts.set(name, (counts.get(name) ?? 0) + 1);

  return [...counts].map(([name, count]) => ({ name, count }));
};

/** Adds the weekday when missing and removes it when present. */
export const toggleDay = (days: number[], day: number) =>
  (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]).toSorted((a, b) => a - b);

export function targetWhen({ type, count, days }: Target) {
  switch (type) {
    case "none": {
      return "no target";
    }

    case "days": {
      return days.map((d) => WEEKDAYS[d]).join(", ");
    }

    case "weekly": {
      return `${count}× a week`;
    }

    case "monthly": {
      return `${count}× a month`;
    }

    case "interval": {
      return `every ${count} days`;
    }

    case "daily": {
      return "every day";
    }

    case "once": {
      return "once";
    }
  }
}

const recordWhen = ({ record, kind, targetMinutes }: Draft) => {
  const bound = kind === "bad" ? "at most" : "at least";

  return {
    check: "checked once a day",
    count: "counted each time",
    // The form shows this before the minutes field is filled in.
    duration: targetMinutes === null ? "timed" : `timed, ${bound} ${targetMinutes} min a day`,
  }[record];
};

// The form allows an empty start date while it is being edited; the server refuses a One-off without one.
const oneOffSummary = ({ startDate }: Draft) =>
  `Once, ${startDate === "" ? "pick a date" : dueDateLabel(startDate)}`;

export const scheduleSummary = (habit: Draft) => {
  if (habit.target.type === "none") return "Reference only: never in the tracker";

  if (habit.target.type === "once") return oneOffSummary(habit);

  return `${KIND_COPY[habit.kind].schedule} ${targetWhen(habit.target)}, ${recordWhen(habit)}`;
};

/** The good habits that name this bad habit in `replaces`. */
export const replacedBy = <T extends Pick<Habit, "replaces">>(habits: T[], id: string) =>
  habits.filter((h) => h.replaces === id);

/** Habits that may come before `id` without a loop: not itself, and not one that already comes after it. */
export const stackCandidates = (habits: Habit[], id?: string) => {
  const comesAfter = (habit: Habit) => {
    const seen = new Set<string>();

    for (
      let link: string | null = habit.id;
      link !== null && !seen.has(link);
      link = habits.find((h) => h.id === link)?.stackedAfter ?? null
    ) {
      if (link === id) return true;

      seen.add(link);
    }

    return false;
  };

  return id === undefined ? habits : habits.filter((h) => !comesAfter(h));
};

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const TRIGGER_WORDS = /^(?:after|when|before|if|once)\b/i;

const ENDS_SENTENCE = /[.!?\u{22}\u{201D}\u{27})]$/u;

const endSentence = (text: string) => (ENDS_SENTENCE.test(text) ? text : `${text}.`);

function triggerOf(cue: string, stackedAfter: string | null, nameOf: (id: string) => string) {
  if (cue !== "") return TRIGGER_WORDS.test(cue) ? cue : `When ${cue}`;

  return stackedAfter === null ? "" : `After “${nameOf(stackedAfter)}”`;
}

/**
 * "When <cue>, I will <routine> at <when>." with empty parts left out;
 * a Scheduled cue with a time opens with "At <time>" instead.
 */
export const loopSentence = (habit: Draft, nameOf: (id: string) => string) => {
  const cue = habit.cue.trim();
  const routine = habit.routine.trim();
  const { routineLead } = KIND_COPY[habit.kind];

  const time = habit.cueType === "time" ? habitTime(habit) : null;

  // A Scheduled cue's time opens the sentence, so it isn't repeated after the routine.
  const usualWhen =
    time === null && habit.usualWhen !== "" ? ` at ${clockLabel(habit.usualWhen)}` : "";

  const doing = routine === "" ? "do it" : lowerFirst(routine);
  const action = routine === "" && usualWhen === "" ? "" : `${routineLead} ${doing}${usualWhen}`;

  const sentence = [
    time === null ? triggerOf(cue, habit.stackedAfter, nameOf) : `At ${clockLabel(time)}`,
    action,
  ]
    .filter((part) => part !== "")
    .join(", ");

  return sentence === "" ? "" : endSentence(upperFirst(sentence));
};

/** Imported Habits open their description with "# <name>"; the card already shows the name as its title. */
export const descriptionBody = ({ name, description }: Pick<Habit, "name" | "description">) => {
  const first = description.split("\n", 1).join("");
  const title = /^#{1,6}\s+(\S.*)$/.exec(first.trim())?.[1]?.trim();

  return title === name.trim() ? description.slice(first.length + 1).trimStart() : description;
};
