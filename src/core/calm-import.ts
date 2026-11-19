import * as z from "zod/mini";

import { torontoDay, torontoTime } from "./calendar";
import { clampMinutes, oncePerStart, type ImportedEntry } from "./csv-import";

/** Calm's Android package, which Health Connect names as each of its records' `dataOrigin`. */
export const CALM_PACKAGE = "com.calm.android";

const DAY_MS = 86_400_000;

// Health Connect lets an app read other apps' data from 30 days before its first grant.
const HISTORY_DAYS = 30;

const Instant = z.string().check(z.refine((text) => !Number.isNaN(Date.parse(text))));

/** The fields of a Health Connect MindfulnessSession record that a Duration entry needs; the record carries more. */
export const MindfulnessSession = z.object({
  startTime: Instant,
  endTime: Instant,
  metadata: z.object({ dataOrigin: z.string() }),
});

export type MindfulnessSession = z.infer<typeof MindfulnessSession>;

/** Calm's sessions as Duration entries on their Toronto Day and clock, earliest first; other apps' are left out. */
export function calmSessions(sessions: readonly MindfulnessSession[]): ImportedEntry[] {
  const entries: ImportedEntry[] = [];

  for (const { startTime, endTime, metadata } of sessions) {
    if (metadata.dataOrigin !== CALM_PACKAGE) continue;

    entries.push({
      date: torontoDay(startTime),
      startTime: torontoTime(startTime),
      minutes: clampMinutes((Date.parse(endTime) - Date.parse(startTime)) / 60_000),
    });
  }

  return oncePerStart(entries);
}

/** Where the next Health Connect read starts: a day before the last one, since re-reading skips logged sessions. */
export function calmReadFrom(lastReadAt: string | null, now: Date) {
  const from =
    lastReadAt === null ? now.getTime() - HISTORY_DAYS * DAY_MS : Date.parse(lastReadAt) - DAY_MS;

  return new Date(from).toISOString();
}
