import assert from "node:assert/strict";
import { torontoDate } from "./helpers/toronto";
import {
  MISSED,
  dueBySchedule,
  durationBarLabel,
  durationSummary,
  habitDayReader,
  habitDays,
  habitsDone,
  minutesLabel,
  shortMinutes,
  withoutEntry,
} from "@/core/habit-day";
import type { Counts, DurationEntry, Durations, Habit } from "@/core/habits-view";
import { makeHabit } from "./helpers/habit";

// A Wednesday; its week runs Monday 2026-11-02 to Sunday 2026-11-08.
const WEDNESDAY = torontoDate(2026, 10, 4, 15, 30);
const TODAY = "2026-11-04";
const MONDAY = torontoDate(2026, 10, 2);

const days = (habit: Habit, counts: Counts = {}, durations: Durations = {}) =>
  habitDays(habit, { counts, durations });

const entry = (minutes: number, startTime = "08:00"): DurationEntry => ({
  id: 1,
  startTime,
  minutes,
});

test("a day is due by schedule inside a Season and on a fixed weekday", () => {
  const weekdays: Habit["target"] = { type: "days", count: 2, days: [1, 3] };
  const summer = [{ start: "2026-04-01", end: "2026-10-31" }];

  assert.deepEqual(
    [
      dueBySchedule(makeHabit(), TODAY),
      dueBySchedule(makeHabit({ target: weekdays }), TODAY),
      dueBySchedule(makeHabit({ target: { ...weekdays, days: [1] } }), TODAY),
      dueBySchedule(makeHabit(), "2026-12-25"),
      dueBySchedule(makeHabit({ seasons: summer }), "2026-12-25"),
      dueBySchedule(makeHabit({ target: { type: "weekly", count: 2, days: [] } }), TODAY),
    ],
    [true, true, false, true, false, true],
  );
});

type TapRow = [
  kind: Habit["kind"],
  record: Habit["record"],
  count: number,
  next: number,
  status: string,
];

const TAPS: TapRow[] = [
  ["good", "check", 0, 1, "empty"],
  ["good", "check", 1, MISSED, "done"],
  ["good", "check", MISSED, 0, "missed"],
  ["bad", "check", 0, 1, "empty"],
  ["bad", "check", 1, 0, "done"],
  ["bad", "check", MISSED, 1, "empty"],
  ["good", "count", 0, 1, "empty"],
  ["good", "count", 2, 3, "done"],
  ["good", "count", MISSED, 1, "missed"],
  ["bad", "count", 0, 1, "empty"],
  ["bad", "count", 4, 5, "done"],
  ["bad", "count", MISSED, 1, "empty"],
];

for (const [kind, record, count, next, status] of TAPS)
  test(`a ${kind} ${record} Habit at ${count} is ${status} and a tap makes it ${next}`, () => {
    const day = days(makeHabit({ kind, record }), { [TODAY]: { up: count } }).on(WEDNESDAY);

    assert.deepEqual(
      [day.date, day.count, day.status, day.next, day.timed],
      [TODAY, count, status, next, null],
    );
  });

const canMiss = (kind: Habit["kind"], record: Habit["record"]) =>
  days(makeHabit({ kind, record, targetMinutes: 60 })).on(WEDNESDAY).canMiss;

test("only a good check or count Habit can be missed", () => {
  assert.deepEqual(
    [
      canMiss("good", "check"),
      canMiss("good", "count"),
      canMiss("good", "duration"),
      canMiss("bad", "check"),
    ],
    [true, true, false, false],
  );
});

type TimedRow = [id: string, kind: Habit["kind"], minutes: number[], status: string, timed: object];

