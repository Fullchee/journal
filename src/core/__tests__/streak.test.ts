import assert from "node:assert/strict";
import { isoAt, shiftDay } from "@/core/calendar";
import { MISSED, type StreakRecords } from "@/core/habit-day";
import type { Counts, Habit, Skip, Skips } from "@/core/habits-view";
import {
  checkInStreak,
  currentStreakLabel,
  freezeNote,
  freezesLabel,
  habitStreak,
  hasStreak,
  reachedMilestone,
  streakGrid,
  streakLabel,
  weekSlot,
} from "@/core/streak";
import type { RestPeriod } from "@/core/rest-mode";
import { makeHabit } from "./helpers/habit";

// A Monday, so a 7-character pattern is one tracker week.
const START = "2026-10-05";

const day = (offset: number) => shiftDay(START, offset);

/** Noon in Toronto on `offset` days after START. */
const noonOn = (offset: number) => new Date(isoAt(day(offset), 12 * 60));

const outside: Skip = { cause: "outside", note: "" };
const avoidance: Skip = { cause: "avoidance", note: "" };

interface DayCode {
  count?: number;
  skip?: Skip;
  rest?: boolean;
}

/** What one pattern character stores: a count, a Skip cause and whether it is a Rest day. */
const DAY_CODES = new Map<string, DayCode>([
  ["D", { count: 1 }],
  ["x", { count: MISSED }],
  ["o", { count: MISSED, skip: outside }],
  ["a", { count: MISSED, skip: avoidance }],
  ["R", { rest: true }],
  ["Q", { count: 1, rest: true }],
]);

/**
 * One character per day from START, spaces ignored: D done, x Not done, o outside Skip, a avoidance Skip,
 * R a Rest day, Q a Rest day done anyway, . nothing logged.
 */
function records(pattern: string): StreakRecords {
  const counts: Counts = {};
  const skips: Skips = {};
  const restPeriods: RestPeriod[] = [];
  const days = pattern.replaceAll(" ", "");

  for (let offset = 0; offset < days.length; offset++) {
    const date = day(offset);
    const { count, skip, rest = false } = DAY_CODES.get(days.charAt(offset)) ?? {};

    if (count !== undefined) counts[date] = { up: count };

    if (skip !== undefined) skips[date] = { up: skip };

    if (rest) restPeriods.push({ start: date, end: date });
  }

  return { counts, durations: {}, skips, restPeriods };
}

const daily = makeHabit();

/** The Streak on the pattern's last day, as today. */
const streakOf = (pattern: string, habit: Habit = daily) =>
  habitStreak(habit, records(pattern), noonOn(pattern.replaceAll(" ", "").length - 1));

describe("who has a Streak", () => {
  test.each([
    ["a daily good Habit", makeHabit(), true],
    [
      "a fixed-weekday good Habit",
      makeHabit({ target: { type: "days", count: 2, days: [1, 3] } }),
      true,
    ],
    ["an N-a-week good Habit", makeHabit({ target: { type: "weekly", count: 3, days: [] } }), true],
    [
      "an N-a-month good Habit",
      makeHabit({ target: { type: "monthly", count: 2, days: [] } }),
      true,
    ],
    [
      "an Every N days good Habit",
      makeHabit({ target: { type: "interval", count: 3, days: [] } }),
      true,
    ],
    ["a bad Habit", makeHabit({ kind: "bad" }), false],
    ["a One-off", makeHabit({ target: { type: "once", count: 1, days: [] } }), false],
    ["a Reference Habit", makeHabit({ target: { type: "none", count: 0, days: [] } }), false],
  ])("%s: %s", (_name, habit, expected) => {
    assert.equal(hasStreak(habit), expected);
  });
});

describe("daily counting", () => {
  test("no done day means no Streak and two Freezes", () => {
    const streak = streakOf("....");

    assert.deepEqual([streak.current, streak.longest, streak.freezes, streak.marks], [0, 0, 2, {}]);
  });

  test("done days in a row add up", () => {
    assert.equal(streakOf("DDD").current, 3);
  });

  test("today not done yet keeps yesterday's Streak and uses no Freeze", () => {
    const streak = streakOf("DDD.");

    assert.deepEqual([streak.current, streak.freezes, streak.marks[day(3)]], [3, 2, "open"]);
  });

  test("full history counts: a Streak from long ago is replayed", () => {
    assert.equal(streakOf("D".repeat(400)).current, 400);
  });
});

