import assert from "node:assert/strict";
import { daysFrom, dayOfWeek, isoAt } from "@/core/calendar";
import { habitDays } from "@/core/habit-day";
import { habitStreak, streakGrid } from "@/core/streak";
import type { Counts, Habit } from "@/core/habits-view";
import { endSeason, openSeason, startSeason } from "@/core/season";
import { notThisYear, notYet, seasonNudge } from "@/core/season-nudge";
import { dueToday } from "@/core/today-view";
import { makeHabit } from "./helpers/habit";

// Wednesday and Saturday, with the 2026 dragon boat Season.
const dragonBoat = makeHabit({
  id: "boat",
  name: "Dragon boat practice",
  target: { type: "days", count: 2, days: [3, 6] },
  seasons: [{ start: "2026-05-03", end: "2026-10-18" }],
});

const noonOn = (day: string) => new Date(isoAt(day, 12 * 60));

const isDue = (habit: typeof dragonBoat, day: string) =>
  habitDays(habit, { counts: {}, durations: {} }).on(noonOn(day)).due;

describe("due days in a Season", () => {
  test.each([
    ["a Wednesday before the Season", "2026-04-29", false],
    ["the Saturday the Season starts on", "2026-05-02", false],
    ["the first Wednesday inside", "2026-05-06", true],
    ["a Saturday inside", "2026-10-17", true],
    ["a Wednesday after the Season ends", "2026-10-21", false],
  ])("%s (%s): due %s", (_name, day, expected) => {
    assert.equal(isDue(dragonBoat, day), expected);
  });

  test("a Habit with no Season is due as before", () => {
    assert.equal(isDue({ ...dragonBoat, seasons: [] }, "2026-04-29"), true);
  });

  test("an open Season has no end", () => {
    const open = { ...dragonBoat, seasons: [{ start: "2026-05-03", end: null }] };

    assert.equal(isDue(open, "2027-01-06"), true);
  });

  test("Today leaves out a Habit outside its Season", () => {
    assert.deepEqual(dueToday([dragonBoat], {}, {}, noonOn("2026-10-21")), []);
  });
});

/** A done check on each of dragon boat's weekdays from `first` to `last`. */
function doneEvery(first: string, last: string): Counts {
  const days = daysFrom(first, last).filter((day) =>
    dragonBoat.target.days.includes(dayOfWeek(day)),
  );

  return Object.fromEntries(days.map((day) => [day, { [dragonBoat.id]: 1 }]));
}

const records = (counts: Counts) => ({ counts, durations: {}, skips: {}, restPeriods: [] });

describe("a Streak across Seasons", () => {
  const twoSeasons = {
    ...dragonBoat,
    seasons: [...dragonBoat.seasons, { start: "2027-05-02", end: null }],
  };

  const counts = {
    ...doneEvery("2026-05-03", "2026-10-18"),
    ...doneEvery("2027-05-02", "2027-05-08"),
  };

  test("the gap between Seasons neither grows nor breaks it, and leaves its Freezes alone", () => {
    const before = habitStreak(twoSeasons, records(counts), noonOn("2026-10-18"));
    const after = habitStreak(twoSeasons, records(counts), noonOn("2027-05-08"));

    // May 6 to Oct 17, 2026: 48 Wednesdays and Saturdays; May 5 and 8, 2027: 2 more.
    assert.deepEqual([before.current, after.current], [48, 50]);
    assert.equal(after.freezes, before.freezes);
  });

  test("a day outside a Season has no mark, and the grid shows it as not due", () => {
    const streak = habitStreak(twoSeasons, records(counts), noonOn("2026-11-07"));
    const grid = streakGrid(twoSeasons, streak, 1, noonOn("2026-11-07")).flat();

    assert.equal(streak.marks["2026-11-04"], undefined);
    // Monday Nov 2 to today, Saturday Nov 7.
    assert.deepEqual(
      grid.slice(0, 6).map(({ mark }) => mark),
      Array.from({ length: 6 }, () => "off"),
    );
  });

  test("an N-a-week Habit's weeks outside a Season neither grow nor break it", () => {
    const weekly = makeHabit({
      target: { type: "weekly", count: 2, days: [] },
      seasons: [
        { start: "2026-05-04", end: "2026-05-17" },
        { start: "2026-06-01", end: null },
      ],
    });

    const weeklyCounts: Counts = Object.fromEntries(
      ["2026-05-04", "2026-05-05", "2026-05-11", "2026-05-12", "2026-06-01", "2026-06-02"].map(
        (day) => [day, { up: 1 }],
      ),
    );

    const streak = habitStreak(weekly, records(weeklyCounts), noonOn("2026-06-07"));

    assert.deepEqual(
      [streak.current, streak.freezes, streak.marks["2026-05-25"]],
      [3, 2, undefined],
    );
  });
});

