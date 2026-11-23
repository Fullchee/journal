import assert from "node:assert/strict";
import { alarmActionCheck, alarmActions, notificationsFor } from "@/core/alarms";
import { MISSED } from "@/core/habit-day";
import { makeHabit } from "./helpers/habit";

const ids = (over: Parameters<typeof makeHabit>[0]) =>
  alarmActions(makeHabit(over)).map(({ id, title }) => `${id}:${title}`);

test("a good check Habit's notification offers Done and Skip", () => {
  assert.deepEqual(ids({ record: "check" }), ["done:Done", "skip:Skip"]);
});

test("a count Habit's Done adds one", () => {
  assert.deepEqual(ids({ record: "count" }), ["add-one:Done", "skip:Skip"]);
});

test("a timed Habit has no Done; only an Opt-out one can Skip", () => {
  assert.deepEqual(ids({ record: "duration", targetMinutes: 30 }), []);
  assert.deepEqual(
    ids({ record: "duration", targetMinutes: 30, optOutFrom: "2026-11-01", usualMinutes: 30 }),
    ["skip:Skip"],
  );
});

test("a bad Habit's notification has no buttons", () => {
  assert.deepEqual(ids({ kind: "bad" }), []);
});

test("a One-off has Done but no Skip", () => {
  assert.deepEqual(ids({ target: { type: "once", count: 1, days: [] } }), ["done:Done"]);
});

test("notificationsFor puts the Habit's buttons on its notification", () => {
  const [notification] = notificationsFor(
    [{ ...makeHabit({ id: "walk" }), alarm: { time: "07:15", kind: "persistent" } }],
    [],
  );

  assert.deepEqual(
    notification?.actions?.map(({ id }) => id),
    ["done", "skip"],
  );
});

const day = { date: "2026-11-14", habit: "walk" };

test("Done marks the Day done whatever it held", () => {
  assert.deepEqual(alarmActionCheck("done", { ...day, count: MISSED }), { ...day, count: 1 });
});

test("a count Habit's Done adds one, starting over from a missed Day", () => {
  assert.equal(alarmActionCheck("add-one", { ...day, count: 2 }).count, 3);
  assert.equal(alarmActionCheck("add-one", { ...day, count: MISSED }).count, 1);
});

test("Skip records an outside Skip", () => {
  assert.deepEqual(alarmActionCheck("skip", { ...day, count: 1 }), {
    ...day,
    count: MISSED,
    cause: "outside",
    note: "",
  });
});
