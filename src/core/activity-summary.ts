// Activity Signal: daily averages over the days in the chart's period, per issue #140. Plain numbers, no bands.

import * as z from "zod/mini";

/** One day of the activity Signal as the API returns it; null when the watch measured too little. */
export const ActivityRow = z.object({
  date: z.string(),
  steps: z.number(),
  moderateMin: z.nullable(z.number()),
  vigorousMin: z.nullable(z.number()),
  restingHr: z.nullable(z.number()),
  avgStress: z.nullable(z.number()),
});

export type ActivityRow = z.infer<typeof ActivityRow>;

type Day = Omit<ActivityRow, "date">;

interface Metric {
  label: string;
  of: (day: Day) => number | null;
  format: (value: number) => string;
  /** How a drop and a rise read, e.g. ["fewer", "more"]. */
  words: [string, string];
}

const DAYS_PER_WEEK = 7;

const count = (value: number) => Math.round(value).toLocaleString("en-US");

// The weekly intensity goal counts each vigorous minute twice.
const intensityMinutes = (day: Day) =>
  day.moderateMin === null && day.vigorousMin === null
    ? null
    : (day.moderateMin ?? 0) + 2 * (day.vigorousMin ?? 0);

const METRICS: Metric[] = [
  { label: "Steps a day", of: (d) => d.steps, format: count, words: ["fewer", "more"] },
  {
    label: "Intensity minutes a week",
    of: (d) => {
      const minutes = intensityMinutes(d);

      return minutes === null ? null : minutes * DAYS_PER_WEEK;
    },
    format: (v) => `${count(v)} min`,
    words: ["fewer", "more"],
  },
  {
    label: "Resting heart rate",
    of: (d) => d.restingHr,
    format: (v) => `${count(v)} bpm`,
    words: ["lower", "higher"],
  },
  {
    label: "Stress",
    of: (d) => d.avgStress,
    format: (v) => `${count(v)} of 100`,
    words: ["lower", "higher"],
  },
];

// Days missing the metric (the watch measured too little) are left out, not counted as zero.
function mean(days: Day[], of: Metric["of"]) {
  const values = days.flatMap((day) => of(day) ?? []);

  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function trend(metric: Metric, now: number, then: number | null, before: string) {
  if (then === null) return "";
  const change = Math.round(now) - Math.round(then);

  if (change === 0) return `same as ${before}`;
  const [drop, rise] = metric.words;

  return `${count(Math.abs(change))} ${change < 0 ? drop : rise} than ${before}`;
}

/**
 * `before` names the period `previous` covers, e.g. "the month before". A metric with no data this period has no row.
 */
export function activityRows(current: Day[], previous: Day[], before: string) {
  return METRICS.flatMap((metric) => {
    const now = mean(current, metric.of);

    if (now === null) return [];

    return {
      label: metric.label,
      value: metric.format(now),
      trend: trend(metric, now, mean(previous, metric.of), before),
    };
  });
}
