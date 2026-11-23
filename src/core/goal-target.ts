// A Goal's optional Target, shown as progress only, per ADR 0015. It never grades and never touches a Streak.

import * as z from "zod/mini";

import { daysFrom, formatDay, mondayOf, shiftDay } from "./calendar";
import { buildGoalTree, goalSubtreeIds } from "./goal-tree";
import type { Counts, Durations, Habit } from "./habits-view";
import { intensityOf, Pillar, type ActivityDay } from "./pillar-balance";

/** Times sum check and count Habits, minutes sum Duration entries; the rest are Signals. */
const TARGET_MEASURES = ["times", "minutes", "intensity-minutes", "sleep", "screen-time"] as const;

const TARGET_DIRECTIONS = ["minimum", "limit"] as const;

const Day = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));

/** A Target's number: whole and above 0. */
export const TargetNumber = z.int().check(z.positive());

const Measure = {
  measure: z.enum(TARGET_MEASURES),
  number: z.nullable(TargetNumber),
  direction: z.enum(TARGET_DIRECTIONS),
};

/** What the Goal page edits. No number makes an open Target, shown as a trend. */
export const GoalTargetDraft = z.discriminatedUnion("period", [
  z.object({ ...Measure, period: z.enum(["week", "month"]) }),
  z.object({ ...Measure, period: z.literal("deadline"), deadline: Day }),
]);

export type GoalTargetDraft = z.infer<typeof GoalTargetDraft>;

/** `start` is the Day a deadline Target counts from; `reviewedThrough` the last period end the Weekly review answered. */
export const GoalTarget = z.intersection(
  GoalTargetDraft,
  z.object({ start: Day, reviewedThrough: z.nullable(Day) }),
);

export type GoalTarget = z.infer<typeof GoalTarget>;

/** First and last Day of one period, both included. */
export interface TargetPeriod {
  from: string;
  to: string;
}

const weekHolding = (day: string) => ({ from: mondayOf(day), to: shiftDay(mondayOf(day), 6) });

// Day 32 of any month lands in the next one, whose first Day ends this month.
function monthHolding(day: string) {
  const from = `${day.slice(0, 7)}-01`;

  return { from, to: shiftDay(`${shiftDay(from, 32).slice(0, 7)}-01`, -1) };
}

/** The period holding `day`; a deadline Target has one period, from its start to its deadline. */
export function targetPeriod(target: GoalTarget, day: string): TargetPeriod {
  if (target.period === "deadline") return { from: target.start, to: target.deadline };

  return target.period === "week" ? weekHolding(day) : monthHolding(day);
}

/** The period before `period`; a deadline Target has none. */
function previousPeriod(target: GoalTarget, { from }: TargetPeriod) {
  return target.period === "deadline" ? null : targetPeriod(target, shiftDay(from, -1));
}

/** The period that ends in the Monday-to-Sunday week holding `day`, if one does. */
function closingPeriod(target: GoalTarget, day: string) {
  const week = weekHolding(day);
  const period = targetPeriod(target, week.from);

  return period.to >= week.from && period.to <= week.to ? period : null;
}

/** The first Day any of `targets` shows around `day`: its period before, or its only period. */
export const targetReadFrom = (targets: GoalTarget[], day: string) =>
  targets
    .map((target) => {
      const current = targetPeriod(target, day);

      return (previousPeriod(target, current) ?? current).from;
    })
    .reduce((first, from) => (from < first ? from : first), day);

/** A Goal as the Targets read it. */
export interface TargetGoal {
  id: number;
  title: string;
  parentId: number | null;
  state: string;
  pillar: Pillar | null;
}

export interface TargetSources {
  counts: Counts;
  durations: Durations;
  activity: ActivityDay[];
  sleep: { date: string; durationMin: number }[];
  /** Each Day's screen-on minutes, summed across devices. */
  screenTime: { day: string; minutes: number }[];
}

// Check and count Habits are counted in times, duration Habits in minutes. A minimum sums good Habits, a limit bad ones.
const HABIT_RECORDS: Partial<Record<GoalTarget["measure"], Habit["record"][]>> = {
  times: ["check", "count"],
  minutes: ["duration"],
};