// The bar is 60 minutes a day: a minimum for a good Habit, a ceiling for a bad one.
const TIMED_DAYS: TimedRow[] = [
  ["good_empty", "good", [], "empty", { minutes: 0, sessions: 0, over: false, progress: 0 }],
  [
    "good_short",
    "good",
    [20, 10],
    "empty",
    { minutes: 30, sessions: 2, over: false, progress: 0.5 },
  ],
  ["good_at_bar", "good", [60], "done", { minutes: 60, sessions: 1, over: false, progress: 1 }],
  [
    "good_past_bar",
    "good",
    [50, 40],
    "done",
    { minutes: 90, sessions: 2, over: false, progress: 1 },
  ],
  ["bad_empty", "bad", [], "empty", { minutes: 0, sessions: 0, over: false, progress: 0 }],
  ["bad_under", "bad", [30], "done", { minutes: 30, sessions: 1, over: false, progress: 0.5 }],
  [
    "bad_at_ceiling",
    "bad",
    [30, 30],
    "done",
    { minutes: 60, sessions: 2, over: false, progress: 1 },
  ],
  ["bad_over", "bad", [30, 30, 60], "done", { minutes: 120, sessions: 3, over: true, progress: 1 }],
];

for (const [id, kind, minutes, status, timed] of TIMED_DAYS)
  test(`a timed day: ${id}`, () => {
    const entries = minutes.map((m) => entry(m));
    const habit = makeHabit({ kind, record: "duration", targetMinutes: 60 });
    const day = days(habit, {}, { [TODAY]: { up: entries } }).on(WEDNESDAY);

    assert.deepEqual([day.count, day.status, day.timed], [0, status, { ...timed, entries }]);
  });

test("a missed timed day stays empty and a tap marks it", () => {
  const habit = makeHabit({ record: "duration", targetMinutes: 60 });
  const day = days(habit, { [TODAY]: { up: MISSED } }).on(WEDNESDAY);

  assert.deepEqual([day.count, day.status, day.next], [MISSED, "empty", 1]);
});

test("a Skip on an Opt-out timed day wins over its logged usual length, in the day, the week and habitsDone", () => {
  const habit = makeHabit({ record: "duration", targetMinutes: 60, optOutFrom: "2026-11-01" });
  const counts = { [TODAY]: { up: MISSED } };
  const durations = { [TODAY]: { up: [entry(120)] } };
  const tracked = days(habit, counts, durations);

  assert.deepEqual(
    [
      tracked.on(WEDNESDAY).status,
      tracked.week(WEDNESDAY).total,
      habitsDone([habit], { counts, durations }, TODAY, TODAY),
    ],
    ["missed", 0, []],
  );
});

type DueRow = [
  name: string,
  target: Habit["target"],
  kind: Habit["kind"],
  counts: Counts,
  date: Date,
  due: boolean,
];

const weekly = (count: number): Habit["target"] => ({ type: "weekly", count, days: [] });
const mwf: Habit["target"] = { type: "days", count: 7, days: [1, 3, 5] };
const daily: Habit["target"] = { type: "daily", count: 7, days: [] };

const DUE: DueRow[] = [
  ["a days Habit on its weekday", mwf, "good", {}, WEDNESDAY, true],
  ["a days Habit off its weekday", mwf, "good", {}, torontoDate(2026, 10, 5), false],
  ["a daily Habit any day", daily, "good", {}, torontoDate(2026, 10, 5), true],
  ["a weekly Habit with nothing recorded", weekly(1), "good", {}, WEDNESDAY, true],
  [
    "a weekly Habit after its week fills",
    weekly(1),
    "good",
    { "2026-11-03": { up: 1 } },
    WEDNESDAY,
    false,
  ],
  [
    "a weekly Habit earlier in a full week",
    weekly(1),
    "good",
    { "2026-11-03": { up: 1 } },
    MONDAY,
    false,
  ],
  [
    "a weekly Habit on its recorded day once full",
    weekly(1),
    "good",
    { "2026-11-03": { up: 1 } },
    torontoDate(2026, 10, 3),
    false,
  ],
  [
    "a weekly Habit short of its target",
    weekly(3),
    "good",
    { "2026-11-02": { up: 1 }, "2026-11-03": { up: 1 } },
    WEDNESDAY,
    true,
  ],
  [
    "a weekly Habit at its target",
    weekly(3),
    "good",
    { "2026-11-02": { up: 1 }, "2026-11-03": { up: 1 }, [TODAY]: { up: 1 } },
    WEDNESDAY,
    false,
  ],
  [
    "a bad weekly Habit past its ceiling",
    weekly(1),
    "bad",
    { "2026-11-02": { up: 1 }, "2026-11-03": { up: 1 } },
    WEDNESDAY,
    true,
  ],
  [
    "a weekly Habit after last week filled",
    weekly(1),
    "good",
    { "2026-11-01": { up: 1 } },
    WEDNESDAY,
    true,
  ],
  [
    "a weekly Habit whose only day was missed",
    weekly(1),
    "good",
    { "2026-11-03": { up: MISSED } },
    WEDNESDAY,
    true,
  ],
];

