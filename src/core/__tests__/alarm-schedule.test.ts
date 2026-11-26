import assert from "node:assert/strict";
import {
  firstTrigger,
  reschedulePlan,
  ringsLaterToday,
  type TodayRecords,
} from "@/core/alarm-schedule";
import { notificationId } from "@/core/alarms";
import { daysFrom, isoAt } from "@/core/calendar";
import type { StreakRecords } from "@/core/habit-day";
import type { Counts, Habit } from "@/core/habits-view";
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
    const triggers = reschedulePlan([wake], [priya], NOW, { restPeriods: rest })?.notifications.map(
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

    assert.deepEqual(reschedulePlan([portage], [], NOW, { restPeriods: rest })?.notifications, []);
  });

  test("a Rest period that ended or hasn't started changes nothing", () => {
    const past = [{ start: "2026-11-01", end: "2026-11-05" }];

    assert.deepEqual(
      reschedulePlan([wake], [], NOW, { restPeriods: past }),
      reschedulePlan([wake], [], NOW),
    );
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
      { restPeriods: [{ start: "2026-11-05", end: "2026-11-08" }] },
    );

    assert.deepEqual(
      plan?.notifications.map(({ trigger }) => trigger),
      [{ timestamp: at(2026, 10, 9, 7, 15), repeat: "day" }],
    );
  });
});

const entry = (minutes: number) => ({ id: 1, startTime: "07:00", minutes });

// NOW is Friday 2026-11-06 at 8:00; each alarm below rings at 9:30.
describe("reschedulePlan when today's Day is logged or silenced", () => {
  const later = { ...wake, alarm: { time: "09:30", kind: "alarm" as const } };
  const TODAY = "2026-11-06";
  const nothing: TodayRecords = { silenced: [] };

  const triggersOf = (habit: typeof wake, today: Partial<TodayRecords>) =>
    reschedulePlan([habit], [], NOW, { today: { ...nothing, ...today } })?.notifications.map(
      ({ trigger }) => trigger,
    );

  const todayRing = { timestamp: at(2026, 10, 6, 9, 30), repeat: "day" };
  const tomorrowRing = { timestamp: at(2026, 10, 7, 9, 30), repeat: "day" };

  test("an unlogged Day rings today", () => {
    assert.deepEqual(triggersOf(later, {}), [todayRing]);
  });

  test("a Done Day first rings tomorrow", () => {
    assert.deepEqual(triggersOf(later, { counts: { [TODAY]: { "out-of-bed": 1 } } }), [
      tomorrowRing,
    ]);
  });

  test("a Not done Day first rings tomorrow", () => {
    assert.deepEqual(triggersOf(later, { counts: { [TODAY]: { "out-of-bed": -1 } } }), [
      tomorrowRing,
    ]);
  });

  test("a Skip with a cause first rings tomorrow", () => {
    const skips = { [TODAY]: { "out-of-bed": { cause: "outside" as const, note: "" } } };

    assert.deepEqual(triggersOf(later, { skips }), [tomorrowRing]);
  });

  test("a Day logged on another date still rings today", () => {
    assert.deepEqual(triggersOf(later, { counts: { "2026-11-05": { "out-of-bed": 1 } } }), [
      todayRing,
    ]);
  });

  test("a silenced Habit first rings tomorrow; the others ring today", () => {
    const other = { ...later, id: "stretch", name: "Stretch" };

    const plan = reschedulePlan([later, other], [], NOW, {
      today: { ...nothing, silenced: ["out-of-bed"] },
    });

    assert.deepEqual(
      plan?.notifications.map(({ trigger }) => trigger),
      [tomorrowRing, todayRing],
    );
  });

  test("a fixed-weekday Habit logged today first rings on its next weekday", () => {
    // Friday is 5; the plugin's weekday 6.
    const fridays = { ...later, target: { type: "days" as const, count: 1, days: [5] } };

    assert.deepEqual(triggersOf(fridays, { silenced: ["out-of-bed"] }), [
      { timestamp: at(2026, 10, 13, 9, 30), repeat: "week" },
    ]);
  });

  test("an Every N days Habit due today skips today's ring and keeps its next due day", () => {
    const everyThree = {
      ...later,
      startDate: TODAY,
      target: { type: "interval" as const, count: 3, days: [] },
    };

    const [first] = triggersOf(everyThree, { counts: { [TODAY]: { "out-of-bed": 1 } } }) ?? [];

    assert.deepEqual(first, { timestamp: at(2026, 10, 9, 9, 30), repeat: null });
  });

  test("a One-off due today and silenced doesn't ring", () => {
    const portage = {
      ...later,
      startDate: TODAY,
      target: { type: "once" as const, count: 1, days: [] },
    };

    assert.deepEqual(triggersOf(portage, { silenced: ["out-of-bed"] }), []);
  });

  describe("a count Habit", () => {
    const water = { ...later, record: "count" as const };
    const weekly = { ...water, target: { type: "weekly" as const, count: 5, days: [] } };

    test("with a daily target counts as logged after one", () => {
      assert.deepEqual(triggersOf(water, { counts: { [TODAY]: { "out-of-bed": 1 } } }), [
        tomorrowRing,
      ]);
    });

    test("with a weekly target rings while the week is below it", () => {
      assert.deepEqual(triggersOf(weekly, { counts: { [TODAY]: { "out-of-bed": 2 } } }), [
        todayRing,
      ]);
    });

    test("with a weekly target first rings tomorrow once the week meets it", () => {
      const counts = { "2026-11-05": { "out-of-bed": 3 }, [TODAY]: { "out-of-bed": 2 } };

      assert.deepEqual(triggersOf(weekly, { counts }), [tomorrowRing]);
    });

    test("that is bad counts as logged after one", () => {
      const bad = { ...weekly, kind: "bad" as const };

      assert.deepEqual(triggersOf(bad, { counts: { [TODAY]: { "out-of-bed": 1 } } }), [
        tomorrowRing,
      ]);
    });
  });

  test("a timed Habit rings until today's minutes reach its bar", () => {
    const read = { ...later, record: "duration" as const, targetMinutes: 30 };

    assert.deepEqual(
      [
        triggersOf(read, { durations: { [TODAY]: { "out-of-bed": [entry(10)] } } }),
        triggersOf(read, { durations: { [TODAY]: { "out-of-bed": [entry(30)] } } }),
      ],
      [[todayRing], [tomorrowRing]],
    );
  });
});

