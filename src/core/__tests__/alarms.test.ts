import assert from "node:assert/strict";
import { alarmNote, notificationId, notificationsFor, widgetAlarms } from "@/core/alarms";
import { makeHabit } from "./helpers/habit";

// alarmNote takes a non-null alarm, so it sits outside the Habit fixture.
const wake = {
  ...makeHabit({ id: "out-of-bed-a1b2c3", name: "Out of bed" }),
  alarm: { time: "07:15", kind: "alarm" } as const,
};

test("notificationsFor schedules a daily Habit's alarm as one repeating notification", () => {
  const [notification, ...rest] = notificationsFor([wake]);

  assert.equal(rest.length, 0);
  assert.equal(notification?.id, notificationId(wake.id));
  assert.equal(notification.title, "Out of bed");
  assert.equal(notification.channelId, "alarms");
  assert.deepEqual(notification.schedule, {
    on: { hour: 7, minute: 15, second: 0 },
    allowWhileIdle: true,
  });
});

test("notificationsFor keeps every notification on screen until it is tapped", () => {
  const [notification] = notificationsFor([wake]);

  assert.equal(notification?.ongoing, true);
  assert.equal(notification.autoCancel, true);
});

test("notificationsFor rings a fixed-weekday Habit on its weekdays, Sunday as the plugin's 1", () => {
  const weekdays = notificationsFor([
    { ...wake, target: { type: "days", count: 7, days: [0, 5] } },
  ]);

  assert.deepEqual(
    weekdays.map((n) => [n.id, n.schedule.on]),
    [
      [notificationId(wake.id, 1), { weekday: 1, hour: 7, minute: 15, second: 0 }],
      [notificationId(wake.id, 6), { weekday: 6, hour: 7, minute: 15, second: 0 }],
    ],
  );
});

test("notificationsFor rings an N× a week Habit every day", () => {
  const [notification, ...rest] = notificationsFor([
    { ...wake, target: { type: "weekly", count: 3, days: [] } },
  ]);

  assert.equal(rest.length, 0);
  assert.deepEqual(notification?.schedule.on, { hour: 7, minute: 15, second: 0 });
});

test("notificationsFor sends a persistent alarm to the quiet channel", () => {
  const [notification] = notificationsFor([
    { ...wake, alarm: { time: "07:15", kind: "persistent" } },
  ]);

  assert.equal(notification?.channelId, "persistent");
});

test("notificationsFor skips Habits with no alarm, Tree Habits, Backlog Habits and Reference Habits", () => {
  assert.deepEqual(
    notificationsFor([
      { ...wake, alarm: null },
      { ...wake, stage: "tree" },
      { ...wake, active: false },
      { ...wake, target: { type: "none", count: 7, days: [] } },
    ]),
    [],
  );
});

test("notificationId is stable, distinct per Habit and weekday, and fits a 32-bit int", () => {
  const ids = [
    notificationId("a"),
    notificationId("b"),
    notificationId("a", 1),
    notificationId("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", 7),
  ];

  assert.equal(notificationId("a"), ids[0]);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => Number.isSafeInteger(id) && id >= 0 && id < 2 ** 31));
});

test("alarmNote says when the alarm rings", () => {
  assert.equal(alarmNote(wake), "Rings at 7:15 AM every day, in the Android app.");
  assert.equal(
    alarmNote({ ...wake, target: { type: "days", count: 7, days: [1, 5] } }),
    "Rings at 7:15 AM on Mon, Fri, in the Android app.",
  );
  assert.equal(
    alarmNote({ ...wake, alarm: { time: "21:00", kind: "persistent" } }),
    "Shows quietly at 9:00 PM every day, in the Android app.",
  );
});

test("alarmNote says why a Tree or Backlog Habit stays silent", () => {
  assert.equal(alarmNote({ ...wake, stage: "tree" }), "Tree Habits don't ring.");
  assert.equal(alarmNote({ ...wake, active: false }), "Backlog Habits don't ring.");
});

