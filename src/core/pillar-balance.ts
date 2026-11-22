// Pillar bars: one capped "enough" score per health pillar over 7 Days, per docs/research/pillar-balance.md.

import * as z from "zod/mini";

import { daysFrom, mondayOf, shiftDay, torontoDay } from "./calendar";
import { buildGoalTree, goalSubtreeIds } from "./goal-tree";
import type { StreakRecords } from "./habit-day";
import { hasHistory, type HistoryUnit } from "./habit-history";
import { gradedHistory, type GradedPeriod } from "./habit-strength";
import type { Habit } from "./habits-view";
import type { BriefSleepNight } from "./session-brief";

/** The six lifestyle-medicine pillars, in the order the bars show. */
const PILLARS = ["sleep", "activity", "connection", "substances", "stress", "nutrition"] as const;

export const Pillar = z.enum(PILLARS);

export type Pillar = z.infer<typeof Pillar>;

const Scored = z.object({
  pillar: Pillar,
  title: z.string(),
  state: z.literal("scored"),
  /** 0 to 100, full at "enough" and never past it. */
  score: z.number(),
  value: z.string(),
  /** What "enough" means for this pillar, e.g. "Enough: 7 h a night". */
  line: z.string(),
  /** This window's score minus the one before; null when the one before had too little data. */
  change: z.nullable(z.number()),
});

/** `thin` has data but too little to score; `none` has no source at all, so it shows no bar. */
const Unscored = z.object({
  pillar: Pillar,
  title: z.string(),
  state: z.enum(["thin", "none"]),
  message: z.string(),
});

const PillarBar = z.discriminatedUnion("state", [Scored, Unscored]);

export type PillarBar = z.infer<typeof PillarBar>;

export const PillarBarsBody = z.object({ bars: z.array(PillarBar) });

export type PillarBarsBody = z.infer<typeof PillarBarsBody>;

const WINDOW_DAYS = 7;

interface Window {
  first: string;
  last: string;
  days: string[];
}

/** The 7 Days ending `end`, inclusive. */
function windowEnding(end: string): Window {
  const first = shiftDay(end, 1 - WINDOW_DAYS);

  return { first, last: end, days: daysFrom(first, end) };
}

/** The Goals view's window ends yesterday, so a half-lived today never pulls a bar down. */
export const goalsViewEnd = (now: Date) => shiftDay(torontoDay(now), -1);

type Result =
  | { state: "scored"; score: number; value: string }
  | { state: "thin" | "none"; message: string };

const thin = (have: number, unit: string): Result => ({
  state: "thin",
  message: `Not enough data: ${have} of ${WINDOW_DAYS} ${unit}`,
});

// Life's Essential 8 tiers (Lloyd-Jones et al. 2022, Table 2): the first band whose floor the value reaches.
const tier = (bands: [floor: number, points: number][], value: number) =>
  bands.find(([floor]) => value >= floor)?.[1] ?? 0;

// Hours a night. Long sleep scores 90 then 40, not 0: illness or sleep debt can raise sleep need.
const SLEEP_BANDS: [number, number][] = [
  [10, 40],
  [9, 90],
  [7, 100],
  [6, 70],
  [5, 40],
  [4, 20],
];

const MIN_NIGHTS = 4;
const MINUTES_PER_HOUR = 60;

const hoursLabel = (minutes: number) => {
  const rounded = Math.round(minutes);

  return `${Math.floor(rounded / MINUTES_PER_HOUR)} h ${rounded % MINUTES_PER_HOUR} m`;
};

type SleepNight = Pick<BriefSleepNight, "date" | "durationMin">;

function sleepResult(nights: SleepNight[], { days }: Window): Result {
  const inWindow = nights.filter(({ date }) => days.includes(date));

  if (inWindow.length < MIN_NIGHTS) return thin(inWindow.length, "nights");
  const mean = inWindow.reduce((sum, { durationMin }) => sum + durationMin, 0) / inWindow.length;

  return {
    state: "scored",
    score: tier(SLEEP_BANDS, mean / MINUTES_PER_HOUR),
    value: `${hoursLabel(mean)} a night`,
  };
}