for (const [name, target, kind, counts, date, due] of DUE)
  test(`due: ${name} is ${due ? "due" : "not due"}`, () => {
    assert.equal(days(makeHabit({ target, kind }), counts).on(date).due, due);
  });

test("a timed Habit's done days fill its weekly target", () => {
  const habit = makeHabit({ record: "duration", targetMinutes: 30, target: weekly(1) });
  const durations = { "2026-11-02": { up: [entry(20), entry(15, "20:00")] } };

  assert.equal(days(habit, {}, durations).on(WEDNESDAY).due, false);
  assert.equal(days(habit, {}, { "2026-11-02": { up: [entry(10)] } }).on(WEDNESDAY).due, true);
});

test("a timed Habit's day reads its own entries, not another Habit's", () => {
  const habit = makeHabit({ id: "read", record: "duration", targetMinutes: 30 });
  const durations = { [TODAY]: { up: [entry(90)] } };

  assert.equal(days(habit, {}, durations).on(WEDNESDAY).timed?.minutes, 0);
});

test("the week sums counts from Monday to Sunday, whatever day it is read from", () => {
  const counts = {
    "2026-10-30": { up: 5 },
    "2026-11-02": { up: 2 },
    "2026-11-04": { up: 1, sit: 4 },
  };

  assert.equal(days(makeHabit(), counts).week(MONDAY).total, 3);
  assert.equal(days(makeHabit(), counts).week(torontoDate(2026, 10, 8)).total, 3);
});

test("the week counts a missed day as nothing", () => {
  const counts = { "2026-11-02": { up: 2 }, "2026-11-03": { up: MISSED } };

  assert.equal(days(makeHabit(), counts).week(MONDAY).total, 2);
});

test("the week counts each done day of a timed Habit as 1", () => {
  const habit = makeHabit({ kind: "bad", record: "duration", targetMinutes: 60 });
  const durations = { "2026-11-02": { up: [entry(5)] }, "2026-11-04": { up: [entry(90)] } };

  assert.equal(days(habit, {}, durations).week(MONDAY).total, 2);
});

type WeekRow = [name: string, over: Partial<Habit>, total: number, row: object];

const WEEKS: WeekRow[] = [
  ["a daily good Habit", {}, 2, { name: "Up", progress: "2 of 7 this week", over: false }],
  [
    "a weekly good Habit",
    { target: weekly(3) },
    2,
    { name: "Up", progress: "2 of 3 this week", over: false },
  ],
  ["a days Habit", { target: mwf }, 1, { name: "Up", progress: "1 of 3 this week", over: false }],
  [
    "a bad Habit at its ceiling",
    { kind: "bad", target: weekly(2) },
    2,
    { name: "Up", progress: "2 this week (at most 2)", over: false },
  ],
  [
    "a bad Habit over its ceiling",
    { kind: "bad", target: weekly(1) },
    2,
    { name: "Up", progress: "2 this week (at most 1)", over: true },
  ],
  [
    "a good Habit past its target",
    { target: weekly(1) },
    2,
    { name: "Up", progress: "2 of 1 this week", over: false },
  ],
  [
    "a Backlog Habit",
    { kind: "bad", active: false, target: weekly(1) },
    2,
    { name: "Up", progress: "Backlog", over: false },
  ],
];

for (const [name, over, total, row] of WEEKS)
  test(`the week of ${name}`, () => {
    const counts = Object.fromEntries(
      Array.from({ length: total }, (_, i) => [`2026-11-0${i + 2}`, { up: 1 }]),
    );

    assert.deepEqual(days(makeHabit(over), counts).week(WEDNESDAY), { total, row });
  });

