import { daysFrom, mondayOf, monthDaysOf, shiftDay, torontoDay } from "./calendar";
import { dueBySchedule, habitDayReader, type DayReading, type StreakRecords } from "./habit-day";
import { dueDateLabel, TRACKED_TARGET_TYPES, type Habit } from "./habits-view";
import { restPeriodOn, type RestPeriod } from "./rest-mode";

const STARTING_FREEZES = 2;
const MAX_FREEZES = 3;
const UNITS_PER_FREEZE = 7;
const REPAIR_DAYS = 7;
const REPAIR_DONE_DAYS = 2;

/**
 * How one day reads in a Streak: `freeze` and `outside` bridge a missed day, `rest` is a Rest mode day,
 * `open` is today before it is done. A day the Habit isn't due has no mark.
 */
export type StreakMark = "done" | "freeze" | "outside" | "rest" | "missed" | "open";

/** The latest break while it can still be repaired: 2 done due days by `closesOn` bring back `restores`. */
export interface Repair {
  brokeOn: string;
  closesOn: string;
  /** The Streak the break ended. */
  restores: number;
  /** Done due days since the break, toward the 2 it takes. */
  doneDays: number;
}

export interface Streak {
  /** An N-a-week Habit counts weeks in a row meeting N, an N-a-month one months; every other Habit counts due days. */
  unit: "day" | "week" | "month";
  current: number;
  /** The highest the Streak has reached; it never goes down. */
  longest: number;
  freezes: number;
  /** Freezes used since the last done day or week, for the Freeze note. */
  freezesSinceDone: number;
  /** Each due day's mark, from the first done day to today. */
  marks: Record<string, StreakMark>;
  repair: Repair | null;
}

/** Recurring `good` Habits have a Streak; One-offs, Reference Habits and `bad` Habits don't. */
export const hasStreak = ({ kind, target }: Pick<Habit, "kind" | "target">) =>
  kind === "good" && TRACKED_TARGET_TYPES.some((type) => type === target.type);

/** What a replay needs to know about one day. */
export interface DayFacts {
  /** Toward the week's N: a counted Habit's count, otherwise 1 when done. */
  value: number;
  rest: boolean;
  outside: boolean;
}

/** One due day, or one week or month of an N-a-week or N-a-month Habit, as the replay steps through it. */
export interface Slot {
  end: string;
  status: "done" | "covered" | "missed" | "open";
  doneDays: string[];
  /** A Rest day in the slot pauses Freeze earning. */
  rest: boolean;
}

/** A day's Streak mark. Today and later are not over, so only a done day counts there. */
export function dayMark(facts: DayFacts, day: string, today: string): StreakMark {
  if (facts.value > 0) return "done";

  if (day >= today) return "open";

  if (facts.rest) return "rest";

  return facts.outside ? "outside" : "missed";
}

const SLOT_OF_MARK = {
  done: "done",
  rest: "covered",
  outside: "covered",
  freeze: "missed",
  missed: "missed",
  open: "open",
} as const;

export function weekSlot(
  days: string[],
  factsOf: (day: string) => DayFacts,
  needed: number,
  today: string,
): Slot {
  const facts = days.map((day) => factsOf(day));
  const done = facts.reduce((sum, { value }) => sum + value, 0);

  const covered = facts.filter(
    ({ value, rest, outside }) => value === 0 && (rest || outside),
  ).length;

  const end = days.at(-1) ?? today;
  const doneDays = days.filter((day) => factsOf(day).value > 0);
  const rest = facts.some((f) => f.rest);

  if (done >= needed) return { end, status: "done", doneDays, rest };

  if (end >= today) return { end, status: "open", doneDays, rest };

  return { end, status: done + covered >= needed ? "covered" : "missed", doneDays, rest };
}

interface Replay {
  current: number;
  longest: number;
  freezes: number;
  freezesSinceDone: number;
  /** Done units in a row toward the next Freeze. */
  inARow: number;
  frozen: Set<string>;
  repair: Repair | null;
}

function countDone(state: Replay, slot: Slot) {
  state.current++;
  state.freezesSinceDone = 0;

  if (!slot.rest) state.inARow++;

  if (state.inARow < UNITS_PER_FREEZE) return;

  state.inARow = 0;
  state.freezes = Math.min(MAX_FREEZES, state.freezes + 1);
}

function countTowardRepair(state: Replay, slot: Slot) {
  const { repair } = state;

  if (repair === null) return;

  repair.doneDays += slot.doneDays.filter(
    (day) => day > repair.brokeOn && day <= repair.closesOn,
  ).length;

  if (repair.doneDays < REPAIR_DONE_DAYS) return;

  state.current += repair.restores;
  state.repair = null;
}

