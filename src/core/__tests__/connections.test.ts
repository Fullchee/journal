import assert from "node:assert/strict";
import {
  bySoonest,
  meetupLabel,
  seeingToday,
  closenessLabel,
  cadenceForCloseness,
  circleNames,
  dueToReachOut,
  firstFollowUp,
  inDaysLabel,
  lastContactedLabel,
  nextOccurrence,
  overdueShare,
  planWith,
  upcomingDates,
  Connection,
} from "@/core/connections-view";
import { makeConnection } from "./helpers/connection";

for (const [name, date, yearly, expected] of [
  ["a yearly date still ahead falls this year", "1990-11-10", true, "2026-11-10"],
  ["a yearly date already passed falls next year", "1990-03-12", true, "2027-03-12"],
  ["a yearly date on today is today", "1990-11-06", true, "2026-11-06"],
  ["a one-off date ahead keeps its day", "2027-06-05", false, "2027-06-05"],
  ["a one-off date that passed has no next day", "2026-01-01", false, null],
] as const)
  test(`nextOccurrence: ${name}`, () => {
    assert.equal(nextOccurrence({ label: "x", date, yearly }, "2026-11-06"), expected);
  });

test("upcomingDates lists dates inside the window, soonest first", () => {
  const people = [
    makeConnection({
      id: 1,
      name: "Sam",
      dates: [{ label: "Birthday", date: "1990-11-20", yearly: true }],
    }),
    makeConnection({
      id: 2,
      name: "Mom",
      dates: [{ label: "Surgery", date: "2026-11-08", yearly: false }],
    }),
    makeConnection({
      id: 3,
      name: "Priya",
      dates: [{ label: "Birthday", date: "1990-12-25", yearly: true }],
    }),
  ];

  assert.deepEqual(upcomingDates(people, "2026-11-06"), [
    { id: 2, name: "Mom", label: "Surgery", inDays: 2 },
    { id: 1, name: "Sam", label: "Birthday", inDays: 14 },
  ]);
});

test("bySoonest orders dates by their next day, passed one-offs last", () => {
  const dates = [
    { label: "Wedding", date: "2027-06-05", yearly: false },
    { label: "Graduation", date: "2026-05-01", yearly: false },
    { label: "Birthday", date: "1990-11-10", yearly: true },
  ];

  assert.deepEqual(
    bySoonest(dates, "2026-11-06").map((d) => d.label),
    ["Birthday", "Wedding", "Graduation"],
  );
});

test("closenessLabel capitalizes the closeness", () => {
  assert.equal(closenessLabel("friend"), "Friend");
});

for (const [name, closeness, cadenceDays, expected] of [
  ["close with no cadence suggests weekly", "close", null, 7],
  ["friend with no cadence suggests monthly", "friend", null, 30],
  ["a set cadence stays", "close", 90, 90],
  ["unset closeness suggests nothing", "", null, null],
] as const)
  test(`cadenceForCloseness: ${name}`, () => {
    assert.equal(cadenceForCloseness(closeness, cadenceDays), expected);
  });

test("circleNames lists each Circle once, by name", () => {
  const people = [
    makeConnection({ id: 1, circles: ["Shockwave dragon boat", "Coworkers"] }),
    makeConnection({ id: 2, circles: ["Coworkers", "Mahjong"] }),
    makeConnection({ id: 3 }),
  ];

  assert.deepEqual(circleNames(people), ["Coworkers", "Mahjong", "Shockwave dragon boat"]);
});

test("inDaysLabel names today and tomorrow", () => {
  assert.deepEqual(
    [0, 1, 5].map((n) => inDaysLabel(n)),
    ["today", "tomorrow", "in 5 days"],
  );
});

const NOW = new Date("2026-11-06T12:00:00Z");

test("dueToReachOut suggests the most overdue people first, at most three", () => {
  const people = [
    makeConnection({ id: 1, cadenceDays: 7, lastContactedOn: "2026-10-30" }),
    makeConnection({ id: 2, cadenceDays: 7, lastContactedOn: "2026-10-16" }),
    makeConnection({ id: 3, cadenceDays: 30, lastContactedOn: null }),
    makeConnection({ id: 4, cadenceDays: 14, lastContactedOn: "2026-10-01" }),
    makeConnection({ id: 5, cadenceDays: 7, lastContactedOn: "2026-11-05" }),
    makeConnection({ id: 6, cadenceDays: null }),
  ];

  assert.deepEqual(
    dueToReachOut(people, NOW).map((c) => c.id),
    [2, 4, 1],
  );
});