const monthly = (count: number): Habit["target"] => ({ type: "monthly", count, days: [] });

const everyThree: Partial<Habit> = {
  target: { type: "interval", count: 3, days: [] },
  startDate: "2026-11-01",
};

test("an Every N days Habit is due on its start date and every N days after, never before", () => {
  const habit = makeHabit(everyThree);

  assert.deepEqual(
    ["2026-10-29", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-07"].map(
      (day) => dueBySchedule(habit, day),
    ),
    [false, true, false, false, true, true],
  );
  assert.equal(days(habit).on(WEDNESDAY).due, true);
  assert.equal(days(habit).on(torontoDate(2026, 10, 5)).due, false);
});

test("an N× a month Habit is due until its calendar month reaches N", () => {
  const habit = makeHabit({ target: monthly(2) });
  const oneDone = { "2026-11-01": { up: 1 }, "2026-10-30": { up: 1 } };
  const twoDone = { ...oneDone, "2026-11-20": { up: 1 } };

  assert.equal(days(habit, oneDone).on(WEDNESDAY).due, true);
  assert.equal(days(habit, twoDone).on(WEDNESDAY).due, false);
  assert.equal(days(habit, twoDone).on(torontoDate(2026, 11, 1)).due, true);
  assert.equal(days(makeHabit({ ...habit, kind: "bad" }), twoDone).on(WEDNESDAY).due, true);
});

const MONTH_ROWS: [name: string, over: Partial<Habit>, row: object][] = [
  [
    "an N× a month good Habit counts its month",
    { target: monthly(4) },
    { name: "Up", progress: "3 of 4 this month", over: false },
  ],
  [
    "an N× a month bad Habit over its ceiling",
    { kind: "bad", target: monthly(2) },
    { name: "Up", progress: "3 this month (at most 2)", over: true },
  ],
  [
    "an Every N days Habit done on today's due day names the next one",
    everyThree,
    { name: "Up", progress: "Next due Sat, Nov 7", over: false },
  ],
];

for (const [name, over, row] of MONTH_ROWS)
  test(`the row of ${name}`, () => {
    const counts = { "2026-10-31": { up: 1 }, "2026-11-01": { up: 1 }, "2026-11-04": { up: 1 } };
    const later = { ...counts, "2026-11-20": { up: 1 } };

    assert.deepEqual(days(makeHabit(over), later).week(WEDNESDAY), {
      total: 1,
      row,
    });
  });

const NEXT_DUE: [name: string, over: Partial<Habit>, progress: string][] = [
  ["today's due day not yet done", everyThree, "Due today"],
  ["a day between due days", { ...everyThree, startDate: "2026-11-02" }, "Next due Thu, Nov 5"],
  ["a start date still ahead", { ...everyThree, startDate: "2026-11-20" }, "Next due Fri, Nov 20"],
  [
    "a week with no due day",
    { target: { type: "interval", count: 10, days: [] }, startDate: "2026-10-31" },
    "Next due Tue, Nov 10",
  ],
];

for (const [name, over, progress] of NEXT_DUE)
  test(`an Every N days Habit's row on ${name}`, () => {
    assert.equal(days(makeHabit(over)).week(WEDNESDAY).row.progress, progress);
  });

test("a bad Every N days Habit logged in a week with no due day is over its limit", () => {
  const habit = makeHabit({
    kind: "bad",
    target: { type: "interval", count: 10, days: [] },
    startDate: "2026-10-31",
  });

  assert.equal(days(habit, { "2026-11-03": { up: 1 } }).week(WEDNESDAY).row.over, true);
});

const MINUTE_LABELS: [minutes: number, long: string, short: string][] = [
  [0, "0 min", ""],
  [45, "45 min", "45m"],
  [60, "1 h", "1h"],
  [90, "1 h 30 min", "1h30"],
  [125, "2 h 5 min", "2h05"],
];

for (const [minutes, long, short] of MINUTE_LABELS)
  test(`minutesLabel and shortMinutes: ${minutes}`, () => {
    assert.deepEqual([minutesLabel(minutes), shortMinutes(minutes)], [long, short]);
  });