describe("fixed-weekday counting", () => {
  // Monday and Wednesday.
  const monWed = makeHabit({ target: { type: "days", count: 2, days: [1, 3] } });

  test("days not due neither grow nor break it", () => {
    // Mon, Wed done; the days between and after are not due; next Mon done.
    const streak = streakOf("D.D....D", monWed);

    assert.deepEqual([streak.current, streak.freezes], [3, 2]);
    assert.equal(streak.marks[day(1)], undefined);
  });

  test("a done day that isn't due adds nothing", () => {
    assert.equal(streakOf("DDD", monWed).current, 2);
  });

  test("a missed due day uses a Freeze", () => {
    const streak = streakOf("D......D", monWed);

    assert.deepEqual([streak.current, streak.freezes, streak.marks[day(2)]], [2, 1, "freeze"]);
  });
});

describe("N-a-week counting", () => {
  const threeAWeek = makeHabit({ target: { type: "weekly", count: 3, days: [] } });

  test("counts weeks in a row meeting N", () => {
    const streak = streakOf("DDD.... D.D.D.. DD", threeAWeek);

    assert.deepEqual([streak.unit, streak.current], ["week", 2]);
  });

  test("this week counts as soon as it meets N", () => {
    assert.equal(streakOf("DDD.... DDD", threeAWeek).current, 2);
  });

  test("a missed week uses one Freeze and marks its missed days", () => {
    const streak = streakOf("DDD.... D...... DDD", threeAWeek);

    assert.deepEqual([streak.current, streak.freezes], [2, 1]);
    assert.equal(streak.marks[day(8)], "freeze");
    assert.equal(streak.marks[day(7)], "done");
  });

  test("outside Skips and Rest days stand in for done days in a week", () => {
    const streak = streakOf("DDD.... DoR.... DDD", threeAWeek);

    assert.deepEqual([streak.current, streak.freezes], [2, 2]);
  });

  test("a counted Habit's counts add toward N", () => {
    const counted = makeHabit({ record: "count", target: { type: "weekly", count: 3, days: [] } });

    const streak = habitStreak(
      counted,
      { ...records(""), counts: { [day(0)]: { up: 3 } } },
      noonOn(7),
    );

    assert.equal(streak.current, 1);
  });

  test("seven met weeks in a row earn a Freeze", () => {
    const streak = streakOf(`${"DDD.... ".repeat(7)}D`, threeAWeek);

    assert.deepEqual([streak.current, streak.freezes], [7, 3]);
  });
});

describe("N-a-month counting", () => {
  const twoAMonth = makeHabit({ target: { type: "monthly", count: 2, days: [] } });
  // START is 5 Oct, so offset 27 is 1 Nov and offset 57 is 1 Dec.

  test("counts calendar months in a row meeting N", () => {
    const streak = streakOf(`DD${".".repeat(25)}DD`, twoAMonth);

    assert.deepEqual([streak.unit, streak.current, streak.longest], ["month", 2, 2]);
    assert.equal(streakLabel(streak), "2 months · longest 2");
  });

  test("a missed month uses one Freeze and marks its missed days", () => {
    const streak = streakOf(`DD${".".repeat(55)}DD`, twoAMonth);

    assert.deepEqual([streak.current, streak.freezes], [2, 1]);
    assert.equal(streak.marks[day(27)], "freeze");
  });
});

describe("Every N days counting", () => {
  const everyThree = makeHabit({
    startDate: START,
    target: { type: "interval", count: 3, days: [] },
  });

  test("counts its due days, every third day from the start date", () => {
    const streak = streakOf("D..D..D", everyThree);

    assert.deepEqual([streak.unit, streak.current, streak.marks[day(1)]], ["day", 3, undefined]);
  });

  test("a missed due day uses a Freeze", () => {
    const streak = streakOf("D.....D", everyThree);

    assert.deepEqual([streak.current, streak.freezes, streak.marks[day(3)]], [2, 1, "freeze"]);
  });
});