// Intensity minutes a week.
const ACTIVITY_BANDS: [number, number][] = [
  [150, 100],
  [120, 90],
  [90, 80],
  [60, 60],
  [30, 40],
  [1, 20],
];

const MIN_ACTIVE_DAYS = 5;
const STRENGTH_DAYS = 2;

// WHO sets both lines but weights neither; 75/25 is a judgement call, not a source.
const AEROBIC_SHARE = 0.75;

export interface ActivityDay {
  date: string;
  moderateMin: number | null;
  vigorousMin: number | null;
}

/** WHO counts a vigorous minute as two moderate ones. A day the watch measured neither is left out, not zero. */
export const intensityOf = ({ moderateMin, vigorousMin }: ActivityDay) =>
  moderateMin === null && vigorousMin === null ? [] : [(moderateMin ?? 0) + 2 * (vigorousMin ?? 0)];

function activityResult(activity: ActivityDay[], strengthDays: string[], { days }: Window): Result {
  const measured = activity.flatMap((day) => (days.includes(day.date) ? intensityOf(day) : []));

  if (measured.length < MIN_ACTIVE_DAYS) return thin(measured.length, "days");

  const weekly = Math.round((measured.reduce((sum, v) => sum + v, 0) / measured.length) * 7);

  const strength = Math.min(
    STRENGTH_DAYS,
    new Set(strengthDays.filter((d) => days.includes(d))).size,
  );

  const score =
    AEROBIC_SHARE * tier(ACTIVITY_BANDS, weekly) +
    (1 - AEROBIC_SHARE) * (strength / STRENGTH_DAYS) * 100;

  return {
    state: "scored",
    score: Math.round(score),
    value: `${weekly} of 150 min · ${strength} of ${STRENGTH_DAYS} strength days`,
  };
}

export interface InteractionDay {
  day: string;
  kind: string;
}

// No Interaction at all for this long reads as not logging, not as no contact.
const QUIET_DAYS = 14;

function connectionResult(interactions: InteractionDay[], { days, last }: Window): Result {
  const from = shiftDay(last, 1 - QUIET_DAYS);

  if (interactions.every(({ day }) => day < from || day > last))
    return { state: "none", message: `Nothing logged in ${QUIET_DAYS} days` };

  const inPerson = new Set(
    interactions.flatMap(({ day, kind }) =>
      kind === "in-person" && days.includes(day) ? day : [],
    ),
  ).size;

  return {
    state: "scored",
    score: inPerson > 0 ? 100 : 0,
    value: inPersonLabel(inPerson),
  };
}

function inPersonLabel(days: number) {
  if (days === 0) return "No in-person day";

  return days === 1 ? "In person on 1 day" : `In person on ${days} days`;
}

interface Tally {
  met: number;
  counted: number;
}

// The start of the period holding `day`: a period starting on or after it touches the window.
const PERIOD_FLOOR: Record<HistoryUnit, (day: string) => string> = {
  day: (day) => day,
  week: mondayOf,
  month: (day) => `${day.slice(0, 7)}-01`,
};

// Each hit or missed period that touches the window counts; an open, Rest or Skipped one counts for neither.
function tally(
  { unit, periods }: { unit: HistoryUnit; periods: GradedPeriod[] },
  { first, last }: Window,
): Tally {
  const floor = PERIOD_FLOOR[unit](first);

  const touching = periods.filter(
    ({ start, completion }) => completion !== null && start >= floor && start <= last,
  );

  return {
    met: touching.filter(({ completion }) => completion === 1).length,
    counted: touching.length,
  };
}

interface PlanInput {
  habits: Habit[];
  records: StreakRecords;
  now: Date;
}

