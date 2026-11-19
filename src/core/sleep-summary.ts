// Sleep Signal: average bedtime and how much it varies over the nights in the chart's period, per issue #102.

import * as z from "zod/mini";

import { clockLabel, formatMinutes } from "./calendar";

export const Night = z.object({ date: z.string(), sleepStart: z.string() });

export type Night = z.infer<typeof Night>;

/** `change` is this period minus the one before it; null when there is nothing to compare with. */
export interface SleepSummary {
  bedtime: { minutes: number; change: number | null };
  spread: { minutes: number; change: number | null };
}

// Fewer nights say nothing about how steady bedtimes are.
const MIN_NIGHTS = 2;

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_HOUR = 60;
const ANCHOR = 18 * MINUTES_PER_HOUR;

/** Nobody in scope falls asleep at 18:00, so counting from it keeps bedtimes across midnight linear. */
export function minutesPast18(sleepStart: string) {
  const [hours, minutes] = [Number(sleepStart.slice(11, 13)), Number(sleepStart.slice(14, 16))];

  return (hours * MINUTES_PER_HOUR + minutes - ANCHOR + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function stats(nights: Night[]) {
  const values = nights.map((n) => minutesPast18(n.sleepStart));
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;

  return { mean, stdev: Math.sqrt(variance) };
}

const difference = (current: number, previous: number | undefined) =>
  previous === undefined ? null : current - previous;

/** `previous` is the period just before `current`; null when `current` has too few nights. */
export function sleepSummary(current: Night[], previous: Night[] = []): SleepSummary | null {
  if (current.length < MIN_NIGHTS) return null;
  const now = stats(current);
  const then = previous.length < MIN_NIGHTS ? undefined : stats(previous);

  return {
    bedtime: { minutes: now.mean, change: difference(now.mean, then?.mean) },
    spread: { minutes: now.stdev, change: difference(now.stdev, then?.stdev) },
  };
}

export function clockTime(minutesAfter18: number) {
  return clockLabel(formatMinutes((Math.round(minutesAfter18) + ANCHOR) % MINUTES_PER_DAY));
}

function trend(change: number | null, words: [string, string], before: string) {
  if (change === null) return "";
  const minutes = Math.round(Math.abs(change));

  if (minutes === 0) return `same as ${before}`;
  const [drop, rise] = words;

  return `${minutes} min ${change < 0 ? drop : rise} than ${before}`;
}

/** `before` names the period the trend compares with, e.g. "the month before". */
export function sleepRows(summary: SleepSummary, before: string) {
  return [
    {
      label: "Average bedtime",
      value: clockTime(summary.bedtime.minutes),
      trend: trend(summary.bedtime.change, ["earlier", "later"], before),
    },
    {
      label: "Bedtime varies by",
      value: `±${Math.round(summary.spread.minutes)} min`,
      trend: trend(summary.spread.change, ["steadier", "less steady"], before),
    },
  ];
}
