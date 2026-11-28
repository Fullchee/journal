// Closing a quarter or a year (issue #61): period math, the sources each rung reads, and the saved body.

import * as z from "zod/mini";

import type { ActivityRow } from "./activity-summary";
import { ZONES, type Zone } from "./check-in-view";
import type { HabitDone } from "./habit-day";
import { shiftDay, torontoDay } from "./calendar";
import { parseModelReply, type BriefSleepNight } from "./session-brief";
import { NoteTitle } from "./notes-view";
import {
  activitySignalLine,
  goalKey,
  isoWeekOf,
  oneLine,
  shiftWeek,
  sleepSignalLine,
  mondayOfWeek,
} from "./weekly-review";

export const CloseKind = z.enum(["quarter", "year"]);

export type CloseKind = z.infer<typeof CloseKind>;

const SourceKind = z.enum(["week", "month", "quarter"]);

interface SourceKey {
  kind: z.infer<typeof SourceKind>;
  period: string;
}

const MONTHS_PER_QUARTER = 3;
const QUARTERS_PER_YEAR = 4;
const THURSDAY = 3;

const pad = (n: number) => String(n).padStart(2, "0");

// Day 0 of the next month is this month's last day.
const lastDayOf = (year: number, month: number) =>
  `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;

const quarterParts = (period: string) => {
  return { year: Number(period.slice(0, 4)), q: Number(period.slice(6)) };
};

const quarterOf = (index: number) =>
  `${Math.floor(index / QUARTERS_PER_YEAR)}-Q${(index % QUARTERS_PER_YEAR) + 1}`;

function quarterRange(period: string) {
  const { year, q } = quarterParts(period);
  const last = q * MONTHS_PER_QUARTER;

  return { from: `${year}-${pad(last - 2)}-01`, to: lastDayOf(year, last) };
}

const thursday = (week: string) => shiftDay(mondayOfWeek(week), THURSDAY);

// An ISO week belongs to the quarter holding its Thursday, as it belongs to that Thursday's year.
function quarterWeeks(from: string, to: string): SourceKey[] {
  const first = isoWeekOf(from);
  const weeks: SourceKey[] = [];

  for (
    let week = thursday(first) < from ? shiftWeek(first, 1) : first;
    thursday(week) <= to;
    week = shiftWeek(week, 1)
  )
    weeks.push({ kind: "week", period: week });

  return weeks;
}

function quarterSources(period: string): SourceKey[] {
  const { year, q } = quarterParts(period);
  const { from, to } = quarterRange(period);

  const months = Array.from(
    { length: MONTHS_PER_QUARTER },
    (_, i) => (q - 1) * MONTHS_PER_QUARTER + i + 1,
  );

  return [
    ...quarterWeeks(from, to),
    ...months.map((m): SourceKey => ({ kind: "month", period: `${year}-${pad(m)}` })),
  ];
}

const yearSources = (period: string) =>
  Array.from({ length: QUARTERS_PER_YEAR }, (_, i): SourceKey => ({
    kind: "quarter",
    period: `${period}-Q${i + 1}`,
  }));

interface Rung {
  pattern: RegExp;
  range: (period: string) => { from: string; to: string };
  sources: (period: string) => SourceKey[];
  shift: (period: string, by: number) => string;
  current: (day: string) => string;
  closingQuestion: string;
}

const RUNGS: Record<CloseKind, Rung> = {
  quarter: {
    pattern: /^\d{4}-Q[1-4]$/,
    range: quarterRange,
    sources: quarterSources,
    shift: (period, by) => {
      const { year, q } = quarterParts(period);

      return quarterOf(year * QUARTERS_PER_YEAR + q - 1 + by);
    },
    current: (day) =>
      `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / MONTHS_PER_QUARTER)}`,
    closingQuestion: "What actually shifted this quarter, and which practice genuinely stuck?",
  },
  year: {
    pattern: /^\d{4}$/,
    range: (period) => ({ from: `${period}-01-01`, to: `${period}-12-31` }),
    sources: yearSources,
    shift: (period, by) => String(Number(period) + by),
    current: (day) => day.slice(0, 4),
    closingQuestion:
      "What was this year about for you personally, the through-line across the four quarters?",
  },
};

export const isClosePeriod = (kind: CloseKind, period: string) => RUNGS[kind].pattern.test(period);

/** The period's first and last day, YYYY-MM-DD. */
export const periodRange = (kind: CloseKind, period: string) => RUNGS[kind].range(period);

/** The reflection rows a close reads: a quarter's weeks and months, or a year's quarters. */
export const closeSources = (kind: CloseKind, period: string) => RUNGS[kind].sources(period);

export const shiftClosePeriod = (kind: CloseKind, period: string, by: number) =>
  RUNGS[kind].shift(period, by);

/** The quarter or year holding Toronto today. */
export const currentPeriod = (kind: CloseKind, now: Date) => RUNGS[kind].current(torontoDay(now));

export const closingQuestion = (kind: CloseKind) => RUNGS[kind].closingQuestion;

/** Goals picked at a year close are Active from the next January. */
export const nextYearStart = (year: string) => `${Number(year) + 1}-01`;

const MoveKind = z.enum(["carry", "revise", "retire", "achieve"]);

export type MoveKind = z.infer<typeof MoveKind>;

/** A revise carries the Goal's new wording; the other moves need nothing more. */
export type GoalMove = { move: Exclude<MoveKind, "revise"> } | { move: "revise"; revision: string };

const VERB: Record<MoveKind, string> = {
  carry: "carried",
  revise: "revised",
  retire: "retired",
  achieve: "achieved",
};

const DASH = " — ";

/** The reflection's line for one move: its date, then e.g. `Cultivate Meditation achieved: <words>`. A carry changes nothing, so it gets no date. */
export function goalMoveLine(date: string, goal: string, move: GoalMove, words: string) {
  const what =
    move.move === "revise"
      ? `${goal} revised to ${oneLine(move.revision)}`
      : `${goal} ${VERB[move.move]}`;

  const line = move.move === "carry" ? what : `${date}${DASH}${what}`;
  const said = oneLine(words);

  return said === "" ? line : `${line}: ${said}`;
}

const DATED_MOVE = new RegExp(String.raw`^- \d{4}-\d{2}-\d{2}${DASH}.+$`, "gm");

/**
 * The dated move lines of a saved close. An achieved or retired Goal leaves the active list, so a replacing
 * save can't write its line again; the replace keeps every earlier one instead.
 */
export const savedMoveLines = (body: string) =>
  [...body.matchAll(DATED_MOVE)].map(([whole]) => whole.slice("- ".length));

export interface CloseSections {
  arc: string;
  /** One goalMoveLine per active Goal. */
  goalLines: string[];
  /** The owner's answer to the closing question. */
  answer: string;
  /** Titles of the Goals picked for next year; a quarter has none. */
  newGoals: string[];
}

const paragraph = (text: string) => (text.trim() === "" ? [] : [text.trim(), ""]);

const bullets = (lines: string[]) => [...lines.map((line) => `- ${line}`), ""];

const goalSection = (lines: string[]) =>
  lines.length === 0 ? ["No active Goals.", ""] : bullets(lines);

// The year's closing question asks for its through-line, so the answer sits under that heading.
const BODIES: Record<CloseKind, (s: CloseSections) => string[]> = {
  quarter: ({ arc, goalLines, answer }) => [
    "## The arc this quarter",
    "",
    ...paragraph(arc),
    "## Goal review",
    "",
    ...goalSection(goalLines),
    "## What shifted, and which practice stuck?",
    "",
    ...paragraph(answer),
  ],
  year: ({ arc, goalLines, answer, newGoals }) => [
    "## The through-line this year",
    "",
    ...paragraph(arc),
    ...paragraph(answer),
    "## Goal movement this year",
    "",
    ...goalSection(goalLines),
    ...(newGoals.length === 0 ? [] : ["### Next year's Goals", "", ...bullets(newGoals)]),
  ],
};

/** The reflection row's Markdown under the rung's fixed headings. */
export const assembleCloseBody = (kind: CloseKind, sections: CloseSections) =>
  `${BODIES[kind](sections).join("\n").trimEnd()}\n`;

export interface CheckInZone {
  checkedInAt: string;
  zone: Zone;
}

export interface SignalInput {
  sleep: BriefSleepNight[];
  activity: ActivityRow[];
  /** May hold rows from either side of the period; only its Toronto days count. */
  checkIns: CheckInZone[];
  habitsDone: HabitDone[];
}

function checkInLine(checkIns: CheckInZone[]) {
  if (checkIns.length === 0) return [];

  const zones = ZONES.map((zone) => [zone, checkIns.filter((c) => c.zone === zone).length] as const)
    .filter(([, count]) => count > 0)
    .map(([zone, count]) => `${zone} ${count}`);

  return [`- Check-ins: ${checkIns.length} (${zones.join(", ")})`];
}

const doneOn = ([name, n]: [string, number]) => `${name} on ${n} ${n === 1 ? "day" : "days"}`;

function habitsLine(done: HabitDone[]) {
  if (done.length === 0) return [];

  const days = new Map<string, number>();

  for (const { name } of done) days.set(name, (days.get(name) ?? 0) + 1);
  const counts = [...days].toSorted(([a, x], [b, y]) => (y === x ? a.localeCompare(b) : y - x));

  return [`- Habits done: ${counts.map((count) => doneOn(count)).join(", ")}`];
}

/** One line per signal read fresh for the period; a signal with no data gets no line. */
export function closeSignals(
  { sleep, activity, checkIns, habitsDone }: SignalInput,
  from: string,
  to: string,
) {
  const inPeriod = checkIns.filter(({ checkedInAt }) => {
    const day = torontoDay(checkedInAt);

    return day >= from && day <= to;
  });

  return [
    ...sleepSignalLine(sleep),
    ...activitySignalLine(activity),
    ...checkInLine(inPeriod),
    ...habitsLine(habitsDone),
  ];
}

const SavedClose = z.object({ id: z.number(), body: z.string() });

/** `body` is null when the source period has no row. */
const CloseSource = z.object({
  kind: SourceKind,
  period: z.string(),
  body: z.nullable(z.string()),
});

const CloseGoal = z.object({
  id: z.number(),
  title: z.string(),
  why: z.string(),
  habits: z.array(z.string()),
});

export type CloseGoal = z.infer<typeof CloseGoal>;

export const CloseSourcesBody = z.object({
  kind: CloseKind,
  period: z.string(),
  sources: z.array(CloseSource),
  signals: z.array(z.string()),
  goals: z.array(CloseGoal),
  existing: z.nullable(SavedClose),
});

export type CloseSourcesBody = z.infer<typeof CloseSourcesBody>;

/** With no written source and no signal there is nothing to close. */
export const hasCloseContent = ({ sources, signals }: CloseSourcesBody) =>
  signals.length > 0 || sources.some(({ body }) => body !== null && body.trim() !== "");

// The model proposes only a direction; a Goal's felt why is the owner's to write, never drafted.
const ProposedGoal = z.object({ title: z.string() });

export type ProposedGoal = z.infer<typeof ProposedGoal>;

// The model may answer a move outside the four; that Goal is carried rather than losing the whole draft.
const ModelReview = z.object({
  goal: z.string(),
  review: z.string(),
  move: z.catch(MoveKind, "carry"),
  revision: z._default(z.string(), ""),
});

const CloseDraftReply = z.object({
  arc: z.string(),
  reviews: z.array(ModelReview),
  newGoals: z._default(z.array(ProposedGoal), []),
});

type CloseDraftReply = z.infer<typeof CloseDraftReply>;

export const parseCloseDraft = (reply?: string): CloseDraftReply | null =>
  parseModelReply(CloseDraftReply, reply);

const GoalReview = z.object({
  goalId: z.number(),
  review: z.string(),
  move: MoveKind,
  revision: z.string(),
});

export const CloseDraft = z.object({
  arc: z.string(),
  reviews: z.array(GoalReview),
  newGoals: z.array(ProposedGoal),
});

export type CloseDraft = z.infer<typeof CloseDraft>;

/** Exactly one review per active Goal, matched by title; the first the model gave wins and a skipped Goal is carried. */
export function draftFor(kind: CloseKind, goals: CloseGoal[], reply: CloseDraftReply): CloseDraft {
  const reviews = new Map<string, CloseDraftReply["reviews"][number]>();

  for (const review of reply.reviews)
    if (!reviews.has(goalKey(review.goal))) reviews.set(goalKey(review.goal), review);

  return {
    arc: reply.arc,
    reviews: goals.map(({ id, title }) => {
      const { review = "", move = "carry", revision = "" } = reviews.get(goalKey(title)) ?? {};

      return { goalId: id, review, move, revision };
    }),
    newGoals: kind === "year" ? reply.newGoals : [],
  };
}

const SavedMove = z.discriminatedUnion("move", [
  z.object({ goalId: z.int(), move: z.enum(["carry", "retire", "achieve"]), words: z.string() }),
  z.object({ goalId: z.int(), move: z.literal("revise"), revision: NoteTitle, words: z.string() }),
]);

export type SavedMove = z.infer<typeof SavedMove>;

const NewGoal = z.object({ title: NoteTitle });

/** What PUT /api/close saves; `replace` must be true to overwrite the period's row. */
export const CloseSave = z.object({
  arc: z.string(),
  answer: z.string(),
  moves: z.array(SavedMove),
  newGoals: z._default(z.array(NewGoal), []),
  replace: z._default(z.boolean(), false),
});

export type CloseSave = z.input<typeof CloseSave>;
