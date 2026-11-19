// The Weekly retro (issue #65): ISO weeks in Toronto time, the week's data by day, and the draft's Markdown.

import * as z from "zod/mini";

import { ActivityRow } from "./activity-summary";
import { daysBetween, formatDay, mondayOf, shiftDay, torontoDay, weekOf } from "./calendar";
import { moodLines } from "./check-in-mood";
import { ZONES, type CheckIn } from "./check-in-view";
import type { HabitDone } from "./habit-day";
import { BriefRow, BriefSleepNight, briefRowOf, parseModelReply } from "./session-brief";
import { habitLine } from "./session-brief-markdown";
import { WorkoutRow } from "./workout-summary";

const DAYS_PER_WEEK = 7;
const THURSDAY = 3;
const WEEK = /^\d{4}-W\d{2}$/;

export const CLOSING_QUESTION = "Anything this week the Check-ins didn't capture?";

/** The ISO week a YYYY-MM-DD day falls in: the year of its Thursday, counted from that year's first Thursday. */
export function isoWeekOf(day: string) {
  const thursday = shiftDay(mondayOf(day), THURSDAY);
  const year = thursday.slice(0, 4);
  const week = 1 + Math.floor(daysBetween(`${year}-01-01`, thursday) / DAYS_PER_WEEK);

  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The Monday of an ISO week; W01 is the week holding 4 January. */
export function mondayOfWeek(week: string) {
  const [year, number] = [week.slice(0, 4), Number(week.slice(6))];

  return mondayOf(shiftDay(`${year}-01-04`, (number - 1) * DAYS_PER_WEEK));
}

/** A YYYY-Www week that exists: W53 only in a year that has one. */
export const isWeek = (week: string) => WEEK.test(week) && isoWeekOf(mondayOfWeek(week)) === week;

/** The week's seven days, Monday to Sunday. */
export const weekDays = (week: string) => weekOf(mondayOfWeek(week));

export const shiftWeek = (week: string, by: number) =>
  isoWeekOf(shiftDay(mondayOfWeek(week), by * DAYS_PER_WEEK));

/** The week before the one holding Toronto today: the retro covers a week that has ended. */
export const lastFullWeek = (now: Date) => shiftWeek(isoWeekOf(torontoDay(now)), -1);

const monthDay = (day: string, withMonth: boolean) =>
  formatDay(day, { ...(withMonth && { month: "short" }), day: "numeric" });

/** e.g. "2026-W45 · Nov 2–8", or "2026-W44 · Oct 26–Nov 1" across a month. */
export function weekLabel(week: string) {
  const first = mondayOfWeek(week);
  const last = shiftDay(first, DAYS_PER_WEEK - 1);

  return `${week} · ${monthDay(first, true)}–${monthDay(last, first.slice(5, 7) !== last.slice(5, 7))}`;
}

/** e.g. "Sun Nov 8". */
export const dayLabel = (day: string) =>
  formatDay(day, { weekday: "short", month: "short", day: "numeric" }).replace(",", "");

const WeekDay = z.object({
  day: z.string(),
  checkIns: z.array(BriefRow),
  sleep: z.nullable(BriefSleepNight),
  activity: z.nullable(ActivityRow),
  workouts: z.array(WorkoutRow),
  habits: z.array(z.string()),
});

export type WeekDay = z.infer<typeof WeekDay>;

/** Whether anything was logged on the day. */
export const hasEntries = (day: WeekDay) =>
  day.checkIns.length > 0 ||
  day.sleep !== null ||
  day.activity !== null ||
  day.workouts.length > 0 ||
  day.habits.length > 0;

export interface WeekInput {
  checkIns: CheckIn[];
  sleep: BriefSleepNight[];
  habitsDone: HabitDone[];
  activity: ActivityRow[];
  workouts: WorkoutRow[];
}

/** Every day of the week, each with what happened on it in Toronto time; the caller may pass rows from either side. */
export function groupByDay(
  week: string,
  { checkIns, sleep, habitsDone, activity, workouts }: WeekInput,
): WeekDay[] {
  const rows = checkIns
    .toSorted((a, b) => a.checkedInAt.localeCompare(b.checkedInAt))
    .map((c) => briefRowOf(c));

  return weekDays(week).map((day) => ({
    day,
    checkIns: rows.filter((r) => r.day === day),
    sleep: sleep.find((n) => n.date === day) ?? null,
    activity: activity.find((a) => a.date === day) ?? null,
    workouts: workouts.filter((w) => w.date === day),
    habits: habitsDone.filter((h) => h.date === day).map((h) => h.name),
  }));
}

/** An active Goal with its felt why and the Habits that point at it. */
const WeeklyGoal = z.object({
  title: z.string(),
  why: z.string(),
  habits: z.array(z.string()),
});

export type WeeklyGoal = z.infer<typeof WeeklyGoal>;

// `goal` is a Goal's title as the model echoes it; `movement` is one clause on how the week moved it.
const Direction = z.object({ goal: z.string(), movement: z.string() });

const WeeklyProse = z.object({ summary: z.string(), directions: z.array(Direction) });

export type WeeklyProse = z.infer<typeof WeeklyProse>;

export const parseWeeklyProse = (reply?: string): WeeklyProse | null =>
  parseModelReply(WeeklyProse, reply);

const SavedRetro = z.object({ id: z.number(), body: z.string() });

/** `existing` is the saved retro for the week; `drafted` is false when the model gave no usable prose. */
export const WeeklyReviewBody = z.object({
  week: z.string(),
  days: z.array(WeekDay),
  goals: z.array(WeeklyGoal),
  existing: z.nullable(SavedRetro),
  draft: z.string(),
  drafted: z.boolean(),
});

export type WeeklyReviewBody = z.infer<typeof WeeklyReviewBody>;

export const oneLine = (text: string) => text.replaceAll(/\s+/g, " ").trim();

export const goalKey = (title: string) => title.trim().toLocaleLowerCase();

function directionLine({ title, why }: WeeklyGoal, movement: string) {
  const felt = why.trim() === "" ? `- **${title}**` : `- **${title}**: ${oneLine(why)}`;

  return movement === "" ? felt : `${felt}; ${movement}`;
}

function directions(goals: WeeklyGoal[], prose: WeeklyProse | null) {
  if (goals.length === 0) return ["## Directions", "", "No active Goals."];

  const movements = new Map(prose?.directions.map((d) => [goalKey(d.goal), oneLine(d.movement)]));

  return [
    "## Directions",
    "",
    ...goals.map((goal) => directionLine(goal, movements.get(goalKey(goal.title)) ?? "")),
  ];
}

const MINUTES_PER_HOUR = 60;

const average = (values: number[]) =>
  Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);

