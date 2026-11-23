// Screen time (#32): a device's screen on and off events turned into screen-on minutes per Day.
// scripts/screen-time.ts runs this file with plain Node on a Mac that may have no node_modules, so it imports only
// calendar.ts, by its full path.

import { daysFrom, isoAt, shiftDay, torontoDay } from "./calendar.ts";

/** The screen turned on or off at `at`, in epoch milliseconds. */
export interface ScreenEvent {
  at: number;
  on: boolean;
}

/** A device's stable name, picked at setup: lowercase letters, digits and dashes, e.g. `pixel` or `work-mac`. */
export const DEVICE_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/u;

/** One device's screen-on minutes on one Day. */
export interface ScreenDay {
  day: string;
  minutes: number;
}

/** The span a device's events cover, in epoch milliseconds; `from` is a Toronto midnight so every Day it covers is whole. */
export interface ScreenWindow {
  from: number;
  to: number;
}

const MINUTE_MS = 60_000;

const midnight = (day: string) => Date.parse(isoAt(day));

/** The window from midnight `days - 1` Days before `now`'s Day up to `now`, so it holds `days` Days, today included. */
export function lastDays(now: number, days: number): ScreenWindow {
  return { from: midnight(shiftDay(torontoDay(now), 1 - days)), to: now };
}

/** The window from the first midnight after `start` up to `now`, so a log that starts mid-Day never reports that Day. */
export const windowAfter = (start: number, now: number): ScreenWindow => ({
  from: midnight(shiftDay(torontoDay(start), 1)),
  to: now,
});

/**
 * The spans the screen was on. An off with no on before it means the screen was on when the window opened; an on
 * with no off after it means the screen is still on. A repeated on or off adds nothing.
 */
function onSpans(events: readonly ScreenEvent[], { from, to }: ScreenWindow) {
  const spans: [number, number][] = [];
  let onSince: number | null = null;
  let first = true;
  const ordered = events.toSorted((a, b) => a.at - b.at);

  for (const { at, on } of ordered) {
    if (on) onSince ??= at;
    else {
      const start = onSince ?? (first ? from : null);

      if (start !== null) spans.push([start, at]);
      onSince = null;
    }

    first = false;
  }

  if (onSince !== null) spans.push([onSince, to]);

  return spans;
}

/** Screen-on minutes for every Day in the window, 0 included; a span that crosses midnight splits between its Days. */
export function screenMinutes(events: readonly ScreenEvent[], window: ScreenWindow): ScreenDay[] {
  if (window.to <= window.from) return [];
  const spans = onSpans(events, window);

  return daysFrom(torontoDay(window.from), torontoDay(window.to - 1)).map((day) => {
    const start = Math.max(midnight(day), window.from);
    const end = Math.min(midnight(shiftDay(day, 1)), window.to);

    const onMs = spans.reduce(
      (total, [spanStart, spanEnd]) =>
        total + Math.max(0, Math.min(spanEnd, end) - Math.max(spanStart, start)),
      0,
    );

    return { day, minutes: Math.round(onMs / MINUTE_MS) };
  });
}
