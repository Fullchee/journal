import { isoAt, shiftDay } from "@/core/calendar";
import { MISSED } from "@/core/habit-day";
import {
  habitHistory,
  hasHistory,
  historyStrip,
  historyTotalsLabel,
  loggedLabel,
  type HabitHistory,
} from "@/core/habit-history";
import type { Counts, Habit, Skip, Skips } from "@/core/habits-view";
import type { RestPeriod, StreakRecords } from "@/core";
import { makeHabit } from "./helpers/habit";

/** One 40-minute Duration entry. */
const entry = (id: number) => ({ id, startTime: "22:00", minutes: 40 });

// A Monday, so a 7-character pattern is one week.
const START = "2026-10-05";

const day = (offset: number) => shiftDay(START, offset);

const noonOn = (offset: number) => new Date(isoAt(day(offset), 12 * 60));

const outside: Skip = { cause: "outside", note: "" };
const avoidance: Skip = { cause: "avoidance", note: "" };

interface DayCode {
  count?: number;
  skip?: Skip;
  rest?: boolean;
}

const DAY_CODES = new Map<string, DayCode>([
  ["D", { count: 1 }],
  ["3", { count: 3 }],
  ["x", { count: MISSED }],
  ["o", { count: MISSED, skip: outside }],
  ["a", { count: MISSED, skip: avoidance }],
  ["R", { rest: true }],
]);

/**
 * One character per day from START, spaces ignored: D done, 3 a count of 3, x Not done, o outside Skip,
 * a avoidance Skip, R a Rest day, . nothing logged.
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

const daily = makeHabit({ startDate: START });

/** The History on the pattern's last day, as today. */
const historyOf = (pattern: string, habit: Habit = daily) =>
  habitHistory(habit, records(pattern), noonOn(pattern.replaceAll(" ", "").length - 1));

/** Each period's mark or logged count, oldest first, so a test reads like its pattern. */
const marks = (history: HabitHistory) =>
  history.kind === "good"
    ? history.periods.map(({ mark }) => mark).toReversed()
    : history.periods.map(({ logged }) => logged).toReversed();

describe("who has a History", () => {
  test.each([
    ["a daily good Habit", makeHabit(), true],
    [
      "a fixed-weekday Habit",
      makeHabit({ target: { type: "days", count: 2, days: [1, 3] } }),
      true,
    ],
    ["an N-a-week Habit", makeHabit({ target: { type: "weekly", count: 3, days: [] } }), true],
    ["an N-a-month Habit", makeHabit({ target: { type: "monthly", count: 2, days: [] } }), true],
    [
      "an Every N days Habit",
      makeHabit({ target: { type: "interval", count: 3, days: [] } }),
      true,
    ],
    ["a bad Habit", makeHabit({ kind: "bad" }), true],
    ["a One-off", makeHabit({ target: { type: "once", count: 1, days: [] } }), false],
    ["a Reference Habit", makeHabit({ target: { type: "none", count: 0, days: [] } }), false],
  ])("%s: %s", (_, habit, expected) => {
    expect(hasHistory(habit)).toBe(expected);
  });
});

describe("a Habit with no recurring target", () => {
  test("counts by the day, like a daily Habit", () => {
    const reference = makeHabit({ startDate: START, target: { type: "none", count: 0, days: [] } });

    expect(historyOf("D", reference).unit).toBe("day");
  });
});

describe("a Habit with no start date", () => {
  test.each([
    ["a daily Habit", makeHabit({ startDate: "" })],
    [
      "an N-a-week Habit",
      makeHabit({ startDate: "", target: { type: "weekly", count: 3, days: [] } }),
    ],
    [
      "an N-a-month Habit",
      makeHabit({ startDate: "", target: { type: "monthly", count: 2, days: [] } }),
    ],
    ["a bad Habit", makeHabit({ startDate: "", kind: "bad" })],
  ])("%s has no periods yet", (_, habit) => {
    expect(historyOf("DD", habit).periods).toEqual([]);
  });
});