describe("reschedulePlan for a plant", () => {
  // Sunday 2026-11-22 at noon; the plant's alarm at 18:00 is still ahead today.
  const sunday = new Date(isoAt("2026-11-22", 12 * 60));
  const start = "2026-09-01";

  const plant = makeHabit({
    id: "up",
    name: "Up",
    startDate: start,
    alarm: { time: "18:00", kind: "alarm" },
  });

  /** Done every day from the start through Saturday, then `over` replaces or clears single days. */
  function history(
    over: Record<string, number | null> = {},
    extra: Partial<StreakRecords> = {},
  ): StreakRecords {
    const counts: Counts = {};

    for (const day of daysFrom(start, "2026-11-21")) counts[day] = { up: 1 };

    for (const [day, count] of Object.entries(over))
      counts[day] = count === null ? {} : { up: count };

    return { counts, durations: {}, skips: {}, restPeriods: [], ...extra };
  }

  const firstRings = (habit: Habit, records: StreakRecords, today?: TodayRecords) =>
    reschedulePlan([habit], [], sunday, { records, ...(today && { today }) })?.notifications.map(
      ({ trigger }) => trigger,
    );

  const daily = (day: string) => ({
    timestamp: new Date(`${day}T18:00`).getTime(),
    repeat: "day",
  });

  test("a plant that did its last due day skips its next ring, and rings the day after", () => {
    assert.deepEqual(firstRings(plant, history()), [daily("2026-11-23")]);
  });

  test("a plant logged done today skips tomorrow's ring", () => {
    const records = history({ "2026-11-22": 1 });

    assert.deepEqual(firstRings(plant, records, { counts: records.counts, silenced: [] }), [
      daily("2026-11-24"),
    ]);
  });

  test.each([
    ["logged Not done", -1],
    ["not logged", null],
  ])("a plant whose last due day was %s rings on its next due day", (_name, count) => {
    assert.deepEqual(firstRings(plant, history({ "2026-11-21": count })), [daily("2026-11-22")]);
  });

  test("a Skip or a Rest mode day isn't a miss: the plant looks back to the last due day that counts", () => {
    const records = history(
      { "2026-11-21": -1, "2026-11-20": null },
      {
        skips: { "2026-11-21": { up: { cause: "outside", note: "" } } },
        restPeriods: [{ start: "2026-11-20", end: "2026-11-20" }],
      },
    );

    assert.deepEqual(firstRings(plant, records), [daily("2026-11-23")]);
  });

  test("a plant on fixed weekdays looks past its days off and holds back only its next weekday", () => {
    // Monday, Wednesday and Friday; plugin weekdays are 2, 4 and 6.
    const weekdays = { ...plant, target: { type: "days" as const, count: 3, days: [1, 3, 5] } };

    assert.deepEqual(
      firstRings(weekdays, history())?.map(({ timestamp }) => new Date(timestamp).getDate()),
      [30, 25, 27],
    );
  });

  test("a plant on the first day of its Season has no previous due day, so it rings", () => {
    const seasonal = {
      ...plant,
      seasons: [
        { start, end: "2026-11-10" },
        { start: "2026-11-22", end: null },
      ],
    };

    assert.deepEqual(firstRings(seasonal, history()), [daily("2026-11-22")]);
  });

  test("a seed rings as before, and a Habit without an alarm plans nothing", () => {
    const never: StreakRecords = { counts: {}, durations: {}, skips: {}, restPeriods: [] };

    assert.deepEqual(firstRings(plant, never), [daily("2026-11-22")]);
    assert.deepEqual(firstRings({ ...plant, alarm: null }, history()), []);
  });

  test("a plant whose next ring is held back has no ring left today to silence", () => {
    const logged = { counts: {} };

    assert.equal(
      ringsLaterToday(plant, sunday, { restPeriods: [], logged, records: history() }),
      false,
    );
    assert.equal(
      ringsLaterToday(plant, sunday, {
        restPeriods: [],
        logged,
        records: history({ "2026-11-21": null }),
      }),
      true,
    );
  });
});

