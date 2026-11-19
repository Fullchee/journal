import * as z from "zod/mini";

import { formatDay } from "./calendar";
import { moodLines } from "./check-in-mood";
import {
  BriefFacts,
  Prose,
  type BriefRow,
  type BriefSkip,
  type BriefSleepNight,
} from "./session-brief";

/** What GET /api/session-brief returns; `prose` is null when the model fails or there are no Check-ins. */
export const BriefBody = z.object({ facts: BriefFacts, prose: z.nullable(Prose) });

export type BriefBody = z.infer<typeof BriefBody>;

export const PROSE_MISSING = "The prose couldn't be written.";
export const SUMMARY_MISSING = "The summary couldn't be written; the data is below.";
export const NO_PATTERNS = "No pattern with 2+ data points.";

// An empty field adds nothing to the line.
const filled = (field: string, text: string) => (field === "" ? "" : text);

// A night is dated by the morning it ends, so it is the sleep before that Day's Check-ins.
// The brief never grades, so the sleep score stays out.
function nightBefore(day: string, sleep: BriefSleepNight[]) {
  const night = sleep.find((n) => n.date === day);

  return night ? ` · after ${(night.durationMin / 60).toFixed(1)}h sleep` : "";
}

/** One Low or High as journal lists it: when, zone, where, doing, the thought and note, then the night before. */
export const briefRowLine = (row: BriefRow, sleep: BriefSleepNight[]) =>
  [
    `${row.day} ${row.time}, ${row.zone}`,
    filled(row.where, `, ${row.where}`),
    filled(row.doing, `, ${row.doing}`),
    filled(row.onMyMind, `: ${row.onMyMind}`),
    filled(row.note, ` “${row.note}”`),
    nightBefore(row.day, sleep),
  ].join("");

export const sleepLine = (sleep: BriefSleepNight[]) =>
  sleep.map((n) => `${n.date} ${(n.durationMin / 60).toFixed(1)}h`).join(", ");

export const habitLine = ({ name, days }: { name: string; days: number }) =>
  `${name}: ${days} ${days === 1 ? "day" : "days"}`;

const SKIP_CAUSES = { outside: "outside", avoidance: "avoidance (flagged)" } as const;

/** One Skip: when, which Habit, its cause, then the note. */
export function skipLine({ date, name, cause, note }: BriefSkip) {
  const quoted = filled(note, ` “${note}”`);

  return `${date} ${name}: ${SKIP_CAUSES[cause]}${quoted}`;
}

const list = (items: string[], empty: string) =>
  items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : empty;

// Markdown cells can't hold a pipe or a line break.
const cell = (text: string) => text.replaceAll("|", String.raw`\|`).replaceAll("\n", " ");

const monthDay = (day: string) => formatDay(day, { month: "short", day: "numeric" });

/** A saved brief's Health record title, such as "Session brief, Nov 8 to Nov 15"; titles are unique, so it names the window. */
export const briefRecordTitle = ({ facts }: BriefBody) =>
  `Session brief, ${monthDay(facts.start)} to ${monthDay(facts.end)}`;

/** The brief as Markdown, to share with the coach; the same sections as the screen. */
export function briefMarkdown({ facts, prose }: BriefBody) {
  const title = `# Session brief: ${facts.start} to ${facts.end}`;

  if (facts.rows.length === 0) return `${title}\n\nNo Check-ins in this window.\n`;

  const table = [
    "| Day | Weather | Where | Doing | On my mind |",
    "| --- | --- | --- | --- | --- |",
    ...facts.rows.map((r) =>
      [
        `${r.day} ${r.time}`,
        `${r.zone} (${r.score})`,
        r.where,
        r.doing,
        r.onMyMind === "" ? r.note : r.onMyMind,
      ]
        .map((text) => cell(text))
        .join(" | ")
        .replace(/^/, "| ")
        .concat(" |"),
    ),
  ].join("\n");

  return [
    title,
    `**The week in one line:** ${prose?.summary ?? SUMMARY_MISSING}`,
    `## Day by day\n\n${table}`,
    facts.sleep.length > 0 && `**Sleep:** ${sleepLine(facts.sleep)}`,
    moodLines(facts.rows).length > 0 &&
      `## Tense, Low and Tired\n\n${list(moodLines(facts.rows), "")}`,
    `## Lows\n\n${list(
      facts.lows.map((row) => briefRowLine(row, facts.sleep)),
      "None.",
    )}`,
    `## Highs\n\n${list(
      facts.highs.map((row) => briefRowLine(row, facts.sleep)),
      "None.",
    )}`,
    `## Patterns I noticed\n\n${prose ? list(prose.patterns, NO_PATTERNS) : PROSE_MISSING}`,
    `## What helped\n\n${list(
      facts.habits.map((habit) => habitLine(habit)),
      "No habit checks.",
    )}`,
    facts.skips.length > 0 &&
      `## Skips\n\n${list(
        facts.skips.map((skip) => skipLine(skip)),
        "",
      )}`,
    `## To raise in session\n\n${prose?.toRaise ?? PROSE_MISSING}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .concat("\n");
}