/** The Habits a Target sums: those serving its Goal or a Goal below it, in its unit and of its kind. */
function measuredHabits(goalId: number, target: GoalTarget, goals: TargetGoal[], habits: Habit[]) {
  const records = HABIT_RECORDS[target.measure] ?? [];
  const below = goalSubtreeIds(buildGoalTree(goals), goalId);
  const kind = target.direction === "minimum" ? "good" : "bad";

  return habits.flatMap(({ id, record, kind: habitKind, goals: served }) =>
    habitKind === kind && records.includes(record) && served.some((goal) => below.has(goal))
      ? [id]
      : [],
  );
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** The mean of the values on `days`, rounded; null when none falls on them. */
function dailyAverage(rows: { day: string; value: number }[], days: string[]) {
  const values = rows.flatMap(({ day, value }) => (days.includes(day) ? [value] : []));

  return values.length === 0 ? null : Math.round(sum(values) / values.length);
}

type Measurer = (habits: string[], sources: TargetSources, days: string[]) => number | null;

const MEASURERS: Record<GoalTarget["measure"], Measurer> = {
  // A check Habit stores 1 on a done day and a count Habit its logs; -1 marks a missed day.
  times: (habits, { counts }, days) =>
    sum(days.flatMap((day) => habits.map((id) => Math.max(counts[day]?.[id] ?? 0, 0)))),
  minutes: (habits, { durations }, days) =>
    sum(
      days.flatMap((day) =>
        habits.flatMap((id) => (durations[day]?.[id] ?? []).map(({ minutes }) => minutes)),
      ),
    ),
  "intensity-minutes": (_, { activity }, days) =>
    sum(activity.flatMap((row) => (days.includes(row.date) ? intensityOf(row) : []))),
  sleep: (_, { sleep }, days) =>
    dailyAverage(
      sleep.map(({ date, durationMin }) => ({ day: date, value: durationMin })),
      days,
    ),
  "screen-time": (_, { screenTime }, days) =>
    dailyAverage(
      screenTime.map(({ day, minutes }) => ({ day, value: minutes })),
      days,
    ),
};

const PeriodValue = z.object({ from: Day, to: Day, value: z.nullable(z.number()) });

export type PeriodValue = z.infer<typeof PeriodValue>;

/** One Goal's Target with its progress: the period holding the Day, the one before, and the one closing that week. */
const TargetView = z.object({
  goalId: z.number(),
  title: z.string(),
  state: z.string(),
  /** Set on a Pillar Goal, whose bar already shows its Signal in the Weekly review. */
  pillar: z.nullable(Pillar),
  target: GoalTarget,
  /** The Habits it sums, empty for a Signal. */
  habits: z.array(z.string()),
  current: PeriodValue,
  previous: z.nullable(PeriodValue),
  closing: z.nullable(PeriodValue),
});

export type TargetView = z.infer<typeof TargetView>;

export const TargetsBody = z.object({ targets: z.array(TargetView) });

export type TargetsBody = z.infer<typeof TargetsBody>;

export interface TargetInputs {
  goals: TargetGoal[];
  targets: { goal: TargetGoal; target: GoalTarget }[];
  habits: Habit[];
  sources: TargetSources;
}

/** Each Target's progress around `day`. */
export function targetViews({ goals, targets, habits, sources }: TargetInputs, day: string) {
  return targets.map(({ goal, target }): TargetView => {
    const measured = measuredHabits(goal.id, target, goals, habits);

    const valued = (period: TargetPeriod) => ({
      ...period,
      value: MEASURERS[target.measure](measured, sources, daysFrom(period.from, period.to)),
    });

    const current = targetPeriod(target, day);
    const previous = previousPeriod(target, current);
    const closing = closingPeriod(target, day);

    return {
      goalId: goal.id,
      title: goal.title,
      state: goal.state,
      pillar: goal.pillar,
      target,
      habits: measured,
      current: valued(current),
      previous: previous && valued(previous),
      closing: closing && valued(closing),
    };
  });
}

const MINUTES_PER_HOUR = 60;

/** "45 m", "2 h" or "2 h 40 m". */
export function hoursLabel(minutes: number) {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;

  if (hours === 0) return `${rest} m`;

  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
}

const IN_HOURS = new Set<GoalTarget["measure"]>(["sleep", "screen-time"]);

// Sleep and screen time read in hours, every other measure as a plain number.
const amount = (measure: GoalTarget["measure"], value: number) =>
  IN_HOURS.has(measure) ? hoursLabel(value) : String(value);

const UNITS: Record<GoalTarget["measure"], string> = {
  times: "times",
  minutes: "min",
  "intensity-minutes": "intensity min",
  sleep: "a night",
  "screen-time": "a day",
};

const shortDay = (day: string) => formatDay(day, { month: "short", day: "numeric" });

/** "this week", "last month", "week of Oct 26", "in Sep 2026" or "by Nov 30". */
function periodName(target: GoalTarget, { from, to }: TargetPeriod, today: string) {
  if (target.period === "deadline") return `by ${shortDay(to)}`;
  const holding = targetPeriod(target, today);

  if (from === holding.from) return `this ${target.period}`;

  if (to === shiftDay(holding.from, -1)) return `last ${target.period}`;

  return target.period === "week"
    ? `week of ${shortDay(from)}`
    : `in ${formatDay(from, { month: "short", year: "numeric" })}`;
}

/** One period's progress, e.g. "95 / 150 min this week" or "90 min this week, limit 300". */
export function targetPeriodLabel(target: GoalTarget, period: PeriodValue, today: string) {
  const name = periodName(target, period, today);

  if (period.value === null) return `Nothing logged ${name}`;
  const { measure, number } = target;
  const value = amount(measure, period.value);

  if (number === null) {
    const since = target.period === "deadline" ? `since ${shortDay(period.from)}` : name;

    return `${value} ${UNITS[measure]} ${since}`;
  }

  return target.direction === "limit"
    ? `${value} ${UNITS[measure]} ${name}, limit ${amount(measure, number)}`
    : `${value} / ${amount(measure, number)} ${UNITS[measure]} ${name}`;
}

/** The current period's progress; an open Target adds the period before, as a trend. */
export function targetLabel({ target, current, previous }: TargetView, today: string) {
  const label = targetPeriodLabel(target, current, today);

  const before = previous?.value ?? null;

  if (before === null || target.number !== null) return label;

  return `${label}, ${amount(target.measure, before)} the ${target.period} before`;
}

// A minimum falls short below its number, a limit past it; an open Target or an empty period never does.
function endedShort({ number, direction }: GoalTarget, value: number | null) {
  if (number === null || value === null) return false;

  return direction === "minimum" ? value < number : value > number;
}

/** A Target whose period ended in the week asked about. */
export type ClosingView = TargetView & { closing: PeriodValue };

/** The Targets the Weekly review asks about: each active one whose period ended short and is not yet answered. */
export const targetsToReview = (views: TargetView[], today: string) =>
  views.filter(
    (view): view is ClosingView =>
      view.state === "active" &&
      view.closing !== null &&
      view.closing.to < today &&
      endedShort(view.target, view.closing.value) &&
      (view.target.reviewedThrough === null || view.target.reviewedThrough < view.closing.to),
  );
