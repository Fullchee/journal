import type { Counts, FitbitRule, RecordStyle } from "@/core";

import type { HabitCheck } from "@/lib/data/habits";
import type { ImportDurations, LinkResult } from "@/lib/health/calm-auto-log";

/** Where a read writes: queued checks for a check Habit, imported minutes for a Duration Habit. */
export interface FitbitWriters {
  /** Every Habit's answers by Day, with unsent taps. */
  counts: Counts;
  /** Each Habit's Record style now, by id: it picks how a read writes, since the owner can change it after linking. */
  recordStyles: Record<string, RecordStyle>;
  check: (checks: HabitCheck[]) => void;
  importDurations: ImportDurations;
}

/** The Habit one rule completes. A Duration Habit takes Fitbit's exercise minutes, so it ignores the threshold. */
export interface FitbitLink {
  habit: string;
  threshold: number;
}

export type FitbitLinks = Partial<Record<FitbitRule, FitbitLink>>;

export interface FitbitAutoLog {
  /** The Habit each rule completes on this phone. */
  links: () => Promise<FitbitLinks>;
  /** Asks Health Connect to read the rule's records, then completes the Habit from today on. */
  link: (rule: FitbitRule, link: FitbitLink, writers: FitbitWriters) => Promise<LinkResult>;
  setThreshold: (rule: FitbitRule, threshold: number) => Promise<void>;
  unlink: (rule: FitbitRule) => Promise<void>;
}

/** Health Connect is Android only (fitbit-auto-log.android.ts); elsewhere the Habit screen hides the Fitbit section. */
export const fitbitAutoLog: FitbitAutoLog | null = null;

export function useFitbitAutoLog() {
  // Nothing to read off Android.
}