describe("a daily Habit", () => {
  test("counts each day from the start date as hit or missed, newest first", () => {
    const history = historyOf("DxD.D");

    expect(marks(history)).toEqual(["hit", "missed", "hit", "missed", "hit"]);
    expect(history).toMatchObject({ kind: "good", unit: "day", hits: 3, misses: 2 });
    expect(history.periods[0]).toEqual({ label: "Fri 9 Oct", start: day(4), mark: "hit" });
  });

  test("leaves out the days before the start date", () => {
    const history = historyOf("DDDD", makeHabit({ startDate: day(2) }));

    expect(marks(history)).toEqual(["hit", "hit"]);
  });

  test("has no periods before a start date in the future", () => {
    const later = makeHabit({ startDate: day(5) });

    expect(historyOf("..", later).periods).toEqual([]);
  });

  test("counts neither a Skip of either cause, a Rest day nor today while it is open", () => {
    expect(marks(historyOf("oaR."))).toEqual(["skipped", "skipped", "rest", "open"]);
    expect(historyOf("oaR.")).toMatchObject({ hits: 0, misses: 0 });
  });

  test("counts a Rest day that was done anyway as a hit", () => {
    const habit = makeHabit({ startDate: START });

    const history = habitHistory(
      habit,
      {
        counts: { [day(0)]: { up: 1 } },
        durations: {},
        skips: {},
        restPeriods: [{ start: day(0), end: day(0) }],
      },
      noonOn(1),
    );

    expect(marks(history)).toEqual(["hit", "open"]);
  });

  test("counts no day outside a Season", () => {
    const seasonal = makeHabit({ startDate: START, seasons: [{ start: day(2), end: null }] });

    expect(marks(historyOf("..D.", seasonal))).toEqual(["off-season", "off-season", "hit", "open"]);
  });
});

describe("a fixed-weekday Habit", () => {
  const monWedFri = makeHabit({
    startDate: START,
    target: { type: "days", count: 3, days: [1, 3, 5] },
  });

  test("counts only its weekdays", () => {
    const history = historyOf("D.x.DDD x.", monWedFri);

    expect(history.periods.map(({ start }) => start).toReversed()).toEqual([
      day(0),
      day(2),
      day(4),
      day(7),
    ]);
    expect(marks(history)).toEqual(["hit", "missed", "hit", "missed"]);
  });
});

describe("an N-a-week Habit", () => {
  const threeAWeek = makeHabit({
    startDate: START,
    target: { type: "weekly", count: 3, days: [] },
  });

  test("counts weeks: a hit meets N, a miss falls short", () => {
    const history = historyOf("D.D.D.. D...... D", threeAWeek);

    expect(marks(history)).toEqual(["hit", "missed", "open"]);
    expect(history).toMatchObject({ unit: "week", hits: 1, misses: 1 });
    expect(history.periods.at(-1)?.label).toBe("Week of 5 Oct");
  });

  test("adds a counted Habit's count toward N", () => {
    const counted = { ...threeAWeek, record: "count" as const };

    expect(marks(historyOf("3...... .", counted))).toEqual(["hit", "open"]);
  });

  test("counts a week this week's done days meet as a hit before it ends", () => {
    expect(marks(historyOf("DDD", threeAWeek))).toEqual(["hit"]);
  });

  test("counts neither a week its Skips cover nor one its Rest days cover", () => {
    expect(marks(historyOf("DDa.... DDR.... .", threeAWeek))).toEqual(["skipped", "rest", "open"]);
  });

  test("counts no week outside a Season", () => {
    const seasonal = { ...threeAWeek, seasons: [{ start: day(7), end: null }] };

    expect(marks(historyOf("....... D", seasonal))).toEqual(["off-season", "open"]);
  });

  test("covers the days of the first week before the start date", () => {
    const lateStart = { ...threeAWeek, startDate: day(4) };

    expect(marks(historyOf("....DD. .", lateStart))).toEqual(["skipped", "open"]);
  });
});