describe("Freezes", () => {
  test("seven done days in a row earn one", () => {
    assert.equal(streakOf("DDDDDD").freezes, 2);
    assert.equal(streakOf("DDDDDDD").freezes, 3);
  });

  test("hold at most 3", () => {
    assert.equal(streakOf("D".repeat(21)).freezes, 3);
  });

  test("none is earned or banked while holding 3", () => {
    // Day 7 earns the third; day 14 earns nothing, so after one is used, 6 more days leave 2.
    assert.equal(streakOf(`${"D".repeat(14)} . ${"D".repeat(6)}`).freezes, 2);
  });

  test("a covered day adds 0 and is marked", () => {
    const streak = streakOf("DDDDDDDDDD.D");

    assert.deepEqual([streak.current, streak.freezes, streak.marks[day(10)]], [11, 2, "freeze"]);
  });

  test("a covered day pauses the earning count without resetting it", () => {
    // 4 done, a Freeze day, 3 done: 7 in a row earns one (2 - 1 + 1).
    assert.equal(streakOf("DDDD.DDD").freezes, 2);
  });

  test("running out of Freezes breaks the Streak and resets the earning count", () => {
    // The gap outlasts the Repair window.
    const streak = streakOf(`DDDDD ${".".repeat(10)} DDDDDD`);

    assert.deepEqual([streak.current, streak.longest, streak.freezes], [6, 6, 0]);
  });

  test("the Freeze note counts Freezes since the last done day", () => {
    assert.equal(
      freezeNote("Run", streakOf("DDD...")),
      "Used 2 Freezes on Run. 7 done days in a row earns one; hold up to 3.",
    );
    assert.equal(freezeNote("Run", streakOf("DDD.")), null);
    assert.equal(freezeNote("Run", streakOf("DDD.D")), null);
    assert.equal(
      freezeNote("Run", { unit: "day", freezesSinceDone: 1 }),
      "Used 1 Freeze on Run. 7 done days in a row earns one; hold up to 3.",
    );
  });
});

describe("Skips by cause", () => {
  test("an outside Skip bridges for free and adds 0", () => {
    const streak = streakOf("DDoD");

    assert.deepEqual([streak.current, streak.freezes, streak.marks[day(2)]], [3, 2, "outside"]);
  });

  test("an avoidance Skip counts as missed", () => {
    const streak = streakOf("DDaD");

    assert.deepEqual([streak.current, streak.freezes, streak.marks[day(2)]], [3, 1, "freeze"]);
  });

  test("a Skip with no cause counts as missed", () => {
    assert.equal(streakOf("DDxD").freezes, 1);
  });

  test("an outside Skip pauses the earning count without resetting it", () => {
    assert.equal(streakOf("DDDDoDDD").freezes, 3);
  });
});

describe("Repair", () => {
  // 5 done days, then 3 missed: 2 Freezes, and the third breaks the Streak on day 7.
  const BROKEN = "DDDDD...";

  test("2 done due days within 7 days of the break restore old + done days since", () => {
    const streak = streakOf(`${BROKEN} DD`);

    assert.deepEqual([streak.current, streak.repair], [7, null]);
  });

  test("one done day leaves the Repair open, with its window", () => {
    const streak = streakOf(`${BROKEN} D`);

    assert.equal(streak.current, 1);
    assert.deepEqual(streak.repair, {
      brokeOn: day(7),
      closesOn: day(14),
      restores: 5,
      doneDays: 1,
    });
  });

  test("the second done day on the window's last day still counts", () => {
    // Rest days fill the gap, so nothing breaks again before day 14, 7 days after the break.
    assert.equal(streakOf(`${BROKEN} D RRRRR D`).current, 7);
    assert.equal(streakOf(`${BROKEN} D RRRRRR D`).current, 2);
  });

  test("done days after the window don't repair, and the prompt is gone", () => {
    const streak = streakOf(`${BROKEN} ....... DD`);

    assert.deepEqual([streak.current, streak.repair], [2, null]);
  });

  test("only the latest break can be repaired", () => {
    // Break (5), one done day, break again (1), then 2 done days: restores 1, not 5.
    const streak = streakOf(`${BROKEN} D. DD`);

    assert.deepEqual([streak.current, streak.longest], [3, 5]);
  });

  test("a fixed-weekday Habit repairs on its due days", () => {
    const monWed = makeHabit({ target: { type: "days", count: 2, days: [1, 3] } });
    // Mon, Wed done; 3 missed due days (Mon, Wed, Mon) break it; then Wed and Mon done.
    const streak = streakOf("D.D.... ....... ..D.... D", monWed);

    assert.equal(streak.current, 4);
  });
});

describe("Rest mode", () => {
  test("Rest days neither grow nor break the Streak, and use no Freeze", () => {
    const streak = streakOf("DDRRRD");

    assert.deepEqual([streak.current, streak.freezes, streak.marks[day(2)]], [3, 2, "rest"]);
  });

  test("a Habit done during Rest mode still adds 1", () => {
    assert.equal(streakOf("DDQD").current, 4);
  });

  test("Freeze earning pauses during Rest mode", () => {
    // 3 done, 4 done on Rest days, 3 done: only 6 count toward the 7.
    assert.equal(streakOf("DDD QQQQ DDD").freezes, 2);
    assert.equal(streakOf("DDD QQQQ DDDD").freezes, 3);
  });
});

test("the longest Streak never goes down", () => {
  // The gap outlasts the Repair window.
  const streak = streakOf(`${"D".repeat(10)} ${".".repeat(11)} DD`);

  assert.deepEqual([streak.current, streak.longest], [2, 10]);
});

