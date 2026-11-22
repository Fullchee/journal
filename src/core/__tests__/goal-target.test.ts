import assert from "node:assert/strict";
import {
  GoalTarget,
  targetLabel,
  targetPeriod,
  targetReadFrom,
  targetsToReview,
  targetViews,
  type TargetGoal,
} from "@/core/goal-target";
import { makeHabit } from "./helpers/habit";

const BASE = {
  measure: "minutes",
  number: 150,
  direction: "minimum",
  start: "2026-10-01",
  reviewedThrough: null,
} as const;

const weekly = (over: Record<string, string | number | null> = {}) =>
  GoalTarget.parse({ ...BASE, period: "week", ...over });

describe("targetPeriod", () => {
  test("a weekly Target counts the Monday-to-Sunday week holding the Day", () => {
    assert.deepEqual(targetPeriod(weekly(), "2026-11-12"), {
      from: "2026-11-09",
      to: "2026-11-15",
    });
  });

  test("a monthly Target counts the calendar month holding the Day", () => {
    assert.deepEqual(targetPeriod(weekly({ period: "month" }), "2026-11-12"), {
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });

  test("a deadline Target counts from the day it was set to its deadline", () => {
    assert.deepEqual(
      targetPeriod(weekly({ period: "deadline", deadline: "2026-12-31" }), "2026-11-12"),
      { from: "2026-10-01", to: "2026-12-31" },
    );
  });
});

const MOVE: TargetGoal = {
  id: 1,
  title: "Move more",
  parentId: null,
  state: "active",
  pillar: null,
};

const READ: TargetGoal = { id: 3, title: "Read", parentId: null, state: "active", pillar: null };
const GOALS = [MOVE, { id: 2, title: "Cardio", parentId: 1, state: "active", pillar: null }, READ];

const HABITS = [
  makeHabit({ id: "run", record: "duration", targetMinutes: 30, goals: [2] }),
  makeHabit({ id: "ride", record: "duration", targetMinutes: 30, goals: [1] }),
  makeHabit({ id: "stretch", record: "check", goals: [1] }),
  makeHabit({ id: "pushups", record: "count", goals: [2] }),
  makeHabit({ id: "scroll", kind: "bad", record: "duration", targetMinutes: 30, goals: [1] }),
  makeHabit({ id: "novel", record: "duration", targetMinutes: 30, goals: [3] }),
];

const SOURCES = {
  counts: {
    "2026-11-08": { stretch: 1, pushups: 4 },
    "2026-11-10": { stretch: 1, pushups: 3 },
    "2026-11-11": { stretch: -1 },
  },
  durations: {
    "2026-11-08": { run: [{ id: 1, startTime: "07:00", minutes: 40 }] },
    "2026-11-10": {
      run: [
        { id: 2, startTime: "07:00", minutes: 30 },
        { id: 3, startTime: "18:00", minutes: 15 },
      ],
      ride: [{ id: 4, startTime: "08:00", minutes: 50 }],
      scroll: [{ id: 5, startTime: "22:00", minutes: 90 }],
      novel: [{ id: 6, startTime: "21:00", minutes: 20 }],
    },
  },
  activity: [
    { date: "2026-11-10", moderateMin: 20, vigorousMin: 10 },
    { date: "2026-11-11", moderateMin: null, vigorousMin: null },
    { date: "2026-11-12", moderateMin: 15, vigorousMin: null },
  ],
  sleep: [
    { date: "2026-11-10", durationMin: 400 },
    { date: "2026-11-11", durationMin: 440 },
  ],
};

function viewOf(target: GoalTarget, { goal = MOVE, day = "2026-11-12" } = {}) {
  const [view] = targetViews(
    { goals: GOALS, targets: [{ goal, target }], habits: HABITS, sources: SOURCES },
    day,
  );

  assert.ok(view);

  return view;
}

describe("targetViews", () => {
  test("minutes sum the Duration entries of the good duration Habits serving the Goal or a Goal below it", () => {
    const view = viewOf(weekly());

    assert.deepEqual(view.habits, ["run", "ride"]);
    assert.deepEqual(view.current, { from: "2026-11-09", to: "2026-11-15", value: 95 });
    assert.deepEqual(view.previous, { from: "2026-11-02", to: "2026-11-08", value: 40 });
  });

  test("a limit sums the bad Habits instead", () => {
    const view = viewOf(weekly({ direction: "limit", number: 300 }));

    assert.deepEqual(view.habits, ["scroll"]);
    assert.equal(view.current.value, 90);
  });

  test("times count a check Habit's done days and a count Habit's logs; a missed day adds nothing", () => {
    const view = viewOf(weekly({ measure: "times" }));

    assert.deepEqual(view.habits, ["stretch", "pushups"]);
    assert.equal(view.current.value, 4);
    assert.equal(view.previous?.value, 5);
  });

  test("intensity minutes count a vigorous minute twice and skip unmeasured days", () => {
    const view = viewOf(weekly({ measure: "intensity-minutes" }));

    assert.deepEqual(view.habits, []);
    assert.equal(view.current.value, 55);
  });

  test("sleep is the average night, and no nights is no value", () => {
    const view = viewOf(weekly({ measure: "sleep", number: 420 }));

    assert.equal(view.current.value, 420);
    assert.equal(view.previous?.value, null);
  });

  test("a monthly Target compares with the month before", () => {
    const view = viewOf(weekly({ period: "month" }));

    assert.deepEqual(view.current, { from: "2026-11-01", to: "2026-11-30", value: 135 });
    assert.deepEqual(view.previous, { from: "2026-10-01", to: "2026-10-31", value: 0 });
  });

  test("a deadline Target has no period before it", () => {
    const view = viewOf(weekly({ period: "deadline", deadline: "2026-11-30" }));

    assert.equal(view.current.value, 135);
    assert.equal(view.previous, null);
  });

  test("closing is the period that ends in the week holding the Day", () => {
    assert.deepEqual(viewOf(weekly()).closing, viewOf(weekly()).current);
    assert.equal(viewOf(weekly({ period: "month" })).closing, null);
    assert.equal(
      viewOf(weekly({ period: "month" }), { day: "2026-11-30" }).closing?.to,
      "2026-11-30",
    );
    assert.equal(
      viewOf(weekly({ period: "month" }), { day: "2026-12-01" }).closing?.to,
      "2026-11-30",
    );
    assert.equal(
      viewOf(weekly({ period: "deadline", deadline: "2026-11-14" })).closing?.to,
      "2026-11-14",
    );
    assert.equal(viewOf(weekly({ period: "deadline", deadline: "2026-11-30" })).closing, null);
  });

  test("each view carries its Goal's title and state", () => {
    const view = viewOf(weekly(), { goal: READ });

    assert.equal(view.title, "Read");
    assert.equal(view.state, "active");
    assert.deepEqual(view.habits, ["novel"]);
  });
});

const TODAY = "2026-11-12";

const labelOf = (target: GoalTarget, day = TODAY) => targetLabel(viewOf(target, { day }), TODAY);

describe("targetLabel", () => {
  test("a number shows progress toward it", () => {
    assert.equal(labelOf(weekly()), "95 / 150 min this week");
    assert.equal(labelOf(weekly({ measure: "times", number: 5 })), "4 / 5 times this week");
    assert.equal(
      labelOf(weekly({ measure: "intensity-minutes" })),
      "55 / 150 intensity min this week",
    );
    assert.equal(
      labelOf(weekly({ measure: "sleep", number: 450 })),
      "7 h / 7 h 30 m a night this week",
    );
  });

  test("a limit names the limit instead of a fraction", () => {
    assert.equal(
      labelOf(weekly({ direction: "limit", number: 300 })),
      "90 min this week, limit 300",
    );
  });

  test("an open Target shows a trend against the period before", () => {
    assert.equal(labelOf(weekly({ number: null })), "95 min this week, 40 the week before");
    assert.equal(
      labelOf(weekly({ number: null, period: "month" })),
      "135 min this month, 0 the month before",
    );
    assert.equal(labelOf(weekly({ number: null, measure: "sleep" })), "7 h a night this week");
  });

  test("a period with nothing logged says so", () => {
    assert.equal(labelOf(weekly({ measure: "sleep" }), "2026-11-05"), "Nothing logged last week");
  });

  test("periods before last are named by their dates", () => {
    assert.equal(labelOf(weekly(), "2026-10-28"), "0 / 150 min week of Oct 26");
    assert.equal(labelOf(weekly({ period: "month" }), "2026-10-28"), "0 / 150 min last month");
    assert.equal(labelOf(weekly({ period: "month" }), "2026-09-28"), "0 / 150 min in Sep 2026");
  });

  test("a deadline Target counts toward its date", () => {
    assert.equal(
      labelOf(weekly({ period: "deadline", deadline: "2026-11-30", number: 300 })),
      "135 / 300 min by Nov 30",
    );
    assert.equal(
      labelOf(weekly({ period: "deadline", deadline: "2026-11-30", number: null })),
      "135 min since Oct 1",
    );
  });
});

const review = (target: GoalTarget, state = "active", day = "2026-11-15") =>
  targetsToReview(
    targetViews(
      {
        goals: GOALS,
        targets: [{ goal: { ...MOVE, state }, target }],
        habits: HABITS,
        sources: SOURCES,
      },
      day,
    ),
    "2026-11-16",
  ).map(({ goalId }) => goalId);

describe("targetsToReview", () => {
  test("lists a Target whose period ended short of its minimum", () => {
    assert.deepEqual(review(weekly()), [1]);
    assert.deepEqual(review(weekly({ number: 95 })), []);
  });

  test("lists a limit only when the period went past it", () => {
    assert.deepEqual(review(weekly({ direction: "limit", number: 80 })), [1]);
    assert.deepEqual(review(weekly({ direction: "limit", number: 90 })), []);
  });

  test("never lists an open Target, a period with nothing logged, or one not ended yet", () => {
    assert.deepEqual(review(weekly({ number: null })), []);
    assert.deepEqual(review(weekly({ measure: "sleep" }), "active", "2026-11-05"), []);
    assert.deepEqual(review(weekly(), "active", "2026-11-17"), []);
  });

  test("lists each period once: an answer or a Goal no longer active hides it", () => {
    assert.deepEqual(review(weekly({ reviewedThrough: "2026-11-15" })), []);
    assert.deepEqual(review(weekly({ reviewedThrough: "2026-11-08" })), [1]);
    assert.deepEqual(review(weekly(), "achieved"), []);
  });
});

describe("targetReadFrom", () => {
  test("reads from the earliest period any Target shows", () => {
    assert.equal(
      targetReadFrom([weekly({ period: "month" }), weekly()], "2026-11-12"),
      "2026-10-01",
    );
    assert.equal(
      targetReadFrom([weekly({ period: "deadline", deadline: "2026-12-31" })], "2026-11-12"),
      "2026-10-01",
    );
  });

  test("with no Target it reads only the Day", () => {
    assert.equal(targetReadFrom([], "2026-11-12"), "2026-11-12");
  });
});