test("widgetAlarms lists ringing Habits earliest first, with every day for a daily Habit", () => {
  const late = {
    ...wake,
    id: "read-z9",
    name: "Read",
    alarm: { time: "21:30", kind: "persistent" } as const,
  };

  assert.deepEqual(widgetAlarms([late, wake]), [
    { id: wake.id, name: "Out of bed", time: "07:15", days: [0, 1, 2, 3, 4, 5, 6] },
    { id: "read-z9", name: "Read", time: "21:30", days: [0, 1, 2, 3, 4, 5, 6] },
  ]);
});

test("widgetAlarms keeps a fixed-weekday Habit's days and skips Habits that don't ring", () => {
  assert.deepEqual(
    widgetAlarms([
      { ...wake, target: { type: "days", count: 2, days: [1, 3] } },
      { ...wake, alarm: null },
      { ...wake, active: false },
    ]),
    [{ id: wake.id, name: "Out of bed", time: "07:15", days: [1, 3] }],
  );
});

const portage = {
  ...wake,
  id: "portage-a1",
  name: "Portage",
  startDate: "2026-11-14",
  target: { type: "once" as const, count: 1, days: [] },
};

const BEFORE = new Date(2026, 10, 8, 12, 0);

test("notificationsFor rings a One-off once, at its time on its date", () => {
  const [notification, ...rest] = notificationsFor([portage], BEFORE);

  assert.equal(rest.length, 0);
  assert.equal(notification?.id, notificationId(portage.id));
  assert.deepEqual(notification.schedule, {
    at: new Date(2026, 10, 14, 7, 15, 0),
    allowWhileIdle: true,
  });
});

test("notificationsFor skips a One-off whose moment has passed", () => {
  assert.deepEqual(notificationsFor([portage], new Date(2026, 10, 14, 7, 16)), []);
});

test("alarmNote says a One-off rings only on its date", () => {
  assert.equal(alarmNote(portage), "Rings at 7:15 AM on Sat 14 Nov, in the Android app.");
});

test("widgetAlarms leaves out One-offs, since the widget lists weekly alarms", () => {
  assert.deepEqual(widgetAlarms([portage]), []);
});

// Due 8 Nov, then every 3 days: 11, 14, 17 Nov and on.
const everyThree = {
  ...wake,
  startDate: "2026-11-08",
  target: { type: "interval" as const, count: 3, days: [] },
};

test("notificationsFor rings an Every N days Habit once on each due day ahead, from today's if still to come", () => {
  const rings = notificationsFor([everyThree], new Date(2026, 10, 8, 7, 0));

  assert.equal(rings.length, 10);
  assert.deepEqual(
    rings.slice(0, 3).map((n) => [n.id, n.schedule]),
    [
      [notificationId(wake.id, 0), { at: new Date(2026, 10, 8, 7, 15), allowWhileIdle: true }],
      [notificationId(wake.id, 1), { at: new Date(2026, 10, 11, 7, 15), allowWhileIdle: true }],
      [notificationId(wake.id, 2), { at: new Date(2026, 10, 14, 7, 15), allowWhileIdle: true }],
    ],
  );
});

test("notificationsFor skips today's ring of an Every N days Habit once its time has passed", () => {
  const [first] = notificationsFor([everyThree], new Date(2026, 10, 8, 8, 0));

  assert.deepEqual(first?.schedule.at, new Date(2026, 10, 11, 7, 15));
});

test("notificationsFor rings an N× a month Habit every day", () => {
  const [notification, ...rest] = notificationsFor([
    { ...wake, target: { type: "monthly", count: 2, days: [] } },
  ]);

  assert.equal(rest.length, 0);
  assert.deepEqual(notification?.schedule.on, { hour: 7, minute: 15, second: 0 });
});

test("alarmNote names an Every N days or N× a month Habit's days", () => {
  assert.equal(alarmNote(everyThree), "Rings at 7:15 AM every 3 days, in the Android app.");
  assert.equal(
    alarmNote({ ...wake, target: { type: "monthly", count: 2, days: [] } }),
    "Rings at 7:15 AM every day, in the Android app.",
  );
});

test("widgetAlarms leaves out an Every N days Habit, since its days don't repeat weekly", () => {
  assert.deepEqual(widgetAlarms([everyThree]), []);
});
