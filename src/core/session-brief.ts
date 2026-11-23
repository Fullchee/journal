import * as z from "zod/mini";

import { AmountLabel, amountLabel, isTiredButWired } from "./check-in-mood";
import { ZONES, type CheckIn } from "./check-in-view";
import { MISSED, type HabitDone } from "./habit-day";
import { Reschedule, Skip, type Reschedules } from "./habits-view";
import { clockLabel, shiftDay, torontoDay, torontoTime } from "./calendar";

/** Copied from journal's functions/_lib, which owns the calendar lookup and the model call. */

export type CalendarResult<T> =
  | { status: "ok"; value: T }
  | { status: "not-connected" }
  | { status: "unreachable" };

export interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
}

/** The Health plan is free markdown; the coach is the line "Coach: <name>". */
export function coachName(plan: string) {
  const label = /^[ \t>*-]*coach\**\s*:/im.exec(plan);

  if (label === null) return null;
  // Blank lines may sit between the label and the name.
  const rest = plan.slice(label.index + label[0].length).replace(/^\**\s*/, "");

  const name = rest
    .replace(/\n[\s\S]*/, "")
    .replaceAll("*", "")
    .trim();

  return name === "" ? null : name;
}

const CalendarState = z.enum(["found", "no-match", "no-coach", "not-connected", "unreachable"]);

type CalendarState = z.infer<typeof CalendarState>;

export const BriefWindow = z.object({ start: z.string(), calendar: CalendarState });

export type BriefWindow = z.infer<typeof BriefWindow>;

export type SessionSearch = CalendarResult<CalendarEvent[]> | null;

/** `search` is null when the plan names no coach, so no lookup ran. */
export function windowFrom(search: SessionSearch, now: Date): BriefWindow {
  const fallback = shiftDay(torontoDay(now), -7);

  if (search === null) return { start: fallback, calendar: "no-coach" };

  if (search.status !== "ok") return { start: fallback, calendar: search.status };
  const past = search.value.filter((e) => e.start.includes("T") && new Date(e.start) <= now);
  const last = past.at(-1);

  return last
    ? { start: torontoDay(last.start), calendar: "found" }
    : { start: fallback, calendar: "no-match" };
}

export const BriefSleepNight = z.object({
  date: z.string(),
  durationMin: z.number(),
  sleepScore: z.nullable(z.number()),
});

export type BriefSleepNight = z.infer<typeof BriefSleepNight>;

export const BriefRow = z.object({
  day: z.string(),
  time: z.string(),
  zone: z.enum(ZONES),
  score: z.number(),
  where: z.string(),
  doing: z.string(),
  onMyMind: z.string(),
  note: z.string(),
  tense: AmountLabel,
  low: AmountLabel,
  tired: AmountLabel,
  tiredButWired: z.boolean(),
});

export type BriefRow = z.infer<typeof BriefRow>;

const HabitDays = z.object({ name: z.string(), days: z.number() });

/** The One-offs, their checks and Reschedules, as the Session brief reads them. */
export interface OneOffInput {
  habits: { id: string; name: string; startDate: string }[];
  checks: { habit: string; date: string; count: number }[];
  reschedules: Reschedules;
}

const BriefReschedule = z.extend(
  z.pick(Reschedule, { from: true, to: true, cause: true, note: true }),
  {
    on: z.string(),
    flagged: z.boolean(),
  },
);

type BriefReschedule = z.infer<typeof BriefReschedule>;

/** `due` is today or later and unanswered: not yet overdue. */
const OneOffStatus = z.enum(["done", "not-done", "overdue", "due"]);

type OneOffStatus = z.infer<typeof OneOffStatus>;

const BriefOneOff = z.object({
  name: z.string(),
  due: z.string(),
  status: OneOffStatus,
  answeredOn: z.nullable(z.string()),
  reschedules: z.array(BriefReschedule),
});

export type BriefOneOff = z.infer<typeof BriefOneOff>;

/** A recurring Habit skipped with a cause, as the Session brief reads it. */
export interface SkipInput {
  name: string;
  date: string;
  cause: Skip["cause"];
  note: string;
}

const BriefSkip = z.extend(Skip, {
  name: z.string(),
  date: z.string(),
  flagged: z.boolean(),
});

export type BriefSkip = z.infer<typeof BriefSkip>;

/** Oldest first; only avoidance is flagged, as with Reschedules. */
export const skipsOf = (start: string, skips: SkipInput[]): BriefSkip[] =>
  skips
    .filter((s) => s.date >= start)
    .toSorted((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ ...s, flagged: s.cause === "avoidance" }));

/** A note on a Duration entry or a Habit check, such as "Android wrapper" under Side projects. */
const BriefNote = z.object({ name: z.string(), date: z.string(), note: z.string() });

export type BriefNote = z.infer<typeof BriefNote>;

export const BriefFacts = z.object({
  start: z.string(),
  end: z.string(),
  rows: z.array(BriefRow),
  sleep: z.array(BriefSleepNight),
  lows: z.array(BriefRow),
  highs: z.array(BriefRow),
  habits: z.array(HabitDays),
  oneOffs: z.array(BriefOneOff),
  skips: z.array(BriefSkip),
  notes: z.array(BriefNote),
});