describe("starting and ending a Season on the Habit page", () => {
  const ended = [{ start: "2026-05-03", end: "2026-10-18" }];

  test("Start season opens one today when none is open", () => {
    assert.equal(openSeason(ended, "2027-05-01"), null);
    assert.deepEqual(startSeason(ended, "2027-05-01"), [
      ...ended,
      { start: "2027-05-01", end: null },
    ]);
  });

  test("Start season moves a Season typed in ahead to today", () => {
    const ahead = [...ended, { start: "2027-05-09", end: null }];

    assert.deepEqual(startSeason(ahead, "2027-05-01"), [
      ...ended,
      { start: "2027-05-01", end: null },
    ]);
  });

  test("End season ends the open one today", () => {
    const open = [...ended, { start: "2027-05-01", end: null }];

    assert.deepEqual(openSeason(open, "2027-10-10"), { start: "2027-05-01", end: null });
    assert.deepEqual(endSeason(open, "2027-10-10"), [
      ...ended,
      { start: "2027-05-01", end: "2027-10-10" },
    ]);
  });
});

const nudgeOn = (day: string, over: Partial<Habit> = {}) =>
  seasonNudge({ ...dragonBoat, ...over }, day);

describe("Today's nudge", () => {
  test.each([
    ["the day before the window", "2027-04-18", null],
    [
      "14 days before last year's start day",
      "2027-04-19",
      "Has Dragon boat practice season started?",
    ],
    [
      "after last year's start day, still not started",
      "2027-05-20",
      "Has Dragon boat practice season started?",
    ],
  ])("%s (%s)", (_name, day, expected) => {
    assert.equal(nudgeOn(day), expected);
  });

  test("a Season that started on Feb 29 asks from 14 days before Mar 1", () => {
    const leap = { seasons: [{ start: "2028-02-29", end: "2028-10-01" }] };

    assert.deepEqual(
      [nudgeOn("2029-02-14", leap), nudgeOn("2029-02-15", leap) !== null],
      [null, true],
    );
  });

  test("stops once a Season starts or is typed in ahead", () => {
    assert.equal(
      nudgeOn("2027-04-25", { seasons: startSeason(dragonBoat.seasons, "2027-04-25") }),
      null,
    );
    assert.equal(
      nudgeOn("2027-04-25", {
        seasons: [...dragonBoat.seasons, { start: "2027-05-09", end: null }],
      }),
      null,
    );
  });

  test("Not yet asks again a week later", () => {
    const quiet = notYet("2027-04-19");

    assert.equal(nudgeOn("2027-04-25", quiet), null);
    assert.notEqual(nudgeOn("2027-04-26", quiet), null);
  });

  test("Not this year stops it until next year's window", () => {
    const quiet = notThisYear("2027-04-19");

    assert.equal(nudgeOn("2027-12-31", quiet), null);
    // Last year's Season is now 2027's, and none started then.
    assert.equal(nudgeOn("2028-04-19", quiet), null);
  });

  test.each([
    ["a Habit with no Season", { seasons: [] }],
    ["a Habit whose Season is still open", { seasons: [{ start: "2026-05-03", end: null }] }],
    ["a Backlog Habit", { active: false }],
  ])("%s gets none", (_name, over) => {
    assert.equal(nudgeOn("2027-04-25", over), null);
  });
});
