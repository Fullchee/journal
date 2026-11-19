import assert from "node:assert/strict";
import { torontoDate } from "./helpers/toronto";
import { MISSED } from "@/core/habit-day";
import { habitTime } from "@/core/habits-view";
import { dueBox, dueToday, earliestReschedule, isInStorm, nextAction } from "@/core/today-view";
import { makeHabit } from "./helpers/habit";

// A Wednesday.
const TODAY = torontoDate(2026, 10, 4, 9);
const DAY = "2026-11-04";

const names = (rows: { habit: { name: string } }[]) => rows.map((row) => row.habit.name);

test("dueToday lists due Habits and sinks the ones settled today", () => {
  const habits = [
    makeHabit({ id: "a", name: "A" }),
    makeHabit({ id: "b", name: "B" }),
    makeHabit({ id: "c", name: "C" }),
  ];

  const rows = dueToday(habits, { [DAY]: { a: 1, b: MISSED } }, {}, TODAY);

  assert.deepEqual(names(rows), ["C", "A", "B"]);
  assert.deepEqual(
    [rows[1]?.habit, rows[1]?.day.count, rows[1]?.day.status, rows[1]?.time],
    [habits[0], 1, "done", null],
  );
  assert.equal(rows[2]?.day.status, "missed");
});

test("dueToday sorts by time of day, with untimed Habits after timed ones", () => {
  const habits = [
    makeHabit({ id: "none", name: "None" }),
    makeHabit({ id: "late", name: "Late", usualWhen: "20:00" }),
    makeHabit({ id: "early", name: "Early", alarm: { time: "06:30", kind: "alarm" } }),
    makeHabit({ id: "noon", name: "Noon", usualWhen: "12:15" }),
  ];

  assert.deepEqual(names(dueToday(habits, {}, {}, TODAY)), ["Early", "Noon", "Late", "None"]);
});

test("dueToday leaves out Backlog, auto-logged, Reference, bad and off-day Habits", () => {
  const habits = [
    makeHabit({ id: "backlog", active: false }),
    makeHabit({ id: "hevy", autoLogged: true }),
    makeHabit({ id: "bad", kind: "bad" }),
    makeHabit({ id: "ref", target: { type: "none", count: 0, days: [] } }),
    makeHabit({ id: "mon", target: { type: "days", count: 0, days: [1] } }),
    makeHabit({ id: "wed", name: "Wed", target: { type: "days", count: 0, days: [3] } }),
  ];

  assert.deepEqual(names(dueToday(habits, {}, {}, TODAY)), ["Wed"]);
});

test("dueToday keeps a weekly Habit done today after its week fills", () => {
  const weekly = makeHabit({ id: "w", name: "W", target: { type: "weekly", count: 2, days: [] } });

  const full = { "2026-11-02": { w: 1 }, [DAY]: { w: 1 } };
  const fullEarlier = { "2026-11-02": { w: 1 }, "2026-11-03": { w: 1 } };

  assert.deepEqual(names(dueToday([weekly], full, {}, TODAY)), ["W"]);
  assert.deepEqual(dueToday([weekly], fullEarlier, {}, TODAY), []);
});

test("dueToday keeps a missed day's count and leaves it undone", () => {
  const [row] = dueToday([makeHabit()], { [DAY]: { up: MISSED } }, {}, TODAY);

  assert.deepEqual([row?.day.count, row?.day.status], [MISSED, "missed"]);
});

test("dueToday reads a timed Habit as done once its minutes reach the bar", () => {
  const timed = makeHabit({ id: "t", record: "duration", targetMinutes: 30 });
  const durations = { [DAY]: { t: [{ id: 1, startTime: "08:00", minutes: 30 }] } };

  assert.equal(dueToday([timed], {}, durations, TODAY)[0]?.day.status, "done");
});

test("habitTime reads usual when, and null when it is blank", () => {
  assert.equal(habitTime({ alarm: null, usualWhen: "19:05" }), "19:05");
  assert.equal(habitTime({ alarm: null, usualWhen: "" }), null);
});

test("habitTime prefers the Alarm over usual when", () => {
  assert.equal(
    habitTime({ alarm: { time: "06:00", kind: "persistent" }, usualWhen: "09:00" }),
    "06:00",
  );
});