export type BriefFacts = z.infer<typeof BriefFacts>;

const STATUS_ORDER: Record<OneOffStatus, number> = { overdue: 0, "not-done": 1, done: 1, due: 1 };

function statusOf(answer: { count: number } | undefined, due: string, end: string): OneOffStatus {
  if (answer) return answer.count === MISSED ? "not-done" : "done";

  return due < end ? "overdue" : "due";
}

/**
 * As on Today, only a check on or after the due date answers a One-off.
 * A One-off belongs in the window when it was answered, moved or due by its end and still open.
 */
export function oneOffsOf(start: string, end: string, input: OneOffInput): BriefOneOff[] {
  const oneOffs = input.habits.map(({ id, name, startDate }) => {
    const answer = input.checks.find((c) => c.habit === id && c.date >= startDate);

    const reschedules = (input.reschedules[id] ?? [])
      .map(({ from, to, cause, note, createdAt }) => ({
        from,
        to,
        cause,
        note,
        on: torontoDay(createdAt),
        flagged: cause === "avoidance",
      }))
      .filter((r) => r.on >= start);

    const answeredOn = answer?.date ?? null;

    const inWindow =
      answeredOn === null ? startDate <= end || reschedules.length > 0 : answeredOn >= start;

    const status = statusOf(answer, startDate, end);

    return { inWindow, oneOff: { name, due: startDate, status, answeredOn, reschedules } };
  });

  return oneOffs
    .filter((o) => o.inWindow)
    .map((o) => o.oneOff)
    .toSorted((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];

      return byStatus === 0 ? a.due.localeCompare(b.due) : byStatus;
    });
}

/** A Check-in as a brief or a Weekly retro lists it, on its Toronto day and time. */
export const briefRowOf = (c: CheckIn): BriefRow => ({
  day: torontoDay(c.checkedInAt),
  time: clockLabel(torontoTime(c.checkedInAt)),
  zone: c.zone,
  score: c.score,
  where: c.place,
  doing: c.doing,
  onMyMind: c.thought,
  note: c.note,
  tense: amountLabel(c.tense),
  low: amountLabel(c.low),
  tired: amountLabel(c.tired),
  tiredButWired: isTiredButWired(c),
});

/** Days run oldest first. Lows are Storm and Rain; highs are Sun. */
export function factsOf(
  start: string,
  now: Date,
  {
    checkIns,
    sleep,
    habitsDone,
    oneOffs,
    skips,
    notes,
  }: {
    checkIns: CheckIn[];
    sleep: BriefSleepNight[];
    habitsDone: HabitDone[];
    oneOffs: OneOffInput;
    skips: SkipInput[];
    notes: BriefNote[];
  },
): BriefFacts {
  const rows = checkIns
    .filter((c) => torontoDay(c.checkedInAt) >= start)
    .toSorted((a, b) => a.checkedInAt.localeCompare(b.checkedInAt))
    .map((c) => briefRowOf(c));

  const counts = new Map<string, number>();

  for (const h of habitsDone) {
    if (h.date < start) continue;
    counts.set(h.name, (counts.get(h.name) ?? 0) + 1);
  }

  const end = torontoDay(now);

  return {
    start,
    end,
    rows,
    sleep: sleep.filter((n) => n.date >= start),
    lows: rows.filter((r) => r.zone === "Storm" || r.zone === "Rain"),
    highs: rows.filter((r) => r.zone === "Sun"),
    habits: [...counts].map(([name, days]) => ({ name, days })).toSorted((a, b) => b.days - a.days),
    oneOffs: oneOffsOf(start, end, oneOffs),
    skips: skipsOf(start, skips),
    notes: notes.filter((n) => n.date >= start).toSorted((a, b) => a.date.localeCompare(b.date)),
  };
}

export const Prose = z.object({
  summary: z.string(),
  patterns: z.array(z.string()),
  toRaise: z.string(),
});

export type Prose = z.infer<typeof Prose>;

/** The model's reply is untrusted text: anything but the `schema`'s JSON shape is a failure. */
export function parseModelReply<S extends z.ZodMiniType>(schema: S, reply = ""): z.infer<S> | null {
  // The JSON may sit in a code fence or among prose, so it runs from the first brace to the last.
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");

  if (from === -1 || to < from) return null;

  try {
    return schema.safeParse(JSON.parse(reply.slice(from, to + 1))).data ?? null;
  } catch {
    return null;
  }
}

export const parseProse = (reply?: string): Prose | null => parseModelReply(Prose, reply);

/** What the start-date line says about where the date came from. */
export function windowNote({ calendar }: BriefWindow, coach: string | null) {
  switch (calendar) {
    case "found": {
      return `Starts at your last session with ${coach}. Change the date if that is wrong.`;
    }

    case "no-match": {
      return `No past session with ${coach} on the calendar, so this covers the last 7 days.`;
    }

    case "no-coach": {
      return 'The Health plan has no "Coach: <name>" line, so this covers the last 7 days.';
    }

    case "not-connected": {
      return "Google Calendar is not connected (#85): reconnect it to find your last session. Covering the last 7 days.";
    }

    case "unreachable": {
      return "The calendar is unreachable, so this covers the last 7 days. Edit the date if you know your last session.";
    }
  }
}