test("today is the Toronto day: 23:30 in Toronto is still that day", () => {
  // 03:30 UTC on day 3 is 23:30 on day 2 in Toronto (EDT), so day 2 is today and not yet missed.
  const lateNight = new Date(`${day(3)}T03:30:00Z`);
  const streak = habitStreak(daily, records("DD."), lateNight);

  assert.deepEqual([streak.current, streak.freezes, streak.marks[day(2)]], [2, 2, "open"]);
});

const timedEntry = (minutes: number) => ({ up: [{ id: 1, startTime: "08:00", minutes }] });

test("a timed Habit is done on days that reach its minutes", () => {
  const timed = makeHabit({ record: "duration", targetMinutes: 30 });

  const durations = {
    [day(0)]: timedEntry(30),
    [day(1)]: timedEntry(45),
    [day(2)]: timedEntry(10),
  };

  const streak = habitStreak(timed, { ...records(""), durations }, noonOn(2));

  assert.equal(streak.current, 2);
});

test("a week slot with no days is still open today", () => {
  const facts = { value: 0, rest: false, outside: false };

  assert.deepEqual(
    weekSlot([], () => facts, 1, "2026-11-04"),
    {
      end: "2026-11-04",
      status: "open",
      doneDays: [],
      rest: false,
    },
  );
});

test("labels name the unit and Freezes", () => {
  assert.equal(streakLabel({ unit: "day", current: 12, longest: 30 }), "12 days · longest 30");
  assert.equal(streakLabel({ unit: "week", current: 1, longest: 1 }), "1 week · longest 1");
  assert.equal(currentStreakLabel({ unit: "day", current: 12 }), "12 days");
  assert.equal(freezesLabel({ freezes: 1 }), "1 Freeze");
  assert.equal(freezesLabel({ freezes: 3 }), "3 Freezes");
});

describe("the day grid", () => {
  test("whole Monday-to-Sunday weeks ending this week, each day marked and labelled", () => {
    // Today is Wednesday of the second week.
    const streak = streakOf("DoR..DD DQD");
    const grid = streakGrid(daily, streak, 2, noonOn(9));

    assert.deepEqual(
      grid.map((week) => week.map(({ mark }) => mark)),
      [
        ["done", "outside", "rest", "freeze", "freeze", "done", "done"],
        ["done", "done", "done", "later", "later", "later", "later"],
      ],
    );
    assert.deepEqual(grid[0]?.[1], { date: day(1), mark: "outside", label: "Skipped, outside" });
  });

  test("days before the first done day are blank, and days not due are marked so", () => {
    const monWed = makeHabit({ target: { type: "days", count: 2, days: [1, 3] } });
    const grid = streakGrid(monWed, streakOf("....... D", monWed), 2, noonOn(7));

    assert.deepEqual(
      grid[0]?.map(({ mark }) => mark),
      ["missed", "off", "missed", "off", "off", "off", "off"],
    );
    assert.deepEqual(grid[1]?.[0], { date: day(7), mark: "done", label: "Done" });
  });

  test("today before it is done reads Today", () => {
    assert.equal(streakGrid(daily, streakOf("D."), 1, noonOn(1))[0]?.[1]?.label, "Today");
  });
});

// A Check-in at 23:30 Toronto time counts on that day, not the next UTC day.
const lateOn = (offset: number) => isoAt(day(offset), 23 * 60 + 30);

describe("the Check-in Streak", () => {
  test("counts days with at least one Check-in, on the Toronto day", () => {
    const streak = checkInStreak([lateOn(0), lateOn(1), lateOn(1), lateOn(2)], [], noonOn(3));

    assert.deepEqual([streak.current, streak.marks[day(3)]], [3, "open"]);
  });

  test("uses Freezes and Rest days like a daily Habit", () => {
    const rest = [{ start: day(2), end: day(2) }];
    const streak = checkInStreak([lateOn(0), lateOn(1), lateOn(4)], rest, noonOn(4));

    assert.deepEqual(
      [streak.current, streak.freezes, streak.marks[day(2)], streak.marks[day(3)]],
      [3, 1, "rest", "freeze"],
    );
  });

  test("no Check-in yet means no Streak", () => {
    assert.equal(checkInStreak([], [], noonOn(0)).current, 0);
  });
});

describe("milestones", () => {
  test.each([
    [6, 7, 7],
    [29, 30, 30],
    [99, 100, 100],
    [364, 365, 365],
    [7, 8, null],
    [5, 31, 30],
    [7, 7, null],
    [8, 0, null],
  ])("from %i to %i reaches %p", (before, after, expected) => {
    assert.equal(reachedMilestone(before, after), expected);
  });
});