test("isInStorm reads only the newest Check-in", () => {
  assert.equal(isInStorm([{ zone: "Storm" }, { zone: "Sun" }]), true);
  assert.equal(isInStorm([{ zone: "Rain" }, { zone: "Storm" }]), false);
  assert.equal(isInStorm([]), false);
});

test("nextAction returns the Next action section up to the next heading", () => {
  const plan =
    "## Care team\n- GP\n\n## Next action\nCall the clinic.\n\n### Detail\nAsk for Dr B.\n\n## Meds\nNone";

  assert.equal(nextAction(plan), "Call the clinic.\n\n### Detail\nAsk for Dr B.");
});

test("nextAction accepts the plural heading and runs to the end", () => {
  assert.equal(nextAction("# Next actions\n1. Book a visit"), "1. Book a visit");
});

test("nextAction is null without the section or with an empty one", () => {
  assert.equal(nextAction("## Care team\n- GP"), null);
  assert.equal(nextAction("## Next action\n\n## Meds"), null);
});

const oneOff = (id: string, startDate: string) =>
  makeHabit({ id, name: id, startDate, target: { type: "once", count: 1, days: [] } });

test("dueToday lists overdue One-offs first, oldest first, each with its due date", () => {
  const habits = [
    makeHabit({ id: "early", name: "early", alarm: { time: "06:30", kind: "alarm" } }),
    oneOff("today", DAY),
    oneOff("monday", "2026-11-02"),
    oneOff("lastWeek", "2026-10-28"),
  ];

  const rows = dueToday(habits, {}, {}, TODAY);

  assert.deepEqual(names(rows), ["lastWeek", "monday", "early", "today"]);
  assert.deepEqual(
    rows.map(({ dueDate, overdue }) => [dueDate, overdue]),
    [
      ["2026-10-28", true],
      ["2026-11-02", true],
      [null, false],
      [DAY, false],
    ],
  );
});

test("dueToday puts an overdue One-off before a plain Habit, whichever the list names first", () => {
  const rows = dueToday([oneOff("monday", "2026-11-02"), makeHabit({ name: "Up" })], {}, {}, TODAY);

  assert.deepEqual(names(rows), ["monday", "Up"]);
});

test("dueToday reads the current date by default", () => {
  assert.deepEqual(dueToday([], {}, {}), []);
});

test("dueToday leaves out a One-off before its date or once answered", () => {
  const habits = [oneOff("later", "2026-11-05"), oneOff("answered", "2026-11-02")];

  assert.deepEqual(dueToday(habits, { "2026-11-02": { answered: MISSED } }, {}, TODAY), []);
});

test("dueToday sinks a One-off done today with the settled Habits", () => {
  const rows = dueToday(
    [oneOff("trip", "2026-11-02"), makeHabit()],
    { [DAY]: { trip: 1 } },
    {},
    TODAY,
  );

  assert.deepEqual(
    rows.map((row) => [row.habit.name, row.overdue]),
    [
      ["Up", false],
      ["trip", false],
    ],
  );
});

test("dueBox shows an overdue One-off's weekday instead of its time", () => {
  const [monday] = dueToday(
    [{ ...oneOff("monday", "2026-11-02"), alarm: { time: "07:00", kind: "alarm" } }],
    {},
    {},
    TODAY,
  );

  const [daily] = dueToday([makeHabit({ usualWhen: "07:00" })], {}, {}, TODAY);

  assert.equal(monday && dueBox(monday, TODAY), "Mon");
  assert.equal(daily && dueBox(daily, TODAY), "7:00 AM");
});

test("dueBox leaves a Habit with no time of day empty", () => {
  const [any] = dueToday([makeHabit({ usualWhen: "" })], {}, {}, TODAY);

  assert.equal(any && dueBox(any, TODAY), null);
});

test("dueBox shows the day and month once the weekday is a week or more ago", () => {
  const [old] = dueToday([oneOff("old", "2026-10-28")], {}, {}, TODAY);

  assert.equal(old && dueBox(old, TODAY), "28 Oct");
});

test("earliestReschedule lets an overdue One-off move to today", () => {
  assert.equal(earliestReschedule(oneOff("late", "2026-11-01"), TODAY), DAY);
});

test("earliestReschedule moves a One-off due today to tomorrow at the earliest", () => {
  assert.equal(earliestReschedule(oneOff("now", DAY), TODAY), "2026-11-05");
});
