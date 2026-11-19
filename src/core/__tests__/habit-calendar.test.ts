import { isoAt, shiftDay, torontoDay } from "@/core/calendar";
import {
  calendarReader,
  monthBounds,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
} from "@/core/habit-calendar";
import { MISSED } from "@/core/habit-day";
import type { Habit } from "@/core/habits-view";
import type { StreakRecords } from "@/core";
import { makeHabit } from "./helpers/habit";

// A Saturday at noon, so a weekday pattern is fixed.
const TODAY = torontoDay(new Date(isoAt("2026-11-14", 12 * 60)));

const ago = (days: number) => shiftDay(TODAY, -days);

const records = (over: Partial<StreakRecords> = {}): StreakRecords => ({
  counts: {},
  durations: {},
  skips: {},
  restPeriods: [],
  ...over,
});

const walk = (over: Partial<Habit> = {}) =>
  makeHabit({ id: "walk", name: "Walk", startDate: ago(30), ...over });

const entry = (minutes: number) => [{ id: 1, startTime: "08:00", minutes }];

const stateOn = (habit: Habit, recorded: StreakRecords, day: string) =>
  calendarReader(habit, recorded, TODAY)(day).state;

describe("month helpers", () => {
  it("reads a Day's month", () => {
    expect(monthOf("2026-11-14")).toBe("2026-11");
  });

  it("shifts a month across a year boundary both ways", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-11", -11)).toBe("2025-12");
  });

  it("bounds the months from the start date to today", () => {
    expect(monthBounds("2026-03-20", TODAY)).toEqual({ first: "2026-03", last: "2026-11" });
  });

  it("shows only today's month while the start date is still ahead", () => {
    expect(monthBounds("2027-02-01", TODAY)).toEqual({ first: "2026-11", last: "2026-11" });
  });

  it("shows only today's month for a Habit with no start date", () => {
    expect(monthBounds("", TODAY)).toEqual({ first: "2026-11", last: "2026-11" });
  });

  it("names the month and year", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
  });
});

describe("monthGrid", () => {
  it("needs no padding before a month that starts on a Monday", () => {
    const weeks = monthGrid("2026-06");

    expect(weeks[0]).toEqual(Array.from({ length: 7 }, (_, i) => `2026-06-0${i + 1}`));
    expect(weeks.at(-1)).toEqual(["2026-06-29", "2026-06-30", null, null, null, null, null]);
  });

  it("pads six days before a month that starts on a Sunday", () => {
    const weeks = monthGrid("2026-11");

    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(weeks[5]).toEqual(["2026-11-30", null, null, null, null, null, null]);
  });

  it("fits a 28-day February that starts on a Monday into four full weeks", () => {
    const weeks = monthGrid("2027-02");

    expect(weeks).toHaveLength(4);
    expect(weeks.flat()).not.toContain(null);
    expect(weeks[3]?.[6]).toBe("2027-02-28");
  });
});

describe("calendarReader", () => {
  it("can't log before the start date or after today", () => {
    const habit = walk({ startDate: ago(5) });

    expect(stateOn(habit, records(), ago(6))).toBe("before-start");
    expect(stateOn(habit, records(), ago(-1))).toBe("future");
  });

  it("reads done, Not done and an empty due day, with the next tap of the week row", () => {
    const recorded = records({ counts: { [ago(2)]: { walk: 1 }, [ago(1)]: { walk: MISSED } } });

    expect(calendarReader(walk(), recorded, TODAY)(ago(2))).toEqual({
      date: ago(2),
      state: "done",
      count: 1,
      next: MISSED,
      minutes: null,
      skip: null,
    });
    expect(calendarReader(walk(), recorded, TODAY)(ago(1))).toMatchObject({
      state: "missed",
      next: 0,
    });
    expect(calendarReader(walk(), recorded, TODAY)(TODAY)).toMatchObject({
      state: "empty",
      next: 1,
    });
  });

  it("reads a Not done with a cause as skipped, and one without as missed", () => {
    const recorded = records({
      counts: { [ago(3)]: { walk: MISSED }, [ago(4)]: { walk: MISSED } },
      skips: { [ago(3)]: { walk: { cause: "outside", note: "Rain" } } },
    });

    expect(calendarReader(walk(), recorded, TODAY)(ago(3))).toMatchObject({
      state: "skipped",
      skip: { cause: "outside", note: "Rain" },
    });
    expect(stateOn(walk(), recorded, ago(4))).toBe("missed");
  });

  it("reads a Rest mode day, unless it holds an answer", () => {
    const recorded = records({
      counts: { [ago(2)]: { walk: 1 } },
      restPeriods: [{ start: ago(3), end: ago(2) }],
    });

    expect(stateOn(walk(), recorded, ago(3))).toBe("rest");
    expect(stateOn(walk(), recorded, ago(2))).toBe("done");
  });

  it("reads a day outside every Season as off-season", () => {
    const habit = walk({ seasons: [{ start: ago(2), end: null }] });

    expect(stateOn(habit, records(), ago(3))).toBe("off-season");
    expect(stateOn(habit, records(), ago(2))).toBe("empty");
  });

  it("reads a day off a fixed-weekday schedule as not due", () => {
    // Saturday only: today is due, yesterday (a Friday) is not.
    const habit = walk({ target: { type: "days", count: 1, days: [6] } });

    expect(stateOn(habit, records(), TODAY)).toBe("empty");
    expect(stateOn(habit, records(), ago(1))).toBe("not-due");
  });

  it("reads a day between an Every N days Habit's due days as not due", () => {
    // Started 30 days ago, every 3 days: today and 3 days ago are due, the days between are not.
    const habit = walk({ target: { type: "interval", count: 3, days: [] } });

    expect(stateOn(habit, records(), TODAY)).toBe("empty");
    expect(stateOn(habit, records(), ago(3))).toBe("empty");
    expect(stateOn(habit, records(), ago(1))).toBe("not-due");
  });

  it("shows a count Habit's count and adds one per tap", () => {
    const habit = walk({ record: "count" });
    const recorded = records({ counts: { [ago(1)]: { walk: 3 } } });

    expect(calendarReader(habit, recorded, TODAY)(ago(1))).toMatchObject({
      state: "done",
      count: 3,
      next: 4,
    });
  });

  it("never marks a bad Habit missed", () => {
    const habit = walk({ kind: "bad" });
    const recorded = records({ counts: { [ago(1)]: { walk: MISSED } } });

    expect(stateOn(habit, recorded, ago(1))).toBe("empty");
  });

  it("gives a timed Habit its minutes, even on a day off its schedule", () => {
    const habit = walk({
      record: "duration",
      targetMinutes: 30,
      target: { type: "days", count: 1, days: [6] },
    });

    const recorded = records({
      durations: { [ago(1)]: { walk: entry(10) }, [ago(7)]: { walk: entry(45) } },
    });

    expect(calendarReader(habit, recorded, TODAY)(ago(1))).toMatchObject({
      state: "empty",
      minutes: 10,
    });
    expect(calendarReader(habit, recorded, TODAY)(ago(7))).toMatchObject({
      state: "done",
      minutes: 45,
    });
    expect(calendarReader(habit, recorded, TODAY)(ago(2))).toMatchObject({
      state: "not-due",
      minutes: 0,
    });
  });
});