describe("ringsLaterToday", () => {
  const tree: Habit = { ...wake, trees: [{ start: "2026-11-01", end: null }] };
  const nothing = { counts: {} };

  const ask = (
    habit: Habit,
    now: Date,
    more: Partial<Parameters<typeof ringsLaterToday>[2]> = {},
  ) => ringsLaterToday(habit, now, { restPeriods: [], logged: nothing, records: null, ...more });

  test.each([
    ["before its time today", wake, new Date(2026, 10, 6, 7, 0), true],
    ["at or after its time today", wake, new Date(2026, 10, 6, 7, 15), false],
    ["with no alarm", makeHabit(), new Date(2026, 10, 6, 6, 0), false],
    ["that is a tree", tree, new Date(2026, 10, 6, 6, 0), false],
  ] as const)("a Habit %s", (_name, habit, now, expected) => {
    assert.equal(ask(habit, now), expected);
  });

  test("a Day logged today keeps the ring quiet", () => {
    const early = new Date(2026, 10, 6, 6, 0);

    assert.equal(
      ask(wake, early, { logged: { counts: { "2026-11-06": { "out-of-bed": 1 } } } }),
      false,
    );
  });

  test("Rest mode keeps today's ring quiet", () => {
    const rest = [{ start: "2026-11-05", end: "2026-11-08" }];

    assert.equal(ask(wake, new Date(2026, 10, 6, 6, 0), { restPeriods: rest }), false);
  });

  test("a Habit between Seasons doesn't ring today", () => {
    const seasonal = { ...wake, seasons: [{ start: "2026-04-01", end: "2026-10-31" }] };

    assert.equal(ask(seasonal, new Date(2026, 10, 6, 6, 0)), false);
  });
});
