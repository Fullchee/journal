import type { ImportedEntry } from "@/core";

export type ImportDurations = (change: {
  habit: string;
  entries: ImportedEntry[];
}) => Promise<number>;

/** Why linking a Habit to Calm stopped, or how many sessions its first read added. */
export type LinkResult =
  | { status: "unavailable" }
  | { status: "denied" }
  | { status: "linked"; added: number };

export interface CalmAutoLog {
  /** The Habit this phone logs Calm sessions on, if any. */
  linkedHabit: () => Promise<string | null>;
  /** Asks Health Connect to read Mindfulness, then logs Calm sessions on `habit` from now on. */
  link: (habit: string, importDurations: ImportDurations) => Promise<LinkResult>;
  unlink: () => Promise<void>;
}

/** Health Connect is Android only (calm-auto-log.android.ts); elsewhere the Habit screen hides the Calm link. */
export const calmAutoLog: CalmAutoLog | null = null;

export function useCalmAutoLog() {
  // Nothing to read off Android.
}
