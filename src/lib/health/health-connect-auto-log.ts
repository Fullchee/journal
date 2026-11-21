import type { HealthConnectSource, ImportedEntry } from "@/core";

export type ImportDurations = (change: {
  habit: string;
  entries: ImportedEntry[];
}) => Promise<number>;

/** Why linking a Habit to a Health Connect source stopped, or how many sessions its first read added. */
export type LinkResult =
  | { status: "unavailable" }
  | { status: "denied" }
  | { status: "linked"; added: number };

export interface HealthConnectAutoLog {
  /** The Habit this phone logs the source's sessions on, if any. */
  linkedHabit: (source: HealthConnectSource) => Promise<string | null>;
  /** Asks Health Connect to read the source's record type, then logs its sessions on `habit` from now on. */
  link: (
    source: HealthConnectSource,
    habit: string,
    importDurations: ImportDurations,
  ) => Promise<LinkResult>;
  unlink: (source: HealthConnectSource) => Promise<void>;
}

/** Health Connect is Android only (health-connect-auto-log.android.ts); elsewhere the Habit screen hides its links. */
export const healthConnectAutoLog: HealthConnectAutoLog | null = null;

export function useHealthConnectAutoLog() {
  // Nothing to read off Android.
}
