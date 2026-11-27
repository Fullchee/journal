import assert from "node:assert/strict";
import { isoAt, shiftDay } from "@/core/calendar";
import type { Habit } from "@/core/habits-view";
import {
  goalsViewEnd,
  pillarBars,
  PillarBarsBody,
  pillarChangeLabel,
  pillarReadFrom,
  type ActivityDay,
  type InteractionDay,
  type Pillar,
  type PillarGoal,
  type PillarSources,
} from "@/core/pillar-balance";
import type { HabitRecords } from "@/core";
import { makeHabit } from "./helpers/habit";

// A Sunday, so the window is one ISO week, 9 to 15 Nov, and the one before is 2 to 8 Nov.
const END = "2026-11-15";

const NOW = new Date(isoAt("2026-11-16", 12 * 60));

const day = (offset: number) => shiftDay(END, offset);

const thisWeek = [-6, -5, -4, -3, -2, -1, 0].map((offset) => day(offset));
const weekBefore = thisWeek.map((d) => shiftDay(d, -7));

const goal = (id: number, pillar: Pillar | null, parentId: number | null = null): PillarGoal => ({
  id,
  title: `Goal ${id}`,
  parentId,
  pillar,
});

const EMPTY_RECORDS: HabitRecords = { counts: {}, durations: {}, skips: {}, restPeriods: [] };

const sources = (over: Partial<PillarSources>): PillarSources => ({
  goals: [],
  habits: [],
  records: EMPTY_RECORDS,
  sleep: [],
  activity: [],
  strengthDays: [],
  interactions: [],
  now: NOW,
  ...over,
});

const barsFor = (pillar: Pillar, over: Partial<PillarSources>) =>
  pillarBars(sources({ goals: [goal(1, pillar)], ...over }), END);

const nights = (days: string[], durationMin: number) => days.map((date) => ({ date, durationMin }));

describe("sleep", () => {
  test.each([
    [8 * 60, 100, "8 h 0 m a night"],
    [9.5 * 60, 90, "9 h 30 m a night"],
    [6 * 60 + 40, 70, "6 h 40 m a night"],
    [5 * 60, 40, "5 h 0 m a night"],
    [4 * 60, 20, "4 h 0 m a night"],
    [3 * 60, 0, "3 h 0 m a night"],
    [11 * 60, 40, "11 h 0 m a night"],
  ])("a mean of %i minutes scores %i on Life's Essential 8 tiers", (minutes, score, value) => {
    const [bar] = barsFor("sleep", { sleep: nights(thisWeek, minutes) });

    assert.deepEqual(bar, {
      pillar: "sleep",
      title: "Goal 1",
      state: "scored",
      score,
      value,
      line: "Enough: 7 h a night",
      change: null,
    });
  });

  test("fewer than 4 nights in the window is not enough data, not a low score", () => {
    const [bar] = barsFor("sleep", { sleep: nights([...thisWeek.slice(0, 3), day(1)], 480) });

    assert.deepEqual(bar, {
      pillar: "sleep",
      title: "Goal 1",
      state: "thin",
      message: "Not enough data: 3 of 7 nights",
    });
  });

  test("the change compares with the 7 days before", () => {
    const [bar] = barsFor("sleep", {
      sleep: [...nights(thisWeek, 480), ...nights(weekBefore, 400)],
    });

    assert.equal(bar?.state === "scored" && bar.change, 30);
  });
});

const activeDay = (date: string, moderateMin: number | null, vigorousMin: number | null = 0) => ({
  date,
  moderateMin,
  vigorousMin,
});

const scoreOf = (activity: ActivityDay[], strengthDays: string[] = []) => {
  const [bar] = barsFor("activity", { activity, strengthDays });

  assert.ok(bar?.state === "scored");

  return [bar.score, bar.value];
};

