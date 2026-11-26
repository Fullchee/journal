import * as z from "zod/mini";

import { normalizePlaces } from "./habit-places";
import {
  ALARM_KINDS,
  blankHabit,
  ClockTime,
  CueType,
  habitTime,
  hasTinyVersion,
  Kind,
  Priority,
  RecordStyle,
  TARGET_TYPES,
  targetCountRange,
  TreeSpan,
  UsualWhen,
  type Draft,
  type Target,
} from "./habits-view";
import { canOptOut } from "./opt-out";

const MAX_NAME = 200;

const MAX_PLACES = 20;

const MAX_PLACE = 200;

const MAX_SEASONS = 100;

const IsoDay = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));

/** A Habit's id: lowercase letters, digits and dashes, as `newHabitId` makes them. */
export const HabitId = z.string().check(z.regex(/^[\da-z-]{1,32}$/));

export const HabitName = z.string().check(
  z.maxLength(MAX_NAME),
  z.refine((name) => name.trim() !== ""),
);

/** A day has 1440 minutes, so a duration Habit's bar cannot exceed it. */
export const isMinutes = (value: number | null | undefined): value is number =>
  value !== null &&
  value !== undefined &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= 1440;

/** `count` and `days` mean nothing on a Reference Habit (`none`), so only a tracked target checks them. */
const Days = z.array(z.number());

const TargetChange = z.object({
  type: z.enum(TARGET_TYPES),
  count: z.optional(z.number()),
  days: z.optional(Days),
});

type TargetChange = z.infer<typeof TargetChange>;

const SeasonChange = z
  .object({ start: IsoDay, end: z.nullable(IsoDay) })
  .check(z.refine(({ start, end }) => end === null || end >= start));

const Place = z.string().check(z.maxLength(MAX_PLACE));

const Places = z.array(Place).check(z.maxLength(MAX_PLACES));

const GoalId = z.int().check(z.gt(0));

const AlarmChange = z.object({ time: ClockTime, kind: z.enum(ALARM_KINDS) });

const DraftFields = z.object({
  name: HabitName,
  description: z.string(),
  usualWhen: UsualWhen,
  places: Places,
  kind: Kind,
  trees: z.array(TreeSpan),
  treeAskFrom: z.nullable(IsoDay),
  priority: Priority,
  active: z.boolean(),
  autoLogged: z.boolean(),
  optOutFrom: z.nullable(IsoDay),
  usualMinutes: z.nullable(z.number()),
  startDate: z.union([z.literal(""), IsoDay]),
  cueType: z.union([CueType, z.literal("")]),
  stackedAfter: z.nullable(HabitId),
  target: TargetChange,
  record: RecordStyle,
  targetMinutes: z.nullable(z.number()),
  goals: z.array(GoalId),
  alarm: z.nullable(AlarmChange),
  seasons: z.array(SeasonChange).check(z.maxLength(MAX_SEASONS)),
  seasonQuietUntil: z.nullable(IsoDay),
  tinyVersion: z.string().check(z.maxLength(MAX_NAME)),
});

type DraftFields = z.infer<typeof DraftFields>;

/**
 * A Habit change as a client sends it: any field may be missing until `checkDraft` fills the defaults. The tree
 * fields change only through a tree answer, so an edit keeps the saved ones.
 */
export const HabitChange = z.partial(z.omit(DraftFields, { trees: true, treeAskFrom: true }));

export type HabitChange = z.infer<typeof HabitChange>;

/** Why a Habit draft can't be saved, in the words the editor shows beside Save; ordered as the form reads. */
export const DRAFT_PROBLEMS = {
  name: "Name the habit, in 200 characters or fewer.",
  count: "Pick how often it's due.",
  weekdays: "Pick at least one weekday.",
  time: "Choose a time.",
  targetMinutes: "Enter the minutes a day, from 1 to 1440.",
  usualMinutes: "Enter the usual length, from 1 to 1440 minutes.",
  startDate: "Pick a start date.",
  stacked: "Choose the habit this one comes after.",
  stackedAfter: "Only a habit with the Another habit cue comes after one.",
  tinyVersion: "Keep the Tiny version to 200 characters.",
  seasons: "End each Season on or after its start.",
  places: "Keep to 20 Places of 200 characters each.",
  fields: "A field holds a value the app can't save.",
} as const;

export type DraftProblem = keyof typeof DRAFT_PROBLEMS;

// A field whose own schema failed names its problem; a field the form can't get wrong has none.
const FIELD_PROBLEMS = new Map<PropertyKey | undefined, DraftProblem>([
  ["name", "name"],
  ["usualWhen", "time"],
  ["alarm", "time"],
  ["startDate", "startDate"],
  ["tinyVersion", "tinyVersion"],
  ["seasons", "seasons"],
  ["places", "places"],
]);