// Stress, substances and nutrition have no guideline dose, so "enough" is each linked Habit's own Frequency or Limit.
function planResult({ habits, records, now }: PlanInput, window: Window): Result {
  if (habits.length === 0) return { state: "none", message: "Link a Habit to see this" };

  const { met, counted } = habits
    .map((habit) => tally(gradedHistory(habit, records, now), window))
    .reduce((sum, t) => ({ met: sum.met + t.met, counted: sum.counted + t.counted }));

  if (counted === 0) return { state: "thin", message: "Not enough data: nothing due these 7 days" };

  return {
    state: "scored",
    score: Math.round((met / counted) * 100),
    value: `${met} of ${counted} on plan`,
  };
}

const LINES: Record<Pillar, string> = {
  sleep: "Enough: 7 h a night",
  activity: "Enough: 150 min and 2 strength days a week",
  connection: "Soft line: about weekly, in person",
  substances: "Your plan",
  stress: "Your plan",
  nutrition: "Your plan",
};

/** A Goal as the pillar bars read it: `pillar` marks the six top-level pillar Goals. */
export interface PillarGoal {
  id: number;
  title: string;
  parentId: number | null;
  pillar: Pillar | null;
}

export interface PillarSources {
  goals: PillarGoal[];
  habits: Habit[];
  records: StreakRecords;
  sleep: SleepNight[];
  activity: ActivityDay[];
  /** Days with a strength workout, from Hevy or the watch. */
  strengthDays: string[];
  interactions: InteractionDay[];
  now: Date;
}

// A pillar's Habits are the active recurring ones linked to its Goal or any Goal below it.
function pillarHabits(sources: PillarSources, goalId: number) {
  const below = goalSubtreeIds(buildGoalTree(sources.goals), goalId);

  return sources.habits.filter(
    (habit) => habit.active && hasHistory(habit) && habit.goals.some((id) => below.has(id)),
  );
}

type Scorer = (sources: PillarSources, goalId: number, window: Window) => Result;

const planScorer: Scorer = (sources, goalId, window) =>
  planResult({ ...sources, habits: pillarHabits(sources, goalId) }, window);

const SCORERS: Record<Pillar, Scorer> = {
  sleep: (sources, _, window) => sleepResult(sources.sleep, window),
  activity: (sources, _, window) => activityResult(sources.activity, sources.strengthDays, window),
  connection: (sources, _, window) => connectionResult(sources.interactions, window),
  substances: planScorer,
  stress: planScorer,
  nutrition: planScorer,
};

/** One bar per pillar Goal for the 7 Days ending `end`, compared with the 7 before; pillars without a Goal have none. */
export function pillarBars(sources: PillarSources, end: string): PillarBar[] {
  const current = windowEnding(end);
  const before = windowEnding(shiftDay(end, -WINDOW_DAYS));

  return PILLARS.flatMap((pillar) => {
    const goal = sources.goals.find((g) => g.pillar === pillar);

    if (goal === undefined) return [];
    const now = SCORERS[pillar](sources, goal.id, current);

    if (now.state !== "scored") return { pillar, title: goal.title, ...now };
    const then = SCORERS[pillar](sources, goal.id, before);

    return {
      pillar,
      title: goal.title,
      ...now,
      line: LINES[pillar],
      change: then.state === "scored" ? now.score - then.score : null,
    };
  });
}

/** "Up 10 from the 7 days before"; empty when there is nothing to compare. */
export function pillarChangeLabel(change: number | null) {
  if (change === null) return "";

  if (change === 0) return "Same as the 7 days before";

  return `${change > 0 ? "Up" : "Down"} ${Math.abs(change)} from the 7 days before`;
}

/**
 * The first Day the bars for `end` read: both windows, the quiet days before the earlier one, and the whole month
 * it starts in, so a monthly Habit's period is read in full.
 */
export function pillarReadFrom(end: string) {
  const quietFrom = shiftDay(end, 1 - WINDOW_DAYS - QUIET_DAYS);

  return PERIOD_FLOOR.month(quietFrom);
}
