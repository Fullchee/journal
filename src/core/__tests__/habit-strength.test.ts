import { isoAt, shiftDay } from "@/core/calendar";
import { MISSED } from "@/core/habit-day";
import { habitStrength, strengthLabel } from "@/core/habit-strength";
import type { Counts, Durations, Habit, Skips } from "@/core/habits-view";
import type { RestPeriod, HabitRecords } from "@/core";
import { makeHabit } from "./helpers/habit";

// A Monday, so a 7-character pattern is one week.
const START = "2026-10-05";

const day = (offset: number) => shiftDay(START, offset);

/**
 * One character per day from START, spaces ignored: D done, 3 a count of 3, x Not done, s a Skip, R a Rest day,
 * . nothing logged.
 */
const COUNT_CODES = new Map([
  ["D", 1],
  ["3", 3],
  ["x", MISSED],
]);

function records(pattern: string): HabitRecords {
  const counts: Counts = {};
  const skips: Skips = {};
  const restPeriods: RestPeriod[] = [];

  for (const [offset, code] of pattern.replaceAll(" ", "").split("").entries()) {
    const date = day(offset);
    const count = COUNT_CODES.get(code);

    if (count !== undefined) counts[date] = { up: count };
    else if (code === "s") skips[date] = { up: { cause: "outside", note: "" } };
    else if (code === "R") restPeriods.push({ start: date, end: date });
  }

  return { counts, durations: {}, skips, restPeriods };
}

const lastDay = (pattern: string) => pattern.replaceAll(" ", "").length - 1;

/** The Strength at noon on the pattern's last day. */
function strengthOf(pattern: string, habit: Habit, extra: Partial<HabitRecords> = {}) {
  const today = day(lastDay(pattern));
  const noon = new Date(isoAt(today, 12 * 60));

  return habitStrength(habit, { ...records(pattern), ...extra }, noon);
}

const daily = makeHabit({ startDate: START });

const entry = (id: number, minutes: number) => ({ id, startTime: "22:00", minutes });

// Loop's daily multiplier for a daily Habit.
const DAILY = 0.5 ** (1 / 13);

describe("habitStrength", () => {
  test("is null before any period counts", () => {
    expect(strengthOf(".", daily)).toBeNull();
    expect(
      habitStrength(makeHabit({ startDate: "2099-01-01" }), records(""), new Date()),
    ).toBeNull();
  });

  test("each hit moves it toward 1 by Loop's daily multiplier", () => {
    expect(strengthOf("DD", daily)).toBeCloseTo(1 - DAILY ** 2);
  });

  test("one miss is a dip, not a reset", () => {
    const before = strengthOf("DDDDDDDDDD.", daily);
    const after = strengthOf("DDDDDDDDDDx.", daily);

    expect(after).toBeCloseTo((before ?? 0) * DAILY);
  });

  test("a Skip, a Rest day and today while open leave it as it was", () => {
    const base = strengthOf("DDD", daily);

    expect(strengthOf("DDDs", daily)).toBeCloseTo(base ?? 0);
    expect(strengthOf("DDDR", daily)).toBeCloseTo(base ?? 0);
    expect(strengthOf("DDD.", daily)).toBeCloseTo(base ?? 0);
  });

  test("days outside a Season leave it as it was", () => {
    const seasonal = makeHabit({
      startDate: START,
      seasons: [{ start: day(0), end: day(1) }],
    });

    expect(strengthOf("DD..", seasonal)).toBeCloseTo(strengthOf("DD", daily) ?? 0);
  });

  test("a weekday Habit counts only its due days, each worth 7 ÷ its weekdays", () => {
    const monWed = makeHabit({
      startDate: START,
      target: { type: "days", count: 2, days: [1, 3] },
    });

    const multiplier = 0.5 ** ((Math.sqrt(2 / 7) * 3.5) / 13);

    expect(strengthOf("D.D....", monWed)).toBeCloseTo(1 - multiplier ** 2);
  });

  test("an N-a-week Habit moves once a week", () => {
    const twice = makeHabit({ startDate: START, target: { type: "weekly", count: 2, days: [] } });
    const multiplier = 0.5 ** ((Math.sqrt(2 / 7) * 7) / 13);

    expect(strengthOf("D.D.... ....... .", twice)).toBeCloseTo((1 - multiplier) * multiplier);
  });

  test("an N-a-month Habit moves once a month", () => {
    const monthly = makeHabit({
      startDate: START,
      target: { type: "monthly", count: 2, days: [] },
    });

    const perDay = 2 / (365.25 / 12);
    const month = 0.5 ** ((Math.sqrt(perDay) * (365.25 / 12)) / 13);

    // October 5 to November 1: October holds 2, and November is still open.
    expect(strengthOf(`D.D${".".repeat(25)}`, monthly)).toBeCloseTo(1 - month);
  });

  test("an Every N days Habit counts only its due days, each worth N days", () => {
    const everyThird = makeHabit({
      startDate: START,
      target: { type: "interval", count: 3, days: [] },
    });

    const multiplier = 0.5 ** ((Math.sqrt(1 / 3) * 3) / 13);

    expect(strengthOf("D..D", everyThird)).toBeCloseTo(1 - multiplier ** 2);
  });
});