test("durationSummary gives the total and the session count", () => {
  assert.deepEqual(
    [[], [entry(30)], [entry(30), entry(60), entry(30)]].map((day) =>
      durationSummary({
        minutes: day.reduce((sum, e) => sum + e.minutes, 0),
        sessions: day.length,
      }),
    ),
    ["Nothing logged", "30 min · once", "2 h · 3 times"],
  );
});

test("durationBarLabel reads as a goal for a good Habit and a ceiling for a bad one", () => {
  assert.deepEqual(
    [
      durationBarLabel({ kind: "good", targetMinutes: 30 }),
      durationBarLabel({ kind: "bad", targetMinutes: 90 }),
    ],
    ["goal 30 min", "at most 1 h 30 min"],
  );
});

test("withoutEntry removes only the named entry", () => {
  const durations = {
    "2026-11-02": {
      yt: [
        { ...entry(30), id: 1 },
        { ...entry(20, "20:00"), id: 2 },
      ],
      read: [entry(10)],
    },
    "2026-11-03": { yt: [{ ...entry(5), id: 3 }] },
  };

  assert.deepEqual(withoutEntry(durations, { date: "2026-11-02", habit: "yt", id: 1 }), {
    "2026-11-02": { yt: [{ ...entry(20, "20:00"), id: 2 }], read: [entry(10)] },
    "2026-11-03": { yt: [{ ...entry(5), id: 3 }] },
  });
});

test("withoutEntry on a date or Habit with no entries leaves an empty list", () => {
  assert.deepEqual(withoutEntry({}, { date: "2026-11-02", habit: "yt", id: 1 }), {
    "2026-11-02": { yt: [] },
  });
});

const oneOff = (counts: Counts = {}) =>
  days(
    makeHabit({
      id: "trip",
      startDate: "2026-11-03",
      target: { type: "once", count: 1, days: [] },
    }),
    counts,
  );

const ONE_OFF_DUE: [name: string, counts: Counts, date: Date, due: boolean][] = [
  ["before its date", {}, MONDAY, false],
  ["on its date", {}, torontoDate(2026, 10, 3), true],
  ["overdue after its date", {}, WEDNESDAY, true],
  ["after a done check on or after its date", { "2026-11-04": { trip: 1 } }, WEDNESDAY, false],
  ["after a missed check on its date", { "2026-11-03": { trip: MISSED } }, WEDNESDAY, false],
  ["with only a check before its date", { "2026-11-02": { trip: 1 } }, WEDNESDAY, true],
  [
    "on its date, answered only later",
    { "2026-11-04": { trip: 1 } },
    torontoDate(2026, 10, 3),
    true,
  ],
  ["with another Habit's check", { "2026-11-04": { up: 1 } }, WEDNESDAY, true],
  ["after an unsent check cleared its day", { "2026-11-04": { trip: 0 } }, WEDNESDAY, true],
];

for (const [name, counts, date, due] of ONE_OFF_DUE)
  test(`due: a One-off ${name} is ${due ? "due" : "not due"}`, () => {
    assert.equal(oneOff(counts).on(date).due, due);
  });

test("a One-off's week counts against 1", () => {
  assert.equal(oneOff().week(WEDNESDAY).row.progress, "0 of 1 this week");
});

const timed = (kind: Habit["kind"]) => makeHabit({ kind, record: "duration", targetMinutes: 30 });

const doneDays = (habit: Habit, counts: Counts = {}, durations: Durations = {}) =>
  habitsDone([habit], { counts, durations }, "2026-11-02", "2026-11-08").map(({ date }) => date);