// NOW is a Friday (weekday 5).
const DRAGON_BOAT = { label: "Dragon boat", days: [3, 5] };

test("seeingToday lists people with a meetup on today's weekday and what to ask them", () => {
  const people = [
    makeConnection({ id: 1, name: "Sam", meetups: [DRAGON_BOAT], followUps: "- race prep" }),
    makeConnection({ id: 2, name: "Mom", meetups: [{ label: "Dinner", days: [0] }] }),
  ];

  assert.deepEqual(seeingToday(people, NOW), [
    { id: 1, name: "Sam", label: "Dragon boat", followUp: "race prep" },
  ]);
});

test("dueToReachOut skips someone I'll see at a meetup today", () => {
  const overdue = makeConnection({ cadenceDays: 7, lastContactedOn: "2026-10-01" });

  assert.deepEqual(dueToReachOut([{ ...overdue, meetups: [DRAGON_BOAT] }], NOW), []);
});

test("meetupLabel names the weekdays, or just the label when irregular", () => {
  assert.equal(meetupLabel(DRAGON_BOAT), "Dragon boat · Wed, Fri");
  assert.equal(meetupLabel({ label: "Book club", days: [] }), "Book club");
});

test("meetupLabel adds the start time after the weekdays", () => {
  assert.equal(meetupLabel({ ...DRAGON_BOAT, time: "18:30" }), "Dragon boat · Wed, Fri at 6:30 PM");
  assert.equal(meetupLabel({ ...DRAGON_BOAT, time: "" }), "Dragon boat · Wed, Fri");
});

test("firstFollowUp takes the first item without its list marker", () => {
  assert.equal(
    firstFollowUp("\n- How the new job is going\n- Her dog"),
    "How the new job is going",
  );
});

test("lastContactedLabel counts calendar days", () => {
  assert.equal(lastContactedLabel(null, NOW), "Not yet");
  assert.equal(lastContactedLabel("2026-11-06", NOW), "Today");
  assert.equal(lastContactedLabel("2026-11-05", NOW), "Yesterday");
  assert.equal(lastContactedLabel("2026-11-03", NOW), "3 days ago");
});

test("planWith picks the grow-closer person who has waited longest for a plan", () => {
  const people = [
    makeConnection({ id: 1, growCloser: true, planCheckedAt: "2026-10-20T12:00:00Z" }),
    makeConnection({ id: 2, growCloser: true, planCheckedAt: "2026-10-01T12:00:00Z" }),
    makeConnection({ id: 3, planCheckedAt: null }),
  ];

  assert.equal(planWith(people, NOW)?.id, 2);
});

test("planWith counts never asked as waiting longest", () => {
  const people = [
    makeConnection({ id: 1, growCloser: true, planCheckedAt: "2026-10-01T12:00:00Z" }),
    makeConnection({ id: 2, growCloser: true }),
  ];

  assert.equal(planWith(people, NOW)?.id, 2);
});

test("planWith waits a week after I answered", () => {
  const answered = makeConnection({ growCloser: true, planCheckedAt: "2026-11-01T12:00:00Z" });

  assert.equal(planWith([answered], NOW), null);
});

test("planWith skips someone I'll see at a meetup today", () => {
  const seeing = makeConnection({ growCloser: true, meetups: [DRAGON_BOAT] });

  assert.equal(planWith([seeing], NOW), null);
});

for (const [name, overrides, expected] of [
  ["no cadence is never overdue", { cadenceDays: null }, -Infinity],
  ["never contacted counts as one cadence", { cadenceDays: 7 }, 1],
  ["two cadences since contact", { cadenceDays: 7, lastContactedOn: "2026-10-23" }, 2],
] as const)
  test(`overdueShare: ${name}`, () => {
    assert.equal(
      overdueShare(makeConnection(overrides), new Date("2026-11-06T12:00:00Z")),
      expected,
    );
  });

test("a Connection parses a picked contact's id, or null when typed in", () => {
  assert.deepEqual(
    [makeConnection({ contactId: "0r1-2A3B" }), makeConnection()].map(
      (c) => Connection.parse(c).contactId,
    ),
    ["0r1-2A3B", null],
  );
});