function targetProblem({ type, count = 7, days = [] }: TargetChange): DraftProblem | null {
  if (type === "none" || type === "once") return null;

  const { min, max } = targetCountRange(type);

  if (!Number.isSafeInteger(count) || count < min || count > max) return "count";

  const weekdaysValid = days.every((day) => Number.isSafeInteger(day) && day >= 0 && day <= 6);

  return weekdaysValid && (type !== "days" || days.length > 0) ? null : "weekdays";
}

// A One-off has no cue, so neither cue rule asks anything of it.
function cueProblem(draft: DraftFields): DraftProblem | null {
  const { cueType, stackedAfter } = draft;

  if (stackedAfter !== null && cueType !== "stacked") return "stackedAfter";

  if (draft.target.type === "once") return null;

  if (cueType === "stacked" && stackedAfter === null) return "stacked";

  return cueType === "time" && habitTime(draft) === null ? "time" : null;
}

// A One-off's start date is its due date, and an Every N days Habit counts its due days from it, so both need one.
const needsStartDate = ({ target, startDate }: DraftFields) =>
  (target.type === "once" || target.type === "interval") && startDate === "";

// An Opt-out `duration` Habit logs its usual length on each counted day, so it needs one.
const needsUsualLength = (draft: DraftFields) =>
  draft.record === "duration" &&
  draft.optOutFrom !== null &&
  canOptOut(draft) &&
  !isMinutes(draft.usualMinutes);

function ruleProblem(draft: DraftFields): DraftProblem | null {
  const target = targetProblem(draft.target);

  if (target !== null) return target;

  const cue = cueProblem(draft);

  if (cue === "time") return cue;

  if (draft.record === "duration" && !isMinutes(draft.targetMinutes)) return "targetMinutes";

  if (needsUsualLength(draft)) return "usualMinutes";

  return needsStartDate(draft) ? "startDate" : cue;
}

// A Reference Habit and a One-off have no weekly count or weekdays.
function cleanTarget({ type, count = 7, days = [] }: TargetChange): Target {
  if (type === "none") return { type, count: 7, days: [] };

  if (type === "once") return { type, count: 1, days: [] };

  return { type, count, days: [...new Set(days)].toSorted((a, b) => a - b) };
}

// Only a recurring Habit is due in Seasons; they keep earliest first, which the due and alarm rules read.
const cleanSeasons = ({ target, seasons }: DraftFields) =>
  target.type === "once" || target.type === "none"
    ? []
    : seasons.toSorted((a, b) => a.start.localeCompare(b.start));

function cleanDraft(data: DraftFields): Draft {
  const { target, record, targetMinutes, alarm } = data;
  const optOutFrom = canOptOut(data) ? data.optOutFrom : null;

  return {
    ...data,
    name: data.name.trim(),
    places: normalizePlaces(data.places),
    target: cleanTarget(target),
    targetMinutes: record === "duration" ? targetMinutes : null,
    optOutFrom,
    usualMinutes: record === "duration" && optOutFrom !== null ? data.usualMinutes : null,
    goals: [...new Set(data.goals)].toSorted((a, b) => a - b),
    // A Reference Habit has no days to ring on.
    alarm: target.type === "none" ? null : alarm,
    seasons: cleanSeasons(data),
    tinyVersion: hasTinyVersion(data) ? data.tinyVersion.trim() : "",
  };
}

type DraftCheck = { draft: Draft; problem: null } | { draft: null; problem: DraftProblem };

/**
 * Every rule a Habit must meet before it is saved, short of the ones only the database can answer (a Goal or a
 * stacked Habit that exists). A missing field takes the new-Habit form's default; a valid draft comes back cleaned,
 * an invalid one names its first problem in the form's order.
 */
export function checkDraft(
  change: HabitChange & Partial<Pick<Draft, "trees" | "treeAskFrom">>,
): DraftCheck {
  const defaults = blankHabit(change.kind ?? "good");
  const stacked = change.stackedAfter !== undefined && change.stackedAfter !== null;

  const parsed = DraftFields.safeParse({
    ...defaults,
    cueType: stacked ? "stacked" : defaults.cueType,
    ...change,
  });

  if (!parsed.success) {
    const problem = parsed.error.issues
      .map(({ path }) => FIELD_PROBLEMS.get(path[0]))
      .find((named) => named !== undefined);

    return { draft: null, problem: problem ?? "fields" };
  }

  const problem = ruleProblem(parsed.data);

  return problem === null
    ? { draft: cleanDraft(parsed.data), problem: null }
    : { draft: null, problem };
}