describe("habitsDone", () => {
  test("a good duration Habit is done only on a Day its minutes reach the target", () => {
    const durations = {
      "2026-11-03": { up: [entry(20)] },
      "2026-11-04": { up: [entry(20), entry(10, "20:00")] },
    };

    assert.deepEqual(doneDays(timed("good"), {}, durations), ["2026-11-04"]);
  });

  test("a bad duration Habit is done on any Day with an entry", () => {
    assert.deepEqual(doneDays(timed("bad"), {}, { "2026-11-03": { up: [entry(5)] } }), [
      "2026-11-03",
    ]);
  });

  test("a Habit that stopped being timed keeps entries that no longer count", () => {
    assert.deepEqual(doneDays(makeHabit(), {}, { "2026-11-03": { up: [entry(60)] } }), []);
  });

  test("a check or count Habit is done when its count is above zero, not when missed", () => {
    const counts = {
      "2026-11-03": { up: 1 },
      "2026-11-04": { up: MISSED },
      "2026-11-05": { up: 3 },
    };

    assert.deepEqual(doneDays(makeHabit(), counts), ["2026-11-03", "2026-11-05"]);
    assert.deepEqual(doneDays(makeHabit({ record: "count" }), counts), [
      "2026-11-03",
      "2026-11-05",
    ]);
  });

  test("a One-off is left out", () => {
    const portage = makeHabit({ target: { type: "once", count: 1, days: [] } });

    assert.deepEqual(doneDays(portage, { "2026-11-03": { up: 1 } }), []);
  });

  test("only Days from `from` to `to` count, oldest first across Habits", () => {
    const walk = makeHabit({ id: "walk", name: "Walk" });

    const counts = {
      "2026-11-01": { up: 1 },
      "2026-11-08": { up: 1 },
      "2026-11-02": { walk: 1 },
      "2026-11-09": { walk: 1 },
    };

    assert.deepEqual(
      habitsDone([makeHabit(), walk], { counts, durations: {} }, "2026-11-02", "2026-11-08"),
      [
        { date: "2026-11-02", name: "Walk" },
        { date: "2026-11-08", name: "Up" },
      ],
    );
  });
});

describe("habitDayReader", () => {
  const habit = makeHabit({
    id: "run",
    record: "count",
    target: { type: "days", count: 2, days: [1, 3] },
    startDate: "2026-11-02",
    seasons: [{ start: "2026-11-01", end: "2026-11-30" }],
  });

  const read = habitDayReader(habit, {
    counts: { "2026-11-02": { run: 3 }, "2026-11-04": { run: MISSED } },
    durations: {},
    skips: { "2026-11-04": { run: { cause: "outside", note: "" } } },
    restPeriods: [{ start: "2026-11-09", end: "2026-11-09" }],
  });

  test("a done scheduled Day carries a count Habit's count toward a week's N", () => {
    assert.deepEqual(read("2026-11-02"), {
      scheduled: true,
      inSeason: true,
      due: true,
      needed: true,
      beforeStart: false,
      rest: false,
      skip: null,
      done: true,
      notDone: false,
      value: 3,
    });
  });

  test("a Skipped Day keeps its cause and adds nothing", () => {
    assert.deepEqual(
      [read("2026-11-04").skip, read("2026-11-04").done, read("2026-11-04").value],
      [{ cause: "outside", note: "" }, false, 0],
    );
  });

  test("a Rest day, an unscheduled Day, a Day before the start and one outside a Season", () => {
    assert.deepEqual(
      [
        read("2026-11-09").rest,
        read("2026-11-03").scheduled,
        read("2026-11-01").beforeStart,
        read("2026-12-02").inSeason,
        read("2026-12-02").scheduled,
        read("2026-12-02").due,
      ],
      [true, false, true, false, true, false],
    );
  });

  test("a Day logged Not done reads as not done", () => {
    assert.deepEqual([read("2026-11-04").notDone, read("2026-11-02").notDone], [true, false]);
  });

  test("a weekly Habit's Days stay due but are no longer needed once the week meets N", () => {
    const weekly = makeHabit({ id: "swim", target: { type: "weekly", count: 2, days: [] } });

    const readWeekly = habitDayReader(weekly, {
      counts: { "2026-11-02": { swim: 1 }, "2026-11-03": { swim: 1 } },
      durations: {},
      skips: {},
      restPeriods: [],
    });

    assert.deepEqual(
      [
        readWeekly("2026-11-04").due,
        readWeekly("2026-11-04").needed,
        readWeekly("2026-11-10").needed,
      ],
      [true, false, true],
    );
  });
});
