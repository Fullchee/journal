import assert from "node:assert/strict";
import { MISSED, habitDays } from "@/core/habit-day";
import { canOptOut, optOutLogs, withOptOutDays } from "@/core/opt-out";
import { dueToday } from "@/core/today-view";
import { makeHabit } from "./helpers/habit";
import { torontoDate } from "./helpers/toronto";

const SATURDAY = "2026-11-14";

const practice = makeHabit({
  id: "boat",
  name: "Dragon boat",
  target: { type: "days", count: 0, days: [6] },
  alarm: { time: "09:00", kind: "alarm" },
  optOutFrom: "2026-11-01",
});

const NONE = { counts: {}, durations: {} };

test("an Opt-out Habit is planned before its time and done after it, with no tap", () => {
  const [planned] = dueToday(
    [practice],
    { counts: {}, durations: {}, restPeriods: [] },
    torontoDate(2026, 10, 14, 8),
  );

  const [done] = dueToday(
    [practice],
    { counts: {}, durations: {}, restPeriods: [] },
    torontoDate(2026, 10, 14, 9, 1),
  );

  assert.deepEqual([planned?.planned, planned?.day.status], [true, "empty"]);
  assert.deepEqual([done?.planned, done?.day.status], [false, "done"]);
});

test("a Habit that isn't Opt-out is never planned", () => {
  const [row] = dueToday(
    [{ ...practice, optOutFrom: null }],
    { counts: {}, durations: {}, restPeriods: [] },
    torontoDate(2026, 10, 14, 10),
  );

  assert.deepEqual([row?.planned, row?.day.status], [false, "empty"]);
});

test("a Skip before the time leaves the day skipped", () => {
  const counts = { [SATURDAY]: { boat: MISSED } };

  const [row] = dueToday(
    [practice],
    { counts, durations: {}, restPeriods: [] },
    torontoDate(2026, 10, 14, 10),
  );

  assert.deepEqual([row?.planned, row?.day.status], [false, "missed"]);
  assert.deepEqual(
    optOutLogs(practice, { counts, durations: {} }, torontoDate(2026, 10, 14, 10)).map(
      ({ date }) => date,
    ),
    ["2026-11-07"],
  );
});

test("optOutLogs counts a timed day once its time passes, and only due days from when it became Opt-out", () => {
  const logs = optOutLogs(practice, NONE, torontoDate(2026, 10, 14, 9));

  assert.deepEqual(logs, [
    { date: "2026-11-07", habit: "boat", startTime: "09:00", minutes: null },
    { date: SATURDAY, habit: "boat", startTime: "09:00", minutes: null },
  ]);
  assert.equal(optOutLogs(practice, NONE, torontoDate(2026, 10, 14, 8, 59)).length, 1);
});

test("optOutLogs starts at the Habit's start date when that comes after Opt-out began", () => {
  const started = { ...practice, startDate: "2026-11-10" };

  assert.deepEqual(
    optOutLogs(started, NONE, torontoDate(2026, 10, 14, 9)).map(({ date }) => date),
    [SATURDAY],
  );
});

test("optOutLogs counts an untimed day only once the day has ended", () => {
  const untimed = makeHabit({ id: "walk", optOutFrom: "2026-11-13" });

  assert.deepEqual(
    optOutLogs(untimed, NONE, torontoDate(2026, 10, 14, 23, 59)).map(({ date }) => date),
    ["2026-11-13"],
  );
});

test("optOutLogs leaves an answered day alone", () => {
  const timed = { ...practice, record: "duration" as const, targetMinutes: 60, usualMinutes: 120 };
  const durations = { "2026-11-07": { boat: [{ id: 1, startTime: "09:00", minutes: 30 }] } };

  assert.deepEqual(
    optOutLogs(timed, { counts: {}, durations }, torontoDate(2026, 10, 14, 10)).map(
      ({ date }) => date,
    ),
    [SATURDAY],
  );
});

test("a 120-minute usual length logs one 120-minute Duration entry per counted day", () => {
  const timed = { ...practice, record: "duration" as const, targetMinutes: 60, usualMinutes: 120 };
  const records = withOptOutDays([timed], NONE, torontoDate(2026, 10, 14, 10));

  assert.deepEqual(
    records.durations[SATURDAY]?.["boat"]?.map(({ minutes }) => minutes),
    [120],
  );
  assert.deepEqual(records.counts, {});
  assert.equal(habitDays(timed, records).on(torontoDate(2026, 10, 14, 10)).status, "done");
});

test("withOptOutDays marks a counted check day done and keeps other Habits' records", () => {
  const other = { "2026-11-12": { up: 1 } };

  const records = withOptOutDays(
    [practice, makeHabit()],
    { counts: other, durations: {} },
    torontoDate(2026, 10, 14, 10),
  );

  assert.deepEqual(records.counts, {
    ...other,
    "2026-11-07": { boat: 1 },
    [SATURDAY]: { boat: 1 },
  });
});

test("an Opt-out Duration Habit can be skipped", () => {
  const timed = { ...practice, record: "duration" as const, targetMinutes: 60, usualMinutes: 120 };
  const records = { counts: { [SATURDAY]: { boat: MISSED } }, durations: {} };
  const day = habitDays(timed, records).on(torontoDate(2026, 10, 14, 10));

  assert.deepEqual([day.canMiss, day.status], [true, "missed"]);
});

test("only a recurring good Habit on fixed days can be Opt-out", () => {
  assert.equal(canOptOut(makeHabit()), true);
  assert.equal(canOptOut(practice), true);
  assert.equal(canOptOut(makeHabit({ kind: "bad" })), false);
  assert.equal(canOptOut(makeHabit({ target: { type: "weekly", count: 2, days: [] } })), false);
  assert.equal(canOptOut(makeHabit({ target: { type: "monthly", count: 2, days: [] } })), false);
  assert.equal(canOptOut(makeHabit({ target: { type: "interval", count: 3, days: [] } })), true);
  assert.equal(canOptOut(makeHabit({ target: { type: "once", count: 1, days: [] } })), false);
});