const duration = (minutes: number) =>
  `${Math.floor(minutes / MINUTES_PER_HOUR)}h ${String(minutes % MINUTES_PER_HOUR).padStart(2, "0")}m`;

const present = (values: (number | null)[]) => values.filter((v) => v !== null);

/** Nights slept and their average length. */
export function sleepSignalLine(nights: BriefSleepNight[]) {
  if (nights.length === 0) return [];

  const count = `${nights.length} ${nights.length === 1 ? "night" : "nights"}`;

  return [`- Sleep: ${count}, average ${duration(average(nights.map((n) => n.durationMin)))}`];
}

export function activitySignalLine(days: ActivityRow[]) {
  if (days.length === 0) return [];

  const stress = present(days.map((d) => d.avgStress));

  const parts = [
    `average ${average(days.map((d) => d.steps)).toLocaleString("en-US")} steps`,
    ...(stress.length > 0 ? [`average stress ${average(stress)}`] : []),
  ];

  return [`- Activity: ${parts.join(", ")}`];
}

/** e.g. "- Zones: Sun on 4, Rain on 2 of 6 Check-ins": Sun first, a zone with none left out. */
function zonesLine(checkIns: BriefRow[]) {
  if (checkIns.length === 0) return [];

  const zones = ZONES.toReversed()
    .map((zone) => [zone, checkIns.filter((c) => c.zone === zone).length] as const)
    .filter(([, count]) => count > 0)
    .map(([zone, count]) => `${zone} on ${count}`);

  const total = `${checkIns.length} ${checkIns.length === 1 ? "Check-in" : "Check-ins"}`;

  return [`- Zones: ${zones.join(", ")} of ${total}`];
}

function signals(days: WeekDay[]) {
  const checkIns = days.flatMap((d) => d.checkIns);

  const lines = [
    ...sleepSignalLine(days.flatMap((d) => (d.sleep ? [d.sleep] : []))),
    ...activitySignalLine(days.flatMap((d) => (d.activity ? [d.activity] : []))),
    ...zonesLine(checkIns),
    ...moodLines(checkIns).map((line) => `- ${line}`),
  ];

  return lines.length === 0 ? [] : ["", "## Signals", "", ...lines];
}

/** Days each Habit was done, most first; counts only, so no hit rate, Streak or Strength. */
function habits(days: WeekDay[]) {
  const done = days.flatMap((d) => d.habits);

  if (done.length === 0) return [];

  const lines = [...new Set(done)]
    .map((name) => ({ name, days: done.filter((n) => n === name).length }))
    .toSorted((a, b) => (a.days === b.days ? a.name.localeCompare(b.name) : b.days - a.days))
    .map((habit) => `- ${habitLine(habit)}`);

  return ["", "## Habits", "", ...lines];
}

/**
 * The retro's Markdown. Code owns the structure, so one bullet per active Goal and no empty
 * signal lines hold whatever the model says; the model only fills short clauses.
 */
export function draftMarkdown(
  { days, goals }: { days: WeekDay[]; goals: WeeklyGoal[] },
  prose: WeeklyProse | null,
) {
  const summary = prose ? oneLine(prose.summary) : "";

  return [
    ...directions(goals, prose),
    ...signals(days),
    ...habits(days),
    ...(summary === "" ? [] : ["", summary]),
    "",
    CLOSING_QUESTION,
    "",
  ].join("\n");
}
