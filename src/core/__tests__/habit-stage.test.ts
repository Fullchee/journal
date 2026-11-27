import { daysFrom, isoAt, shiftDay } from "@/core/calendar";
import type { HabitRecords } from "@/core/habit-day";
import { answerTree, asksTreeQuestion, habitStage, TREE_WAIT_DAYS } from "@/core/habit-stage";
import { isTree, isTreeOn, treeSpans } from "@/core/habit-tree";
import type { Counts, Habit } from "@/core/habits-view";
import type { RestPeriod } from "@/core/rest-mode";
import { makeHabit } from "./helpers/habit";

const START = "2026-09-01";
const TODAY = "2026-11-22";
const NOW = new Date(isoAt(TODAY, 12 * 60));

/** Done on every day from `from` through yesterday, or only on the days `done` keeps. */
function records(
  done: (day: string) => boolean = () => true,
  restPeriods: RestPeriod[] = [],
): HabitRecords {
  const counts: Counts = {};
  const days = daysFrom(START, shiftDay(TODAY, -1));

  for (const day of days) if (done(day)) counts[day] = { up: 1 };

  return { counts, durations: {}, skips: {}, restPeriods };
}

// 82 days of every day done: Strength near 99%, past the 66-day floor.
const steady = makeHabit({ startDate: START });

const tree = makeHabit({ startDate: START, trees: [{ start: "2026-11-01", end: null }] });

const never = records(() => false);

describe("habitStage", () => {
  test.each<[string, Partial<Habit>]>([
    ["a bad Habit", { kind: "bad" }],
    ["a One-off", { target: { type: "once", count: 1, days: [] } }],
    ["a Reference Habit", { target: { type: "none", count: 7, days: [] } }],
  ])("is null for %s", (_name, over) => {
    expect(habitStage(makeHabit({ ...over, startDate: START }), records(), NOW)).toBeNull();
  });

  test("reads seed, sprout and plant from the Strength bands", () => {
    // The last N days done, after a run of misses, lands in each band.
    const lastDays = (n: number) => records((day) => day >= shiftDay(TODAY, -n));

    expect(habitStage(makeHabit({ startDate: TODAY }), never, NOW)).toBe("seed");
    expect(habitStage(steady, lastDays(5), NOW)).toBe("seed");
    expect(habitStage(steady, lastDays(15), NOW)).toBe("sprout");
    expect(habitStage(steady, lastDays(35), NOW)).toBe("plant");
  });

  test("is tree while a yes holds, whatever the Strength", () => {
    expect(habitStage(tree, never, NOW)).toBe("tree");
  });
});

const spans = (habit: Habit, restPeriods: RestPeriod[] = []) =>
  treeSpans(habit, restPeriods, TODAY);

describe("treeSpans", () => {
  test("ends a span at Slipped, the first Rest mode day after it began, or a Season start", () => {
    expect(spans(tree)).toEqual([{ start: "2026-11-01", end: null }]);
    expect(spans({ ...tree, trees: [{ start: "2026-11-01", end: "2026-11-20" }] })).toEqual([
      { start: "2026-11-01", end: "2026-11-20" },
    ]);
    expect(spans(tree, [{ start: "2026-10-30", end: "2026-11-03" }])).toEqual([
      { start: "2026-11-01", end: "2026-11-02" },
    ]);
    expect(spans(tree, [{ start: "2026-11-10", end: "2026-11-12" }])).toEqual([
      { start: "2026-11-01", end: "2026-11-10" },
    ]);
    expect(
      spans({ ...tree, trees: [{ start: "2026-11-01", end: "2026-11-20" }] }, [
        { start: "2026-11-10", end: "2026-11-10" },
      ]),
    ).toEqual([{ start: "2026-11-01", end: "2026-11-10" }]);
    expect(
      spans({ ...tree, trees: [{ start: "2026-11-01", end: "2026-11-05" }] }, [
        { start: "2026-11-10", end: "2026-11-10" },
      ]),
    ).toEqual([{ start: "2026-11-01", end: "2026-11-05" }]);
    expect(spans({ ...tree, seasons: [{ start: "2026-11-15", end: null }] })).toEqual([
      { start: "2026-11-01", end: "2026-11-15" },
    ]);
  });

  test("ignores Rest mode on the day of the yes, before it, or after today", () => {
    const quiet = [
      { start: "2026-10-01", end: "2026-11-01" },
      { start: "2026-11-23", end: "2026-11-25" },
    ];

    expect(treeSpans(tree, quiet, TODAY)).toEqual([{ start: "2026-11-01", end: null }]);
  });

  test("ignores a Season that started before the yes or starts after today", () => {
    const seasons = [
      { start: "2026-04-01", end: null },
      { start: "2026-12-01", end: null },
    ];

    expect(treeSpans({ ...tree, seasons }, [], TODAY)).toEqual([
      { start: "2026-11-01", end: null },
    ]);
  });

  test("leaves out a span that hasn't started, and every span of a Habit without a Stage", () => {
    expect(treeSpans({ ...tree, trees: [{ start: "2026-12-01", end: null }] }, [], TODAY)).toEqual(
      [],
    );
    expect(treeSpans({ ...tree, kind: "bad" }, [], TODAY)).toEqual([]);
  });

  test("isTreeOn counts the start day and stops on the end day", () => {
    const spans = [{ start: "2026-11-01", end: "2026-11-05" }];

    expect(
      ["2026-10-31", "2026-11-01", "2026-11-04", "2026-11-05"].map((d) => isTreeOn(spans, d)),
    ).toEqual([false, true, true, false]);
  });

  test("isTree reads today's Toronto day", () => {
    expect(isTree(tree, [], NOW)).toBe(true);
    expect(isTree(tree, [{ start: "2026-11-21", end: "2026-11-21" }], NOW)).toBe(false);
  });
});

