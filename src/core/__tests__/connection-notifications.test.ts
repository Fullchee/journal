import assert from "node:assert/strict";
import { connectionNotifications } from "@/core/connection-notifications";
import type { Connection } from "@/core/connections-view";
import { makeConnection } from "./helpers/connection";

const person = (overrides: Partial<Connection> = {}) =>
  makeConnection({ name: "Priya", ...overrides });

// A Friday morning, local time.
const NOW = new Date(2026, 10, 6, 8, 0);

const PRACTICE = { label: "Dragon boat", days: [2], time: "18:30" };

test("a timed meetup reminds 30 minutes before, weekly, with what to ask", () => {
  const [n] = connectionNotifications(
    [person({ meetups: [PRACTICE], followUps: "- race prep" })],
    NOW,
  );

  assert.equal(n?.title, "Seeing Priya at Dragon boat");
  assert.equal(n.body, "Ask about: race prep");
  assert.deepEqual(n.schedule, {
    on: { weekday: 3, hour: 18, minute: 0, second: 0 },
    allowWhileIdle: true,
  });
});

test("a meetup without a time has no reminder", () => {
  const untimed = person({ meetups: [{ label: "Dragon boat", days: [2] }] });

  assert.deepEqual(connectionNotifications([untimed], NOW), []);
});

test("people at the same meetup share one reminder", () => {
  const notifications = connectionNotifications(
    [
      person({ meetups: [PRACTICE], followUps: "- race prep" }),
      person({ id: 2, name: "Sam", meetups: [{ ...PRACTICE, label: "dragon boat" }] }),
      person({ id: 3, name: "Lee", meetups: [PRACTICE], followUps: "- new job" }),
    ],
    NOW,
  );

  assert.deepEqual(
    notifications.map((n) => [n.title, n.body]),
    [["Seeing Priya, Sam, and Lee at Dragon boat", "Priya: race prep · Lee: new job"]],
  );
});

test("two people at a meetup are joined by and", () => {
  const notifications = connectionNotifications(
    [person({ meetups: [PRACTICE] }), person({ id: 2, name: "Sam", meetups: [PRACTICE] })],
    NOW,
  );

  assert.equal(notifications[0]?.title, "Seeing Priya and Sam at Dragon boat");
});

test("a reminder before a meetup just after midnight falls on the evening before", () => {
  const [n] = connectionNotifications(
    [person({ meetups: [{ label: "Night shift", days: [0], time: "00:15" }] })],
    NOW,
  );

  assert.deepEqual(n?.schedule.on, { weekday: 7, hour: 23, minute: 45, second: 0 });
  assert.equal(n.body, "Starts at 12:15 AM");
});

test("a birthday reminds the morning before and the morning of", () => {
  const notifications = connectionNotifications(
    [person({ dates: [{ label: "Birthday", date: "1990-11-10", yearly: true }] })],
    NOW,
  );

  assert.deepEqual(
    notifications.map((n) => [n.title, n.body, n.schedule.at]),
    [
      ["Priya: Birthday", "Tomorrow", new Date(2026, 10, 9, 9)],
      ["Priya: Birthday", "Today", new Date(2026, 10, 10, 9)],
    ],
  );
});

test("a date tomorrow skips the reminder whose morning has passed", () => {
  const notifications = connectionNotifications(
    [person({ dates: [{ label: "Surgery", date: "2026-11-07", yearly: false }] })],
    new Date(2026, 10, 6, 10, 0),
  );

  assert.deepEqual(
    notifications.map((n) => n.body),
    ["Today"],
  );
});

test("a one-off date that passed has no reminder", () => {
  const passed = person({ dates: [{ label: "Wedding", date: "2026-01-01", yearly: false }] });

  assert.deepEqual(connectionNotifications([passed], NOW), []);
});

test("Connection ids sit above every Habit alarm id and fit a Java int", () => {
  const ids = connectionNotifications(
    [
      person({
        meetups: [{ ...PRACTICE, days: [0, 6] }],
        dates: [{ label: "Birthday", date: "1990-11-10", yearly: true }],
      }),
    ],
    NOW,
  ).map((n) => n.id);

  assert.equal(new Set(ids).size, 4);
  assert.ok(ids.every((id) => id >= 2_000_000_000 && id <= 2_147_483_647));
});