describe("activity", () => {
  test("150 intensity minutes and 2 strength days fill the bar", () => {
    // A vigorous minute counts twice: 10 + 2 × 5 = 20 a day, 140 a week.
    const days = thisWeek.map((d) => activeDay(d, 10, 5));

    assert.deepEqual(scoreOf(days, [day(-3), day(-1), day(-1)]), [
      93,
      "140 of 150 min · 2 of 2 strength days",
    ]);
    assert.deepEqual(scoreOf(thisWeek.map((d) => activeDay(d, 30))), [
      75,
      "210 of 150 min · 0 of 2 strength days",
    ]);
  });

  test.each([
    [100, 80],
    [70, 60],
    [40, 40],
    [7, 20],
    [0, 0],
  ])("%i minutes a week score %i on the aerobic tiers", (weekly, aerobic) => {
    const days = thisWeek.map((d) => activeDay(d, weekly / 7));

    assert.equal(scoreOf(days, [day(-2)])[0], Math.round(0.75 * aerobic + 12.5));
  });

  test("an unmeasured day is left out and the rest scale to a week", () => {
    const days = [
      ...thisWeek.slice(0, 5).map((d) => activeDay(d, 30)),
      activeDay(day(-1), null, null),
    ];

    assert.deepEqual(scoreOf(days), [75, "210 of 150 min · 0 of 2 strength days"]);
  });

  test("a day with one kind of minutes measured counts it", () => {
    const days = thisWeek.map((d) => activeDay(d, null, 15));

    assert.deepEqual(scoreOf(days)[1], "210 of 150 min · 0 of 2 strength days");
    assert.deepEqual(
      scoreOf(thisWeek.map((d) => activeDay(d, 30, null)))[1],
      "210 of 150 min · 0 of 2 strength days",
    );
  });

  test("fewer than 5 measured days is not enough data", () => {
    const activity = thisWeek.slice(0, 4).map((d) => activeDay(d, 30));

    assert.deepEqual(barsFor("activity", { activity })[0], {
      pillar: "activity",
      title: "Goal 1",
      state: "thin",
      message: "Not enough data: 4 of 7 days",
    });
  });
});

const bar = (interactions: InteractionDay[]) => barsFor("connection", { interactions })[0];

const value = (interactions: InteractionDay[]) => {
  const found = bar(interactions);

  return found?.state === "scored" && found.value;
};

describe("connection", () => {
  test("one in-person day fills the bar", () => {
    assert.deepEqual(bar([{ day: day(-2), kind: "in-person" }]), {
      pillar: "connection",
      title: "Goal 1",
      state: "scored",
      score: 100,
      value: "In person on 1 day",
      line: "Soft line: about weekly, in person",
      change: null,
    });
  });

  test("counts each in-person day once", () => {
    assert.equal(
      value([
        { day: day(-2), kind: "in-person" },
        { day: day(-2), kind: "in-person" },
        { day: day(-1), kind: "in-person" },
      ]),
      "In person on 2 days",
    );
    assert.equal(value([{ day: day(-1), kind: "call" }]), "No in-person day");
  });

  test("calls alone score 0, and the week before compares", () => {
    const found = bar([
      { day: day(-1), kind: "call" },
      { day: day(-8), kind: "in-person" },
    ]);

    assert.equal(found?.state === "scored" && found.change, -100);
  });

  test("14 days with nothing logged reads as not logging", () => {
    assert.deepEqual(bar([{ day: day(-14), kind: "in-person" }]), {
      pillar: "connection",
      title: "Goal 1",
      state: "none",
      message: "Nothing logged in 14 days",
    });
  });
});

const walks = (days: string[]): HabitRecords["counts"] =>
  Object.fromEntries(days.map((d) => [d, { walk: 1 }]));

const planBar = (habits: Habit[], records: Partial<HabitRecords> = {}) =>
  pillarBars(
    sources({
      goals: [goal(1, "stress"), goal(2, null, 1)],
      habits,
      records: { ...EMPTY_RECORDS, ...records },
    }),
    END,
  )[0];

