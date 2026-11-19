// The Check-in chart: three stacked strips (mood; Tense, Low and Tired; sleep) sharing one time axis.
import { ZONES, type ChartData } from "./check-in-view";
import { clockTime } from "./sleep-summary";

export type Strip = "mood" | "ratings" | "sleep";

/** Top to bottom, and the legend's order. */
export const STRIPS: { id: Strip; label: string }[] = [
  { id: "mood", label: "Mood" },
  { id: "ratings", label: "Tense, Low and Tired" },
  { id: "sleep", label: "Sleep" },
];

/** Each zone owns two scores, so its band runs half a score past both, and the four bands are equal. */
export const ZONE_BANDS = ZONES.map((zone, i) => ({ zone, from: 2 * i + 0.5, to: 2 * i + 2.5 }));

const MOOD_DOMAIN: [number, number] = [0.5, 8.5];

// None (0) to A lot (2).
const RATING_DOMAIN: [number, number] = [0, 2];

const HOUR = 60;

/** The y values each strip spans, bottom to top; sleep runs in minutes past 18:00, so evening sits on top. */
export function stripDomain(strip: Strip, data: Pick<ChartData, "sleep">): [number, number] {
  if (strip === "mood") return MOOD_DOMAIN;

  if (strip === "ratings") return RATING_DOMAIN;

  return [
    Math.ceil(Math.max(...data.sleep.map((n) => n.to)) / HOUR) * HOUR,
    Math.floor(Math.min(...data.sleep.map((n) => n.from)) / HOUR) * HOUR,
  ];
}

/** The sleep strip's top and bottom hours, for its gutter, e.g. "10 PM" over "9 AM". */
export const sleepAxisLabels = ([bottom, top]: [number, number]) =>
  [top, bottom].map((value) => ({ value, label: clockTime(value).replace(":00", "") }));

const hasData: Record<Strip, (data: ChartData) => boolean> = {
  mood: (data) => data.points.length > 0,
  ratings: (data) => data.tense.length > 0 || data.low.length > 0 || data.tired.length > 0,
  sleep: (data) => data.sleep.length > 0,
};

/** A strip with nothing in the range is hidden, along with its legend button. */
export const stripsWithData = (data: ChartData): Strip[] =>
  STRIPS.flatMap((s) => (hasData[s.id](data) ? s.id : []));

export interface StripBox {
  id: Strip;
  top: number;
  height: number;
}

/** Mood carries the zone bands, so it gets the most room; sleep needs room for a night's hours. */
export const STRIP_HEIGHTS: Record<Strip, number> = { mood: 132, ratings: 88, sleep: 96 };

export const STRIP_GAP = 14;

/** Stacks the shown strips from the top; `height` is where the time axis starts. */
export function layoutStrips(shown: Strip[], heights = STRIP_HEIGHTS, gap = STRIP_GAP) {
  const boxes: StripBox[] = [];
  let top = 0;

  for (const id of shown) {
    boxes.push({ id, top, height: heights[id] });
    top += heights[id] + gap;
  }

  return { boxes, height: Math.max(0, top - gap) };
}

/** The point a tap or hover at time `x` means: the nearest in time, if within `reach` milliseconds. */
export function nearestPoint<P extends { x: number }>(points: P[], x: number, reach: number) {
  let best: P | undefined;

  for (const p of points) {
    if (Math.abs(p.x - x) <= reach && (!best || Math.abs(p.x - x) < Math.abs(best.x - x))) best = p;
  }

  return best;
}
