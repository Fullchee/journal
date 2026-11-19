import assert from "node:assert/strict";
import {
  factsOf,
  oneOffsOf,
  parseProse,
  skipsOf,
  coachName,
  windowFrom,
  windowNote,
  type SessionSearch,
} from "@/core/session-brief";
import { blankCheckIn, type CheckIn } from "@/core/check-in-view";

const NOW = new Date("2026-11-06T17:00:00Z");

const checkIn = (checkedInAt: string, score: number, extra: Partial<CheckIn> = {}): CheckIn => ({
  ...blankCheckIn(score, checkedInAt),
  id: 1,
  ...extra,
});

for (const [plan, name] of [
  ["Coach: Dr. Rao", "Dr. Rao"],
  ["- **Coach:** Sam Lee\n- Meds: x", "Sam Lee"],
  ["Current focus: find a coach.", null],
  ["**Coach:**\n\nDr. Rao", "Dr. Rao"],
  ["Coach: **", null],
  ["Coach: Dr. Rao\nMeds: x", "Dr. Rao"],
] as const)
  test(`coachName reads ${JSON.stringify(plan)}`, () => {
    assert.equal(coachName(plan), name);
  });

test("windowFrom starts at the last past session, ignoring future and all-day events", () => {
  const events = [
    { summary: "T", start: "2026-10-23T14:00:00Z", end: "2026-10-23T15:00:00Z" },
    { summary: "T", start: "2026-10-30T14:00:00Z", end: "2026-10-30T15:00:00Z" },
    { summary: "T", start: "2026-11-13T14:00:00Z", end: "2026-11-13T15:00:00Z" },
    { summary: "T", start: "2026-11-02", end: "2026-11-03" },
  ];

  assert.deepEqual(windowFrom({ status: "ok", value: events }, NOW), {
    start: "2026-10-30",
    calendar: "found",
  });
});

for (const [search, calendar] of [
  [{ status: "ok", value: [] }, "no-match"],
  [{ status: "not-connected" }, "not-connected"],
  [{ status: "unreachable" }, "unreachable"],
  [null, "no-coach"],
] satisfies [SessionSearch, string][])
  test(`windowFrom defaults to 7 days ago when the calendar says ${calendar}`, () => {
    assert.deepEqual(windowFrom(search, NOW), { start: "2026-10-30", calendar });
  });

test("factsOf groups by Toronto day, splits lows and highs, and counts habits", () => {
  const facts = factsOf("2026-11-02", NOW, {
    checkIns: [
      checkIn("2026-11-01T15:00:00Z", 1),
      checkIn("2026-11-03T15:00:00Z", 2, { place: "Home", doing: "reading" }),
      checkIn("2026-11-04T15:00:00Z", 8),
    ],
    sleep: [{ date: "2026-11-03", durationMin: 400, sleepScore: 70 }],
    habitsDone: [
      { date: "2026-11-01", name: "Walk" },
      { date: "2026-11-03", name: "Stretch" },
      { date: "2026-11-03", name: "Walk" },
      { date: "2026-11-04", name: "Walk" },
    ],
    oneOffs: { habits: [], checks: [], reschedules: {} },
    skips: [],
  });

  assert.equal(facts.rows.length, 2);
  assert.equal(facts.rows[0]?.where, "Home");
  assert.equal(facts.rows[0].doing, "reading");
  assert.equal(facts.lows.length, 1);
  assert.equal(facts.highs.length, 1);
  assert.deepEqual(facts.habits, [
    { name: "Walk", days: 2 },
    { name: "Stretch", days: 1 },
  ]);
});

test("skipsOf lists Skips in the window, oldest first, and flags only avoidance", () => {
  const skips = skipsOf("2026-11-02", [
    { name: "Run", date: "2026-11-04", cause: "avoidance", note: "tired" },
    { name: "Run", date: "2026-11-01", cause: "avoidance", note: "" },
    { name: "Read", date: "2026-11-03", cause: "outside", note: "" },
  ]);

  assert.deepEqual(skips, [
    { name: "Read", date: "2026-11-03", cause: "outside", note: "", flagged: false },
    { name: "Run", date: "2026-11-04", cause: "avoidance", note: "tired", flagged: true },
  ]);
});

const portage = { id: "portage", name: "Go portaging", startDate: "2026-11-14" };

const move = (from: string, to: string, cause: "outside" | "avoidance", createdAt: string) => ({
  from,
  to,
  cause,
  note: cause === "outside" ? "rain" : "",
  createdAt,
});

