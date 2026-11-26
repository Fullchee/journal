import * as z from "zod/mini";

import { clockLabel, dayOfWeek, shiftDay, torontoDay } from "./calendar";
import type { CheckIn } from "./check-in-view";
import { Season } from "./season";

/**
 * Each list below is the one source for its values: the TS type, the server's checks and the schema test derive from it.
 */
export const KINDS = ["good", "bad"] as const;

export const Kind = z.enum(KINDS);

export type Kind = z.infer<typeof Kind>;

const STAGE_IDS = ["seed", "sprout", "plant", "tree"] as const;

/** A recurring good Habit's Stage is read from its Strength and its tree answers, never stored (ADR 0016). */
export type Stage = (typeof STAGE_IDS)[number];

export const STAGE_LABELS = {
  seed: "Seed",
  sprout: "Sprout",
  plant: "Plant",
  tree: "Tree",
} as const satisfies Record<Stage, string>;

export const STAGES = STAGE_IDS.map((id) => ({ id, label: STAGE_LABELS[id] }));

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

/**
 * The anchor a Habit comes after (Fogg): Duhigg's five cue categories, with habit stacking as the sixth. Each label
 * answers "After what?"; `time` is the Scheduled cue, whose label depends on Kind (`cueChoices`).
 */
export const CUE_TYPES = [
  { id: "time", label: "A set time" },
  { id: "stacked", label: "Another habit" },
  { id: "action", label: "Something I did" },
  { id: "emotion", label: "A feeling" },
  { id: "people", label: "Being with people" },
  { id: "location", label: "Arriving somewhere" },
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
/** One stretch as a tree: from the Day I answered yes; `end` is the Day I tapped Slipped, null until then. */
export const TreeSpan = z.object({ start: z.string(), end: z.nullable(z.string()) });

export type TreeSpan = z.infer<typeof TreeSpan>;

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
  /** The form's Time; Today orders Habits by it when there is no alarm (`habitTime`). */
  usualWhen: UsualWhen,
  /** Check-in places where the Habit can be done; empty means anywhere (`fitsPlace`). */
  places: z.array(z.string()),
  kind: Kind,
  /** Each time I said yes to "Do you do this without thinking?", earliest first. */
  trees: z.array(TreeSpan),
  /** The card doesn't ask the tree question before this Day; null when Not yet was never tapped. */
  treeAskFrom: z.nullable(z.string()),
  priority: Priority,
  active: z.boolean(),
  /** Logged by an import, such as Hevy workouts, instead of by hand; Today leaves it out. */
  autoLogged: z.boolean(),
  /** The Day it became Opt-out, done on each due day unless I Skip; null when it isn't. Earlier days never count. */
  optOutFrom: z.nullable(z.string()),
  /** An Opt-out `duration` Habit's usual length: each counted day logs one Duration entry of it. */
  usualMinutes: z.nullable(z.number()),
  startDate: z.string(),
  /** What the Habit comes after: a time, another Habit (`stackedAfter`) or a kind of moment; "" when unset. */
  cueType: z.union([CueType, z.literal("")]),
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
    routineLead: string;
    schedule: string;
    recordDefault: RecordStyle;
  }
> = {
  good: {
    target: "Frequency",
    scheduledCue: "A set time",
    routineLead: "I will",
    schedule: "Due",
    recordDefault: "check",
  },
  bad: {
    target: "Limit",
    // "A set time" reads as a plan, which a bad habit isn't.
    scheduledCue: "A time of day",
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

/** The editor's empty new Habit: a good one starts with a Scheduled cue. */
export const newHabitDraft = (kind: Kind): Draft => ({
  ...blankHabit(kind),
  cueType: kind === "good" ? "time" : "",
});

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
  usualWhen: "",
  places: [],
  kind,
  trees: [],
  treeAskFrom: null,
  priority: "normal",
  active: true,
  autoLogged: false,
  optOutFrom: null,
  usualMinutes: null,
  startDate: torontoDay(new Date()),
  cueType: "",
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

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const afterHabit = (stackedAfter: string | null, nameOf: (id: string) => string) =>
  stackedAfter === null ? "" : `After “${nameOf(stackedAfter)}”`;

/**
 * "After <anchor>, I will do “<name>” at <when>." A Scheduled cue with a time opens with "At <time>" instead. Empty
 * when there is neither an anchor nor a time, since the sentence would only repeat the name.
 */
export const loopSentence = (habit: Draft, nameOf: (id: string) => string) => {
  const time = habit.cueType === "time" ? habitTime(habit) : null;

  // A Scheduled cue's time opens the sentence, so it isn't repeated after the action.
  const usualWhen =
    time === null && habit.usualWhen !== "" ? ` at ${clockLabel(habit.usualWhen)}` : "";

  const anchor = time === null ? afterHabit(habit.stackedAfter, nameOf) : `At ${clockLabel(time)}`;

  if (anchor === "" && usualWhen === "") return "";

  const name = habit.name.trim();
  const doing = name === "" ? "do it" : `do “${name}”`;
  const action = `${KIND_COPY[habit.kind].routineLead} ${doing}${usualWhen}`;

  return `${upperFirst([anchor, action].filter((part) => part !== "").join(", "))}.`;
};

/** Imported Habits open their description with "# <name>"; the card already shows the name as its title. */
export const descriptionBody = ({ name, description }: Pick<Habit, "name" | "description">) => {
  const first = description.split("\n", 1).join("");
  const title = /^#{1,6}\s+(\S.*)$/.exec(first.trim())?.[1]?.trim();

  return title === name.trim() ? description.slice(first.length + 1).trimStart() : description;
};
