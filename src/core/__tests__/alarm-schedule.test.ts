import assert from "node:assert/strict";
import { firstTrigger, reschedulePlan } from "@/core/alarm-schedule";
import { notificationId } from "@/core/alarms";
import { makeConnection } from "./helpers/connection";
import { makeHabit } from "./helpers/habit";

// A Friday morning, local time (America/Toronto).
const NOW = new Date(2026, 10, 6, 8, 0);

const wake = makeHabit({
  id: "out-of-bed",
  name: "Out of bed",
  alarm: { time: "07:15", kind: "alarm" },
});

const at = (...parts: [number, number, number, number, number]) => new Date(...parts).getTime();

test.each([
  [
    "a daily alarm still ahead rings later today",
    { hour: 9, minute: 30 },
    at(2026, 10, 6, 9, 30),
    "day",
  ],
  [
    "a daily alarm whose time passed rings tomorrow",
    { hour: 7, minute: 15 },
    at(2026, 10, 7, 7, 15),
    "day",
  ],
  [
    "a weekday alarm rings on that weekday's next date, 1 being Sunday",
    { weekday: 1, hour: 7, minute: 15 },
    at(2026, 10, 8, 7, 15),
    "week",
  ],
  [
    "today's weekday alarm whose time passed rings next week",
    { weekday: 6, hour: 7, minute: 0 },
    at(2026, 10, 13, 7, 0),
    "week",
  ],
] as const)("firstTrigger: %s", (_name, on, timestamp, repeat) => {
  assert.deepEqual(firstTrigger({ on: { ...on, second: 0 }, allowWhileIdle: true }, NOW), {
    timestamp,
    repeat,
  });
});

test("firstTrigger keeps the wall-clock time across the end of daylight saving", () => {
  // Toronto falls back on Sunday 2026-11-01.
  const saturdayNight = new Date(2026, 9, 31, 22, 0);

  const daily = firstTrigger(
    { on: { hour: 7, minute: 15, second: 0 }, allowWhileIdle: true },
    saturdayNight,
  );

  assert.equal(new Date(daily.timestamp).getHours(), 7);
});

test("firstTrigger shows a schedule with no time right away", () => {
  assert.deepEqual(firstTrigger({ allowWhileIdle: true }, NOW), {
    timestamp: NOW.getTime(),
    repeat: null,
  });
});

test("firstTrigger shows a one-off reminder once, at its time", () => {
  const reminder = new Date(2026, 10, 9, 9, 0);

  assert.deepEqual(firstTrigger({ at: reminder, allowWhileIdle: true }, NOW), {
    timestamp: reminder.getTime(),
    repeat: null,
  });
});

test("reschedulePlan keeps the last schedule when the Habits never loaded", () => {
  assert.equal(reschedulePlan(undefined, [makeConnection()], NOW), null);
});

test("reschedulePlan schedules Habit alarms and Connection reminders together", () => {
  const priya = makeConnection({
    meetups: [{ label: "Dragon boat", days: [2], time: "18:30" }],
  });

  const plan = reschedulePlan([wake], [priya], NOW);

  assert.deepEqual(
    plan?.notifications.map(({ notification }) => notification.title),
    ["Out of bed", "Seeing Sam at Dragon boat"],
  );
  assert.equal(plan.notifications[0]?.notification.id, notificationId("out-of-bed"));
  assert.equal(plan.notifications[0].notification.habitId, "out-of-bed");
  assert.deepEqual(plan.notifications[1]?.trigger, {
    timestamp: at(2026, 10, 10, 18, 0),
    repeat: "week",
  });
});

test("reschedulePlan drops only Connection reminders when the Connections never loaded", () => {
  const plan = reschedulePlan([wake], undefined, NOW);

  assert.deepEqual(
    plan?.notifications.map(({ notification }) => notification.title),
    ["Out of bed"],
  );
});

test("reschedulePlan hands the widget today's ringing Habits", () => {
  assert.deepEqual(reschedulePlan([wake], [], NOW)?.widgetAlarms, [
    {
      id: "out-of-bed",
      name: "Out of bed",
      time: "07:15",
      days: [0, 1, 2, 3, 4, 5, 6],
    },
  ]);
});

test("reschedulePlan rings a One-off once, on its date", () => {
  const portage = {
    ...wake,
    startDate: "2026-11-14",
    target: { type: "once" as const, count: 1, days: [] },
  };

  assert.deepEqual(
    reschedulePlan([portage], [], NOW)?.notifications.map(({ trigger }) => trigger),
    [{ timestamp: new Date(2026, 10, 14, 7, 15).getTime(), repeat: null }],
  );
});

describe("reschedulePlan during Rest mode", () => {
  // NOW is Friday 2026-11-06; Rest mode runs through Sunday.
  const rest = [{ start: "2026-11-05", end: "2026-11-08" }];
  const priya = makeConnection({ meetups: [{ label: "Dragon boat", days: [6], time: "18:30" }] });

  test("Habit alarms first ring the morning after it ends; Connection reminders keep their times", () => {
    const triggers = reschedulePlan([wake], [priya], NOW, rest)?.notifications.map(
      ({ trigger }) => trigger,
    );

    assert.deepEqual(triggers, [
      { timestamp: at(2026, 10, 9, 7, 15), repeat: "day" },
      { timestamp: at(2026, 10, 7, 18, 0), repeat: "week" },
    ]);
  });

  test("a One-off due during Rest mode stays quiet", () => {
    const portage = {
      ...wake,
      startDate: "2026-11-07",
      target: { type: "once" as const, count: 1, days: [] },
    };

    assert.deepEqual(reschedulePlan([portage], [], NOW, rest)?.notifications, []);
  });

  test("a Rest period that ended or hasn't started changes nothing", () => {
    const past = [{ start: "2026-11-01", end: "2026-11-05" }];

    assert.deepEqual(reschedulePlan([wake], [], NOW, past), reschedulePlan([wake], [], NOW));
  });
});

const plannedFor = (seasons: typeof wake.seasons) =>
  reschedulePlan([{ ...wake, seasons }], [], NOW);

// NOW is Friday 2026-11-06.
describe("reschedulePlan with Seasons", () => {
  test("a Habit between Seasons schedules no alarm and leaves the widget", () => {
    const plan = plannedFor([{ start: "2026-05-03", end: "2026-10-18" }]);

    assert.deepEqual([plan?.notifications, plan?.widgetAlarms], [[], []]);
  });

  test("a Habit inside a Season rings as before", () => {
    assert.deepEqual(
      plannedFor([{ start: "2026-11-01", end: null }]),
      reschedulePlan([wake], [], NOW),
    );
  });

  test("a Season typed in ahead first rings on its start day", () => {
    const plan = plannedFor([{ start: "2026-11-10", end: null }]);

    assert.deepEqual(
      plan?.notifications.map(({ trigger }) => trigger),
      [{ timestamp: at(2026, 10, 10, 7, 15), repeat: "day" }],
    );
  });

  test("Rest mode running past a Season's start holds the alarm until it ends", () => {
    const plan = reschedulePlan(
      [{ ...wake, seasons: [{ start: "2026-11-07", end: null }] }],
      [],
      NOW,
      [{ start: "2026-11-05", end: "2026-11-08" }],
    );

    assert.deepEqual(
      plan?.notifications.map(({ trigger }) => trigger),
      [{ timestamp: at(2026, 10, 9, 7, 15), repeat: "day" }],
    );
  });
});