test("oneOffsOf lists each Reschedule in the window and flags only avoidance", () => {
  const [oneOff] = oneOffsOf("2026-11-02", "2026-11-06", {
    habits: [portage],
    checks: [],
    reschedules: {
      portage: [
        move("2026-10-25", "2026-11-01", "outside", "2026-10-24T12:00:00Z"),
        move("2026-11-01", "2026-11-07", "outside", "2026-11-03T12:00:00Z"),
        move("2026-11-07", "2026-11-14", "avoidance", "2026-11-05T12:00:00Z"),
      ],
    },
  });

  assert.deepEqual(
    oneOff?.reschedules.map(({ to, cause, note, flagged, on }) => ({
      to,
      cause,
      note,
      flagged,
      on,
    })),
    [
      { to: "2026-11-07", cause: "outside", note: "rain", flagged: false, on: "2026-11-03" },
      { to: "2026-11-14", cause: "avoidance", note: "", flagged: true, on: "2026-11-05" },
    ],
  );
  assert.equal(oneOff.status, "due");
});

test.each([
  { id: "unanswered", checks: [], status: "overdue", answeredOn: null },
  {
    id: "done",
    checks: [{ habit: "portage", date: "2026-11-05", count: 1 }],
    status: "done",
    answeredOn: "2026-11-05",
  },
  {
    id: "missed",
    checks: [{ habit: "portage", date: "2026-11-03", count: -1 }],
    status: "not-done",
    answeredOn: "2026-11-03",
  },
  {
    id: "checked_before_due",
    checks: [{ habit: "portage", date: "2026-11-01", count: 1 }],
    status: "overdue",
    answeredOn: null,
  },
])("oneOffsOf calls a One-off due mid-week $status when $id", ({ checks, status, answeredOn }) => {
  const [oneOff] = oneOffsOf("2026-11-02", "2026-11-06", {
    habits: [{ ...portage, startDate: "2026-11-03" }],
    checks,
    reschedules: {},
  });

  assert.deepEqual(
    { status: oneOff?.status, answeredOn: oneOff?.answeredOn },
    { status, answeredOn },
  );
});

test("oneOffsOf keeps an old overdue One-off and drops one answered before the window", () => {
  const oneOffs = oneOffsOf("2026-11-02", "2026-11-06", {
    habits: [
      { id: "old", name: "Old", startDate: "2026-10-01" },
      { id: "answered", name: "Answered", startDate: "2026-10-01" },
      { id: "later", name: "Later", startDate: "2026-12-01" },
    ],
    checks: [{ habit: "answered", date: "2026-10-01", count: 1 }],
    reschedules: {},
  });

  assert.deepEqual(
    oneOffs.map(({ name, status }) => ({ name, status })),
    [{ name: "Old", status: "overdue" }],
  );
});

test("oneOffsOf puts overdue One-offs first, then by due date", () => {
  const oneOffs = oneOffsOf("2026-11-02", "2026-11-06", {
    habits: [
      { id: "a", name: "Done early", startDate: "2026-11-02" },
      { id: "b", name: "Overdue", startDate: "2026-11-04" },
      { id: "c", name: "Today", startDate: "2026-11-06" },
    ],
    checks: [{ habit: "a", date: "2026-11-02", count: 1 }],
    reschedules: {},
  });

  assert.deepEqual(
    oneOffs.map((o) => o.name),
    ["Overdue", "Done early", "Today"],
  );
});

test("parseProse accepts the JSON shape, even inside a code fence", () => {
  const reply = '```json\n{"summary":"s","patterns":["a"],"toRaise":"r"}\n```';
  assert.deepEqual(parseProse(reply), { summary: "s", patterns: ["a"], toRaise: "r" });
});

for (const reply of [
  undefined,
  "no json",
  "{not json}",
  '{"summary":1}',
  '{"summary":"s","patterns":[1],"toRaise":"r"}',
])
  test(`parseProse rejects ${String(reply)}`, () => {
    assert.equal(parseProse(reply), null);
  });

for (const calendar of ["found", "no-match", "no-coach", "not-connected", "unreachable"] as const)
  test(`windowNote explains ${calendar}`, () => {
    assert.match(windowNote({ start: "2026-10-30", calendar }, "Dr. Rao"), /\w+/);
  });

test("windowNote says the calendar is unreachable and tells the user to reconnect", () => {
  assert.match(windowNote({ start: "x", calendar: "unreachable" }, null), /unreachable/);
  assert.match(windowNote({ start: "x", calendar: "not-connected" }, null), /reconnect/i);
});