// Only the latest break can be repaired, so a new one replaces it.
function countMissed(state: Replay, slot: Slot) {
  if (state.freezes > 0) {
    state.freezes--;
    state.freezesSinceDone++;
    state.frozen.add(slot.end);

    return;
  }

  if (state.current === 0) return;

  state.repair = {
    brokeOn: slot.end,
    closesOn: shiftDay(slot.end, REPAIR_DAYS),
    restores: state.current,
    doneDays: 0,
  };
  state.current = 0;
  state.freezesSinceDone = 0;
  state.inARow = 0;
}

// Covered slots add 0 and pause the earning count; a missed one uses a Freeze or breaks the Streak.
function replay(slots: Slot[]): Replay {
  const state: Replay = {
    current: 0,
    longest: 0,
    freezes: STARTING_FREEZES,
    freezesSinceDone: 0,
    inARow: 0,
    frozen: new Set(),
    repair: null,
  };

  for (const slot of slots) {
    if (slot.status === "done") countDone(state, slot);

    countTowardRepair(state, slot);

    if (slot.status === "missed") countMissed(state, slot);

    state.longest = Math.max(state.longest, state.current);
  }

  return state;
}

// The day a period's slot ends on, which a Freeze records.
const PERIOD_END: Record<Streak["unit"], (day: string) => string> = {
  day: (day) => day,
  week: (day) => shiftDay(mondayOf(day), 6),
  month: (day) => shiftDay(`${day.slice(0, 7)}-01`, monthDaysOf(day).length - 1),
};

function streakOf(
  unit: Streak["unit"],
  slots: Slot[],
  marks: Record<string, StreakMark>,
  today: string,
): Streak {
  const { current, longest, freezes, freezesSinceDone, frozen, repair } = replay(slots);

  // A frozen week or month marks each of its missed days as covered by the Freeze.
  for (const [day, mark] of Object.entries(marks))
    if (mark === "missed" && frozen.has(PERIOD_END[unit](day))) marks[day] = "freeze";

  return {
    unit,
    current,
    longest,
    freezes,
    freezesSinceDone,
    marks,
    repair: repair !== null && today <= repair.closesOn ? repair : null,
  };
}

function dailySlots(dueDays: string[], factsOf: (day: string) => DayFacts, today: string) {
  const marks: Record<string, StreakMark> = {};
  const slots: Slot[] = [];

  for (const day of dueDays) {
    const facts = factsOf(day);
    const mark = dayMark(facts, day, today);
    marks[day] = mark;
    slots.push({
      end: day,
      status: SLOT_OF_MARK[mark],
      doneDays: mark === "done" ? [day] : [],
      rest: facts.rest,
    });
  }

  return { slots, marks };
}

function periodSlots(
  periods: string[][],
  factsOf: (day: string) => DayFacts,
  { needed, isDue }: { needed: number; isDue: (day: string) => boolean },
  today: string,
) {
  const marks: Record<string, StreakMark> = {};

  // A day after today has no mark yet, and neither has a day outside a Season.
  for (const day of periods.flat())
    if (day <= today && isDue(day)) marks[day] = dayMark(factsOf(day), day, today);

  const slots = periods.map((days) => weekSlot(days, factsOf, needed, today));

  return { slots, marks };
}

// The weeks or calendar months from the one holding `first` to the one holding `today`.
function periodsFrom(unit: "week" | "month", first: string, today: string) {
  const periods: string[][] = [];

  if (unit === "week") {
    for (let monday = mondayOf(first); monday <= today; monday = shiftDay(monday, 7))
      periods.push(daysFrom(monday, shiftDay(monday, 6)));

    return periods;
  }

  for (let day = `${first.slice(0, 7)}-01`; day <= today;) {
    const days = monthDaysOf(day);
    periods.push(days);
    day = shiftDay(day, days.length);
  }

  return periods;
}

function unitOf({ target }: Pick<Habit, "target">): Streak["unit"] {
  if (target.type === "weekly") return "week";

  return target.type === "monthly" ? "month" : "day";
}

/** A Day as a Streak reads it: a day outside a Season covers its share of a week's N, like an outside Skip. */
export const streakFacts = ({ inSeason, value, rest, skip }: DayReading): DayFacts =>
  inSeason
    ? { value, rest, outside: skip?.cause === "outside" }
    : { value: 0, rest: false, outside: true };

const firstDay = (days: string[]) => days.toSorted((a, b) => a.localeCompare(b))[0];

const EMPTY_STREAK = (unit: Streak["unit"]): Streak => ({
  unit,
  current: 0,
  longest: 0,
  freezes: STARTING_FREEZES,
  freezesSinceDone: 0,
  marks: {},
  repair: null,
});

/**
 * A Habit's Streak, replayed from its first done day to today, a Toronto day (midnight boundary).
 * Computed from checks, Skips and Rest periods; nothing about it is stored.
 */