describe("plan pillars", () => {
  const daily = makeHabit({ id: "walk", startDate: "2026-10-01", goals: [2] });

  test("a good Habit linked to a Goal under the pillar scores its hit share", () => {
    const counts = walks(thisWeek.slice(0, 5));

    assert.deepEqual(planBar([daily], { counts }), {
      pillar: "stress",
      title: "Goal 1",
      state: "scored",
      score: 71,
      value: "5 of 7 on plan",
      line: "Your plan",
      change: 71,
    });
  });

  test("a weekly Habit's week that touches the window counts", () => {
    const weekly = makeHabit({
      ...daily,
      target: { type: "weekly", count: 2, days: [] },
    });

    const found = planBar([weekly], { counts: walks([day(-1), day(-8), day(-9)]) });

    assert.equal(found?.state === "scored" && found.value, "0 of 1 on plan");
  });

  test("a monthly Habit's month counts once it closes", () => {
    const monthly = makeHabit({ ...daily, target: { type: "monthly", count: 1, days: [] } });
    const found = planBar([monthly], { counts: walks(["2026-10-20"]) });

    assert.equal(found?.state, "thin");
  });

  test("a bad Habit counts days within its limit, one log a day for a daily one", () => {
    const scroll = makeHabit({ id: "scroll", kind: "bad", startDate: "2026-10-01", goals: [1] });

    const timed = makeHabit({
      id: "late",
      kind: "bad",
      record: "duration",
      targetMinutes: 30,
      startDate: "2026-10-01",
      goals: [1],
    });

    const found = planBar([scroll, timed], {
      counts: { [day(0)]: { scroll: 2 }, [day(-5)]: { scroll: 1 } },
      durations: {
        [day(-1)]: { late: [{ id: 1, startTime: "23:00", minutes: 45 }] },
        [day(-2)]: { late: [{ id: 2, startTime: "23:00", minutes: 20 }] },
      },
      skips: { [day(-3)]: { scroll: { cause: "outside", note: "" } } },
      restPeriods: [{ start: day(-4), end: day(-4) }],
    });

    // Scroll: 5 counted days, 1 logged twice. Late: 6 counted days, 1 over 30 minutes.
    assert.equal(found?.state === "scored" && found.value, "9 of 11 on plan");
  });

  test("a timed bad Habit with no minutes allows none", () => {
    const timed = makeHabit({
      id: "late",
      kind: "bad",
      record: "duration",
      targetMinutes: null,
      startDate: day(-1),
      goals: [1],
    });

    const found = planBar([timed], {
      durations: { [day(-1)]: { late: [{ id: 1, startTime: "23:00", minutes: 5 }] } },
    });

    assert.equal(found?.state === "scored" && found.value, "1 of 2 on plan");
  });

  test("a bad Habit counts only its due days and Seasons", () => {
    const weekdays = makeHabit({
      id: "work-late",
      kind: "bad",
      target: { type: "days", count: 5, days: [1, 2, 3, 4, 5] },
      seasons: [{ start: "2026-10-01", end: "2026-11-12" }],
      startDate: "2026-10-01",
      goals: [1],
    });

    const found = planBar([weekdays]);

    assert.equal(found?.state === "scored" && found.value, "4 of 4 on plan");
  });

  test("no linked active recurring Habit shows no bar", () => {
    const parked = makeHabit({ ...daily, active: false });
    const reference = makeHabit({ ...daily, target: { type: "none", count: 1, days: [] } });

    assert.deepEqual(planBar([parked, reference, makeHabit({ ...daily, goals: [3] })]), {
      pillar: "stress",
      title: "Goal 1",
      state: "none",
      message: "Link a Habit to see this",
    });
  });

  test("a linked Habit with nothing due is not enough data", () => {
    const later = makeHabit({ ...daily, startDate: day(5) });

    assert.deepEqual(planBar([later]), {
      pillar: "stress",
      title: "Goal 1",
      state: "thin",
      message: "Not enough data: nothing due these 7 days",
    });
  });
});

test("bars follow the pillar order and skip pillars without a Goal", () => {
  const bars = pillarBars(sources({ goals: [goal(1, "nutrition"), goal(2, "sleep")] }), END);

  assert.deepEqual(
    bars.map((b) => b.pillar),
    ["sleep", "nutrition"],
  );
  assert.ok(PillarBarsBody.safeParse({ bars }).success);
});

test("the change label reads up, down or same", () => {
  assert.equal(pillarChangeLabel(null), "");
  assert.equal(pillarChangeLabel(0), "Same as the 7 days before");
  assert.equal(pillarChangeLabel(10), "Up 10 from the 7 days before");
  assert.equal(pillarChangeLabel(-5), "Down 5 from the 7 days before");
});

test("the Goals view ends yesterday", () => {
  assert.equal(goalsViewEnd(NOW), END);
  const earlyMorning = new Date(isoAt("2026-11-17", 60));

  assert.equal(goalsViewEnd(earlyMorning), "2026-11-16");
});

test("reads start at the month holding the quiet days before the earlier window", () => {
  assert.equal(pillarReadFrom(END), "2026-10-01");
  assert.equal(pillarReadFrom("2026-11-30"), "2026-11-01");
});