describe("asksTreeQuestion", () => {
  test("asks once Strength reaches 95% and the Habit is 66 days old", () => {
    expect(asksTreeQuestion(steady, records(), NOW)).toBe(true);
  });

  test.each<[string, Partial<Habit>]>([
    ["a bad Habit", { kind: "bad" }],
    ["a Backlog Habit", { active: false }],
    ["a Habit with no start date", { startDate: "" }],
    ["a Habit under 66 days old", { startDate: shiftDay(TODAY, -65) }],
    ["a Habit after Not yet", { treeAskFrom: shiftDay(TODAY, 1) }],
    ["a tree", { trees: [{ start: "2026-11-01", end: null }] }],
    [
      "a Habit within 30 days of Slipped",
      { trees: [{ start: "2026-10-01", end: shiftDay(TODAY, -29) }] },
    ],
  ])("doesn't ask %s", (_name, over) => {
    expect(asksTreeQuestion(makeHabit({ startDate: START, ...over }), records(), NOW)).toBe(false);
  });

  test("asks again on the day Not yet's wait ends, and 30 days after a fall back", () => {
    expect(asksTreeQuestion({ ...steady, treeAskFrom: TODAY }, records(), NOW)).toBe(true);

    const fell = { ...steady, trees: [{ start: "2026-10-01", end: shiftDay(TODAY, -30) }] };

    expect(asksTreeQuestion(fell, records(), NOW)).toBe(true);
  });

  test("waits 30 days after a Rest mode day ended a tree", () => {
    const rested = records(undefined, [{ start: shiftDay(TODAY, -10), end: shiftDay(TODAY, -10) }]);
    const fell = { ...steady, trees: [{ start: "2026-10-01", end: null }] };

    expect(asksTreeQuestion(fell, rested, NOW)).toBe(false);
  });

  test("doesn't ask before any period counts", () => {
    const resting = records(() => false, [{ start: START, end: TODAY }]);

    expect(asksTreeQuestion(steady, resting, NOW)).toBe(false);
  });

  test("doesn't ask below 95%", () => {
    expect(
      asksTreeQuestion(
        steady,
        records((day) => day !== shiftDay(TODAY, -2)),
        NOW,
      ),
    ).toBe(false);
    expect(asksTreeQuestion(steady, never, NOW)).toBe(false);
  });
});

describe("answerTree", () => {
  test("yes makes it a tree from today", () => {
    expect(answerTree(steady, "yes", records(), NOW)).toEqual({
      trees: [{ start: TODAY, end: null }],
      treeAskFrom: null,
    });
  });

  test("Not yet hides the question for 30 days", () => {
    expect(answerTree(steady, "not-yet", records(), NOW)).toEqual({
      trees: [],
      treeAskFrom: shiftDay(TODAY, TREE_WAIT_DAYS),
    });
  });

  test("Slipped ends the tree today and keeps earlier spans", () => {
    const again = {
      ...tree,
      trees: [
        { start: "2026-09-10", end: "2026-09-20" },
        { start: "2026-11-01", end: null },
      ],
    };

    expect(answerTree(again, "slipped", records(), NOW)).toEqual({
      trees: [
        { start: "2026-09-10", end: "2026-09-20" },
        { start: "2026-11-01", end: TODAY },
      ],
      treeAskFrom: null,
    });
  });

  test("refuses an answer the card wouldn't offer", () => {
    expect(answerTree(steady, "slipped", records(), NOW)).toBeNull();
    expect(answerTree(tree, "yes", records(), NOW)).toBeNull();
    expect(answerTree(steady, "not-yet", never, NOW)).toBeNull();
  });
});