export function habitStreak(habit: Habit, records: StreakRecords, now: Date): Streak {
  const today = torontoDay(now);
  const unit = unitOf(habit);
  const read = habitDayReader(habit, records);
  const factsOf = (day: string) => streakFacts(read(day));
  const loggedDays = [...Object.keys(records.counts), ...Object.keys(records.durations)];
  const first = firstDay(loggedDays.filter((day) => day <= today && read(day).done));

  if (first === undefined) return EMPTY_STREAK(unit);

  const inSeason = (day: string) => read(day).inSeason;

  if (unit !== "day") {
    const { slots, marks } = periodSlots(
      periodsFrom(unit, first, today),
      factsOf,
      { needed: habit.target.count, isDue: inSeason },
      today,
    );

    return streakOf(unit, slots, marks, today);
  }

  const { slots, marks } = dailySlots(
    daysFrom(first, today).filter((day) => read(day).due),
    factsOf,
    today,
  );

  return streakOf(unit, slots, marks, today);
}

/** The Check-in Streak: days with at least one Check-in, with a daily Habit's Freezes, Repair and Rest mode. */
export function checkInStreak(checkedInAt: string[], restPeriods: RestPeriod[], now: Date): Streak {
  const today = torontoDay(now);
  const checkedIn = new Set(checkedInAt.map((at) => torontoDay(at)));
  const first = firstDay([...checkedIn].filter((day) => day <= today));

  if (first === undefined) return EMPTY_STREAK("day");

  const factsOf = (day: string): DayFacts => ({
    value: checkedIn.has(day) ? 1 : 0,
    rest: restPeriodOn(restPeriods, day) !== null,
    outside: false,
  });

  const { slots, marks } = dailySlots(daysFrom(first, today), factsOf, today);

  return streakOf("day", slots, marks, today);
}

/** The Streaks that call for a big celebration. */
const MILESTONES = [7, 30, 100, 365];

/** The highest milestone a Streak passed going from `before` to `after`, or null. */
export const reachedMilestone = (before: number, after: number) =>
  MILESTONES.findLast((milestone) => before < milestone && milestone <= after) ?? null;

/** Today's Repair prompt; "once more" after the first of the 2 done days. Never worded as a loss. */
export function repairPrompt(name: string, { unit, repair }: Pick<Streak, "unit" | "repair">) {
  if (repair === null) return null;

  const times = repair.doneDays === 0 ? `on ${REPAIR_DONE_DAYS} days` : "once more";

  return `${name} ${times} by ${dueDateLabel(repair.closesOn)} brings back its ${repair.restores}-${unit} Streak.`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** "12 days", or weeks or months for an N-a-week or N-a-month Habit. */
export const currentStreakLabel = ({ unit, current }: Pick<Streak, "unit" | "current">) =>
  plural(current, unit);

/** "12 days · longest 30". */
export const streakLabel = (streak: Pick<Streak, "unit" | "current" | "longest">) =>
  `${currentStreakLabel(streak)} · longest ${streak.longest}`;

export const freezesLabel = ({ freezes }: Pick<Streak, "freezes">) => plural(freezes, "Freeze");

/** Shown after a Freeze covers a day, until the next done day; never worded as a loss. */
export const freezeNote = (
  name: string,
  { unit, freezesSinceDone }: Pick<Streak, "unit" | "freezesSinceDone">,
) =>
  freezesSinceDone === 0
    ? null
    : `Used ${plural(freezesSinceDone, "Freeze")} on ${name}. ${UNITS_PER_FREEZE} done ${unit}s in a row earns one; hold up to ${MAX_FREEZES}.`;

/** A grid day: a Streak mark, `off` when not due, `later` after today. */
export type GridMark = StreakMark | "off" | "later";

export interface GridDay {
  date: string;
  mark: GridMark;
  label: string;
}

const GRID_LABELS: Record<GridMark, string> = {
  done: "Done",
  freeze: "Freeze",
  outside: "Skipped, outside",
  rest: "Rest",
  missed: "Not done",
  open: "Today",
  off: "Not due",
  later: "Later",
};

/** The Habit's day grid: `weeks` Monday-to-Sunday rows, the last one this week. */
export function streakGrid(
  habit: Pick<Habit, "target" | "seasons" | "startDate">,
  streak: Pick<Streak, "marks">,
  weeks: number,
  now: Date,
): GridDay[][] {
  const today = torontoDay(now);
  const first = shiftDay(mondayOf(today), -7 * (weeks - 1));

  const markOf = (day: string): GridMark => {
    const mark = streak.marks[day];

    if (mark !== undefined) return mark;

    if (day > today) return "later";

    return dueBySchedule(habit, day) ? "missed" : "off";
  };

  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, offset) => {
      const date = shiftDay(first, week * 7 + offset);
      const mark = markOf(date);

      return { date, mark, label: GRID_LABELS[mark] };
    }),
  );
}