describe("a tree's Strength", () => {
  const tree = makeHabit({ startDate: START, trees: [{ start: day(3), end: null }] });

  test("a day with nothing logged leaves it as it was", () => {
    expect(strengthOf("DDD.", tree)).toBeCloseTo(strengthOf("DDD", daily) ?? 0);
    expect(strengthOf("DDD..", tree)).toBeCloseTo(strengthOf("DDD", daily) ?? 0);
  });

  test("a logged day is a hit, and a Not done is a miss", () => {
    expect(strengthOf("DDDD.", tree)).toBeCloseTo(strengthOf("DDDD", daily) ?? 0);
    expect(strengthOf("DDDx.", tree)).toBeCloseTo(strengthOf("DDDx.", daily) ?? 0);
  });

  test("an unlogged day before the yes or after Slipped is still a miss", () => {
    const slipped = makeHabit({ ...tree, trees: [{ start: day(3), end: day(4) }] });

    expect(strengthOf("DD.D..", slipped)).toBeCloseTo(strengthOf("DD.D..", daily) ?? 0);
    expect(strengthOf("DDD...", slipped)).toBeCloseTo(strengthOf("DDDx.", daily) ?? 0);
  });

  test("a week with nothing logged leaves it as it was, but a logged Duration counts", () => {
    const twice = makeHabit({
      startDate: START,
      target: { type: "weekly", count: 2, days: [] },
      trees: [{ start: day(7), end: null }],
    });

    const durations: Durations = { [day(8)]: { up: [entry(1, 10)] } };

    expect(strengthOf("DD..... ....... .", twice)).toBeCloseTo(strengthOf("DD..... .", twice) ?? 0);
    expect(strengthOf("DD..... ....... .", twice, { durations })).toBeLessThan(
      strengthOf("DD..... .", twice) ?? 0,
    );
  });
});

describe("a bad Habit's Strength", () => {
  const weed = makeHabit({ startDate: START, kind: "bad", record: "count" });

  test("a day under the limit is a hit and a day over it a miss", () => {
    expect(strengthOf("..", weed)).toBeCloseTo(1 - DAILY);
    expect(strengthOf("3.", weed)).toBe(0);
  });

  test("today counts only once it is over the limit", () => {
    expect(strengthOf(".", weed)).toBeNull();
    expect(strengthOf("3", weed)).toBe(0);
  });

  test("a week stays under while it holds at most N", () => {
    const weekly = makeHabit({ ...weed, target: { type: "weekly", count: 3, days: [] } });
    const multiplier = 0.5 ** ((Math.sqrt(3 / 7) * 7) / 13);

    expect(strengthOf("3...... .", weekly)).toBeCloseTo(1 - multiplier);
    expect(strengthOf("3D..... .", weekly)).toBe(0);
  });

  test("a month stays under while it holds at most N", () => {
    const monthly = makeHabit({ ...weed, target: { type: "monthly", count: 3, days: [] } });

    expect(strengthOf(`33${".".repeat(26)}`, monthly)).toBe(0);
  });

  test("a Skip, a Rest day and a day outside a Season leave it as it was", () => {
    const base = strengthOf("...", weed);

    expect(strengthOf("..s.", weed)).toBeCloseTo(base ?? 0);
    expect(strengthOf("..R.", weed)).toBeCloseTo(base ?? 0);

    const seasonal = makeHabit({ ...weed, seasons: [{ start: day(0), end: day(1) }] });

    expect(strengthOf("....", seasonal)).toBeCloseTo(base ?? 0);
  });

  test("going over the limit on a paused day still counts", () => {
    const rest: RestPeriod[] = [{ start: day(0), end: day(0) }];

    expect(strengthOf("3.", weed, { restPeriods: rest })).toBe(0);
  });

  test("a week freezes only when every day of it was paused", () => {
    const weekly = makeHabit({ ...weed, target: { type: "weekly", count: 3, days: [] } });
    const multiplier = 0.5 ** ((Math.sqrt(3 / 7) * 7) / 13);

    expect(strengthOf("RRRRRRR .", weekly)).toBeNull();
    expect(strengthOf("RRRRRR. .", weekly)).toBeCloseTo(1 - multiplier);
  });

  describe("a timed one", () => {
    const timed = makeHabit({ ...weed, record: "duration", targetMinutes: 30 });

    test("stays under while each day's minutes fit, whatever the entries", () => {
      const durations: Durations = { [START]: { up: [entry(1, 10), entry(2, 15)] } };

      expect(strengthOf("..", timed, { durations })).toBeCloseTo(1 - DAILY);
    });

    test("goes over when a day passes its minutes", () => {
      const durations: Durations = { [START]: { up: [entry(1, 40)] } };

      expect(strengthOf("..", timed, { durations })).toBe(0);
    });

    test("goes over when more days have entries than the week allows", () => {
      const weekly = makeHabit({ ...timed, target: { type: "weekly", count: 1, days: [] } });

      const durations: Durations = {
        [day(0)]: { up: [entry(1, 10)] },
        [day(1)]: { up: [entry(2, 10)] },
      };

      expect(strengthOf("....... .", weekly, { durations })).toBe(0);
    });
  });
});

test("strengthLabel rounds to a whole percent", () => {
  expect(strengthLabel(0.644)).toBe("Strength 64%");
});
