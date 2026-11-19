import * as z from "zod/mini";

import { clampMinutes, csvRows, oncePerStart, type ImportedEntry } from "./csv-import";

// Insight Timer writes local wall-clock times as month/day/year, e.g. "11/05/2026 07:30:12".
const STARTED_AT = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::[0-5]\d)?$/;

// A session's length as hours:minutes:seconds, e.g. "0:20:00".
const DURATION = /^(\d+):([0-5]\d):([0-5]\d)$/;

const pad = (n: string) => n.padStart(2, "0");

// The start as a Day and HH:MM, or null when it names no real moment, such as 2/30 or 24:10.
function wallClock(startedAt: string): Pick<ImportedEntry, "date" | "startTime"> | null {
  const [, month = "", day = "", year = "", hour = "", minute = ""] =
    STARTED_AT.exec(startedAt) ?? [];

  const date = `${year}-${pad(month)}-${pad(day)}`;
  const startTime = `${pad(hour)}:${minute}`;
  const moment = new Date(`${date}T${startTime}:00Z`);

  // A day past the month's end parses as the next month, so only a round trip shows the start is real.
  return !Number.isNaN(moment.getTime()) && moment.toISOString().startsWith(`${date}T${startTime}`)
    ? { date, startTime }
    : null;
}

const StartedAt = z.pipe(
  z.string(),
  z.transform((text, ctx) => {
    const start = wallClock(text);

    if (start === null)
      ctx.issues.push({ code: "custom", message: "not a start time", input: text });

    return start ?? z.NEVER;
  }),
);

const Minutes = z.pipe(
  z.string().check(z.regex(DURATION)),
  z.transform((text) => {
    // Hours, minutes and seconds fold into seconds, then into minutes.
    return clampMinutes(text.split(":").reduce((total, part) => total * 60 + Number(part), 0) / 60);
  }),
);

const SessionRow = z.object({ start: StartedAt, minutes: Minutes });

/**
 * Turns Insight Timer's "Export Log" CSV (one row per session) into one entry per session, earliest first.
 * Skips rows it can't read. Null when the text is not an Insight Timer session log.
 */
export function insightTimerSessions(csv: string): ImportedEntry[] | null {
  const rows = csvRows(csv).map((row) => row.map((cell) => cell.trim()));
  const headerAt = rows.findIndex((row) => row.includes("Started At") && row.includes("Duration"));
  const header = rows[headerAt];

  if (header === undefined) return null;

  const startColumn = header.indexOf("Started At");
  const durationColumn = header.indexOf("Duration");

  const sessions = rows.slice(headerAt + 1);
  const entries: ImportedEntry[] = [];

  for (const row of sessions) {
    const parsed = SessionRow.safeParse({ start: row[startColumn], minutes: row[durationColumn] });

    if (parsed.success) entries.push({ ...parsed.data.start, minutes: parsed.data.minutes });
  }

  return oncePerStart(entries);
}
