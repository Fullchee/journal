import assert from "node:assert/strict";
import type { DayStatus } from "@/core/habit-day";
import { MISSED } from "@/core/habit-day";
import type { Habit } from "@/core/habits-view";
import { answerChecks, isAnswered } from "@/core/one-off";
import { makeHabit } from "./helpers/habit";

const TODAY = "2026-11-04";

const oneOff = (): Habit =>
  makeHabit({ target: { type: "once", count: 1, days: [] }, startDate: "2026-11-01" });

const due = (habit: Habit, date: string, status: DayStatus) => ({ habit, day: { date, status } });

const answer = (habit: Habit, date: string, status: DayStatus, count: number) =>
  answerChecks(due(habit, date, status), count, TODAY);

test("a One-off's Done lands on the Day it is tapped", () => {
  assert.deepEqual(answer(oneOff(), TODAY, "empty", 1), [{ date: TODAY, habit: "up", count: 1 }]);
});

test("a One-off's Not done lands on its due date", () => {
  assert.deepEqual(answer(oneOff(), TODAY, "empty", MISSED), [
    { date: "2026-11-01", habit: "up", count: MISSED },
  ]);
});

test("a new answer on another Day clears the old one", () => {
  assert.deepEqual(answer(oneOff(), "2026-11-02", "done", 1), [
    { date: "2026-11-02", habit: "up", count: 0 },
    { date: TODAY, habit: "up", count: 1 },
  ]);
});

test("a clear goes where the answer is", () => {
  assert.deepEqual(answer(oneOff(), "2026-11-02", "done", 0), [
    { date: "2026-11-02", habit: "up", count: 0 },
  ]);
});

test("a recurring Habit answers today, however it is answered", () => {
  assert.deepEqual(
    [answer(makeHabit(), TODAY, "empty", 1), answer(makeHabit(), TODAY, "empty", MISSED)],
    [[{ date: TODAY, habit: "up", count: 1 }], [{ date: TODAY, habit: "up", count: MISSED }]],
  );
});

test("a done or missed check on or after its date answers a One-off", () => {
  const habit = oneOff();

  assert.deepEqual(
    [
      isAnswered(habit, {}),
      isAnswered(habit, { "2026-11-01": { up: 1 } }),
      isAnswered(habit, { "2026-11-03": { up: MISSED } }),
      isAnswered(habit, { "2026-11-04": { up: 0 } }),
      isAnswered(habit, { "2026-10-31": { up: 1 } }),
      isAnswered(habit, { "2026-11-03": { other: 1 } }),
    ],
    [false, true, true, false, false, false],
  );
});