describe("an N-a-month Habit", () => {
  // START is 5 Oct, so offset 27 is 1 Nov.
  const twoAMonth = makeHabit({
    startDate: START,
    target: { type: "monthly", count: 2, days: [] },
  });

  test("counts calendar months from the start date's month, labelled by month", () => {
    const history = historyOf(`D.D${".".repeat(24)}D`, twoAMonth);

    expect(marks(history)).toEqual(["hit", "open"]);
    expect(history).toMatchObject({ unit: "month", hits: 1, misses: 0 });
    expect(history.periods.map(({ label, start }) => [label, start])).toEqual([
      ["November 2026", "2026-11-01"],
      ["October 2026", "2026-10-01"],
    ]);
  });

  test("a month short of N is missed once it ends", () => {
    const pattern = `DD${".".repeat(25)} D${".".repeat(29)} .`;

    expect(marks(historyOf(pattern, twoAMonth))).toEqual(["hit", "missed", "open"]);
  });

  test("a bad Habit sums its month", () => {
    const weed = { ...twoAMonth, kind: "bad" as const, record: "count" as const };

    const pattern = `3.D${".".repeat(24)}D`;

    expect(marks(historyOf(pattern, weed))).toEqual([4, 1]);
  });
});

describe("an Every N days Habit", () => {
  test("counts only its due days, every N days from the start date", () => {
    const everyThree = makeHabit({
      startDate: START,
      target: { type: "interval", count: 3, days: [] },
    });

    const history = historyOf("D..x..D", everyThree);

    expect(history.periods.map(({ start }) => start).toReversed()).toEqual([
      day(0),
      day(3),
      day(6),
    ]);
    expect(marks(history)).toEqual(["hit", "missed", "hit"]);
    expect(history.unit).toBe("day");
  });
});

describe("a bad Habit", () => {
  test("shows the logged count per day, never hit or missed", () => {
    const weed = makeHabit({ startDate: START, kind: "bad", record: "count" });
    const history = historyOf("3.D.", weed);

    expect(history).toMatchObject({ kind: "bad", unit: "day", logged: 4 });
    expect(marks(history)).toEqual([3, 0, 1, 0]);
  });

  test("counts a timed Habit's entries and sums a week", () => {
    const weed = makeHabit({
      startDate: START,
      kind: "bad",
      record: "duration",
      targetMinutes: 30,
      target: { type: "weekly", count: 2, days: [] },
    });

    const history = habitHistory(
      weed,
      {
        counts: {},
        durations: { [day(1)]: { up: [entry(1), entry(2)] }, [day(8)]: { up: [entry(3)] } },
        skips: {},
        restPeriods: [],
      },
      noonOn(8),
    );

    expect(marks(history)).toEqual([2, 1]);
  });
});

describe("labels", () => {
  test("totals read hits, misses and the hit rate", () => {
    expect(historyTotalsLabel(historyOf("DDDx."))).toBe("3 hit · 1 missed · 75%");
  });

  test("totals leave out the rate before anything counts", () => {
    expect(historyTotalsLabel(historyOf("."))).toBe("0 hit · 0 missed");
  });

  test("a bad Habit's totals read neutrally", () => {
    const weed = makeHabit({ startDate: START, kind: "bad" });

    expect(historyTotalsLabel(historyOf("D", weed))).toBe("Logged once in 1 day");
    expect(historyTotalsLabel(historyOf("D.", weed))).toBe("Logged once in 2 days");
    expect(historyTotalsLabel(historyOf("DD.", { ...weed, record: "count" }))).toBe(
      "Logged 2 times in 3 days",
    );
  });

  test.each([
    [0, "not logged"],
    [1, "logged once"],
    [3, "logged 3 times"],
  ])("%i logs read %s", (logged, label) => {
    expect(loggedLabel(logged)).toBe(label);
  });
});

test("the strip shows the last 7 periods, oldest first", () => {
  expect(historyStrip([9, 8, 7, 6, 5, 4, 3, 2, 1])).toEqual([3, 4, 5, 6, 7, 8, 9]);
});
