import assert from "node:assert/strict";
import {
  canFixDate,
  canFixStartDate,
  blankHabit,
  KIND_COPY,
  cueChoices,
  newHabitDraft,
  descriptionBody,
  cueMissing,
  loopSentence,
  scheduleSummary,
  stackCandidates,
  targetCountRange,
  targetWhen,
  withTargetType,
  toggleDay,
  causeLine,
  checksSince,
  scheduleLabel,
  isReference,
  isOneOff,
  hasTinyVersion,
  isTinyDay,
  inTracker,
  dueDateLabel,
  Reschedule,
  Reschedules,
  isTimed,
  libraryHabit,
  libraryHabits,
  Habit,
  type Target,
} from "@/core/habits-view";
import { makeHabit } from "./helpers/habit";
import { torontoDay } from "@/core/calendar";

const WEDNESDAY = new Date(2026, 10, 4, 15, 30);

test("checksSince starts six days back, before this week's Monday", () => {
  assert.equal(checksSince(WEDNESDAY), "2026-10-29");
});

test("checksSince counts back Toronto Days, even late in a Vancouver evening", () => {
  // 23:30 PST on Nov 4 is already Nov 5 in Toronto.
  assert.equal(checksSince(new Date("2026-11-04T23:30:00-08:00")), "2026-10-30");
});

test("blankHabit starts a daily Habit of the given kind, never a tree, starting today", () => {
  const blank = blankHabit("good");
  assert.deepEqual(
    [blank.kind, blank.trees, blank.target.type, blank.record, blank.startDate],
    ["good", [], "daily", "check", torontoDay(new Date())],
  );
});

test("blankHabit leaves the cue type unset", () => {
  assert.equal(blankHabit("good").cueType, "");
});

test("cueMissing names a stacked cue with no habit", () => {
  assert.equal(cueMissing(makeHabit({ cueType: "stacked", stackedAfter: null })), "stacked");
  assert.equal(cueMissing(makeHabit({ cueType: "stacked", stackedAfter: "a" })), null);
  assert.equal(cueMissing(makeHabit({ cueType: "", stackedAfter: null })), null);
});

test("cueMissing names a Scheduled cue with no time", () => {
  assert.equal(cueMissing(makeHabit({ cueType: "time", usualWhen: "" })), "time");
  assert.equal(cueMissing(makeHabit({ cueType: "time", usualWhen: "08:00" })), null);
  assert.equal(
    cueMissing(makeHabit({ cueType: "time", alarm: { time: "07:00", kind: "alarm" } })),
    null,
  );
});

test("cueMissing ignores a One-off, which has no cue", () => {
  assert.equal(
    cueMissing(makeHabit({ cueType: "time", target: { type: "once", count: 1, days: [] } })),
    null,
  );
});

test("newHabitDraft starts a good Habit Scheduled and a bad one with no cue", () => {
  assert.equal(newHabitDraft("good").cueType, "time");
  assert.equal(newHabitDraft("bad").cueType, "");
  assert.equal(newHabitDraft("bad").record, "count");
});

test("cueChoices answers After what? with a set time first, and a time of day on a bad Habit", () => {
  assert.deepEqual(
    cueChoices("good", "").map((c) => c.label),
    ["A set time", "Another habit", "Something I did", "A feeling", "Being with people"],
  );
  assert.equal(cueChoices("bad", "")[0]?.label, "A time of day");
});

test("cueChoices keeps the hidden location cue while a Habit holds it", () => {
  assert.equal(cueChoices("good", "location").at(-1)?.id, "location");
});

test("KIND_COPY calls a good Habit's target Frequency and a bad one's Limit", () => {
  assert.deepEqual([KIND_COPY.good.target, KIND_COPY.bad.target], ["Frequency", "Limit"]);
});

test("blankHabit counts each time for a bad habit", () => {
  assert.equal(blankHabit("bad").record, KIND_COPY.bad.recordDefault);
  assert.equal(blankHabit("bad").record, "count");
});

test("toggleDay adds a weekday in order and removes it when present", () => {
  assert.deepEqual(toggleDay([1, 5], 3), [1, 3, 5]);
  assert.deepEqual(toggleDay([1, 3, 5], 3), [1, 5]);
});

const NAMES = new Map([
  ["a", "Brush teeth"],
  ["b", "Floss"],
]);

const nameOf = (id: string) => NAMES.get(id) ?? id;

test("targetWhen names every day, a weekly count or the weekdays", () => {
  assert.equal(targetWhen(makeHabit().target), "every day");
  assert.equal(targetWhen({ type: "weekly", count: 3, days: [] }), "3× a week");
  assert.equal(targetWhen({ type: "days", count: 7, days: [1, 3] }), "Mon, Wed");
  assert.equal(targetWhen({ type: "monthly", count: 2, days: [] }), "2× a month");
  assert.equal(targetWhen({ type: "interval", count: 3, days: [] }), "every 3 days");
});

test("scheduleSummary names a monthly count or an interval", () => {
  assert.equal(
    scheduleSummary(makeHabit({ target: { type: "monthly", count: 3, days: [] } })),
    "Due 3× a month, checked once a day",
  );
  assert.equal(
    scheduleSummary(makeHabit({ target: { type: "interval", count: 3, days: [] } })),
    "Due every 3 days, checked once a day",
  );
});

test("scheduleLabel names a monthly count or an interval", () => {
  assert.equal(
    scheduleLabel(makeHabit({ target: { type: "monthly", count: 3, days: [] } })),
    "3× a month",
  );
  assert.equal(
    scheduleLabel(makeHabit({ target: { type: "interval", count: 3, days: [] } })),
    "Every 3 days",
  );
});

test("withTargetType moves the count into the new Frequency's range", () => {
  const monthly: Target = { type: "monthly", count: 20, days: [] };

  assert.deepEqual(withTargetType(monthly, "weekly"), { type: "weekly", count: 7, days: [] });
  assert.deepEqual(withTargetType(monthly, "interval"), { type: "interval", count: 20, days: [] });
  assert.deepEqual(withTargetType({ ...monthly, count: 1 }, "interval").count, 2);
  assert.deepEqual(withTargetType(monthly, "daily").count, 7);
});

test("targetCountRange bounds each counted Frequency, and 1 to 7 for the rest", () => {
  assert.deepEqual(
    ["weekly", "monthly", "interval", "days"].map((type) => targetCountRange(type)),
    [
      { min: 1, max: 7 },
      { min: 1, max: 31 },
      { min: 2, max: 30 },
      { min: 1, max: 7 },
    ],
  );
});

test("checksSince reaches back to the 1st once the month is a week old", () => {
  assert.equal(checksSince(new Date(2026, 10, 20, 12, 0)), "2026-11-01");
});

test("scheduleSummary joins the target and the record style by kind", () => {
  assert.equal(
    scheduleSummary(makeHabit({ target: { type: "weekly", count: 3, days: [] } })),
    "Due 3× a week, checked once a day",
  );
  assert.equal(
    scheduleSummary(
      makeHabit({ kind: "bad", record: "count", target: { type: "weekly", count: 2, days: [] } }),
    ),
    "At most 2× a week, counted each time",
  );
});

test("stackCandidates skips the habit itself and any habit that comes after it", () => {
  const habits = [
    makeHabit({ id: "a" }),
    makeHabit({ id: "b", stackedAfter: "a" }),
    makeHabit({ id: "c", stackedAfter: "b" }),
    makeHabit({ id: "d" }),
  ];

  assert.deepEqual(
    stackCandidates(habits, "a").map((h) => h.id),
    ["d"],
  );
  assert.deepEqual(
    stackCandidates(habits, "c").map((h) => h.id),
    ["a", "b", "d"],
  );
});

test("stackCandidates lists every habit for a new one and survives an existing loop", () => {
  const habits = [
    makeHabit({ id: "a", stackedAfter: "b" }),
    makeHabit({ id: "b", stackedAfter: "a" }),
    makeHabit({ id: "d" }),
  ];

  assert.equal(stackCandidates(habits).length, 3);
  assert.deepEqual(
    stackCandidates(habits, "d").map((h) => h.id),
    ["a", "b"],
  );
});

test("loopSentence names the anchor Habit, then the Habit itself and its usual time", () => {
  const h = makeHabit({ name: "Walk", stackedAfter: "a", usualWhen: "19:00" });

  assert.equal(loopSentence(h, nameOf), "After “Brush teeth”, I will do “Walk” at 7:00 PM.");
});

test("loopSentence uses the bad-habit wording", () => {
  const h = makeHabit({ kind: "bad", name: "Scroll", stackedAfter: "a" });

  assert.equal(loopSentence(h, nameOf), "After “Brush teeth”, I usually do “Scroll”.");
});

test("loopSentence opens a Scheduled cue with its time and leaves the time out of the action", () => {
  assert.equal(
    loopSentence(makeHabit({ name: "Walk", cueType: "time", usualWhen: "08:00" }), nameOf),
    "At 8:00 AM, I will do “Walk”.",
  );
});

test("loopSentence is empty with no anchor and no time, since it would only repeat the name", () => {
  assert.equal(loopSentence(makeHabit(), nameOf), "");
  assert.equal(loopSentence(makeHabit({ cueType: "emotion" }), nameOf), "");
  assert.equal(loopSentence(makeHabit({ cueType: "time" }), nameOf), "");
});

test("loopSentence keeps a usual time when the cue isn't Scheduled, and says do it for a blank name", () => {
  assert.equal(
    loopSentence(makeHabit({ name: "Read", usualWhen: "19:30" }), nameOf),
    "I will do “Read” at 7:30 PM.",
  );
  assert.equal(
    loopSentence(makeHabit({ name: " ", usualWhen: "12:00" }), nameOf),
    "I will do it at 12:00 PM.",
  );
});

const REFERENCE: Target = { type: "none", count: 7, days: [] };

test("isReference marks a habit with no target", () => {
  const habits = [makeHabit({ id: "a" }), makeHabit({ id: "r", target: REFERENCE })];

  assert.deepEqual(
    habits.map((h) => isReference(h)),
    [false, true],
  );
});

test("a Reference Habit reads as no target", () => {
  assert.equal(targetWhen(REFERENCE), "no target");
  assert.equal(
    scheduleSummary(makeHabit({ target: REFERENCE })),
    "Reference only: never in the tracker",
  );
});

test("libraryHabits lists only references, by name", () => {
  const habits = [
    makeHabit({ id: "a", name: "B", target: REFERENCE }),
    makeHabit({ id: "b", name: "A", target: REFERENCE }),
    makeHabit({ id: "d", name: "Tracked" }),
  ];

  assert.deepEqual(
    libraryHabits(habits).map((h) => h.name),
    ["A", "B"],
  );
});

test("libraryHabit finds a reference by id and skips tracked Habits", () => {
  const habits = [
    makeHabit({ id: "a", name: "A", target: REFERENCE }),
    makeHabit({ id: "d", name: "Tracked" }),
  ];

  assert.equal(libraryHabit(habits, "a")?.name, "A");
  assert.equal(libraryHabit(habits, "d"), undefined);
  assert.equal(libraryHabit(habits, "missing"), undefined);
});

const target = (t: Partial<Target>): Target => ({ type: "daily", count: 1, days: [], ...t });

test("scheduleLabel names the target and marks a counted habit", () => {
  const daily = makeHabit({ target: target({}) });
  const weekly = makeHabit({ target: target({ type: "weekly", count: 3 }) });
  const days = makeHabit({ target: target({ type: "days", days: [1, 3] }) });
  const reference = makeHabit({ target: target({ type: "none" }), record: "count" });

  assert.equal(scheduleLabel(daily), "Every day");
  assert.equal(scheduleLabel(weekly), "3× a week");
  assert.equal(scheduleLabel(days), "Mon, Wed");
  assert.equal(scheduleLabel(reference), "Reference");
  assert.equal(scheduleLabel(makeHabit({ record: "count" })), "Every day, counted");
});

test("scheduleLabel marks a timed habit", () => {
  assert.equal(
    scheduleLabel(makeHabit({ record: "duration", targetMinutes: 30 })),
    "Every day, timed",
  );
});

const TIMED_SUMMARIES: [string, Partial<Habit>, string][] = [
  ["good", { kind: "good", targetMinutes: 30 }, "Due every day, timed, at least 30 min a day"],
  ["bad", { kind: "bad", targetMinutes: 60 }, "At most every day, timed, at most 60 min a day"],
  ["no_minutes_yet", { targetMinutes: null }, "Due every day, timed"],
];

for (const [id, over, summary] of TIMED_SUMMARIES)
  test(`scheduleSummary of a timed habit: ${id}`, () => {
    assert.equal(scheduleSummary(makeHabit({ record: "duration", ...over })), summary);
  });

test("isTimed picks out duration Habits", () => {
  assert.deepEqual(
    [makeHabit({ record: "duration", targetMinutes: 30 }), makeHabit({ record: "count" })].map(
      (h) => isTimed(h),
    ),
    [true, false],
  );
});

test("descriptionBody drops a leading heading that repeats the Habit name", () => {
  assert.equal(
    descriptionBody({ name: "Walk", description: "# Walk\n\nAfter lunch" }),
    "After lunch",
  );
});

test("descriptionBody leaves nothing when the heading is the whole description", () => {
  assert.equal(descriptionBody({ name: "Walk", description: "# Walk" }), "");
});

test("causeLine names the cause, then the note when there is one", () => {
  assert.equal(causeLine({ cause: "outside", note: "" }), "Outside");
  assert.equal(causeLine({ cause: "avoidance", note: "too tired" }), "Avoidance: too tired");
});

test("checksSince defaults to the current date", () => {
  assert.equal(checksSince(), checksSince(new Date()));
});

test("descriptionBody keeps a leading heading that differs from the name", () => {
  const description = "# Why walking\nAfter lunch";

  assert.equal(descriptionBody({ name: "Walk", description }), description);
});

test("Habit refuses a usual when that isn't HH:MM", () => {
  assert.equal(Habit.safeParse(makeHabit({ usualWhen: "mornings" })).success, false);
  assert.equal(Habit.safeParse(makeHabit({ usualWhen: "7:45 a.m." })).success, false);
});

test("Habit parses a server Habit, including a blank cue type", () => {
  const habit = makeHabit({ cueType: "", alarm: { time: "07:30", kind: "persistent" } });

  assert.deepEqual(Habit.parse(habit), habit);
});

test("Habit rejects a tree span without its start", () => {
  assert.equal(Habit.safeParse({ ...makeHabit(), trees: [{ end: null }] }).success, false);
});

const portage = makeHabit({
  id: "portage",
  name: "Portage",
  startDate: "2026-11-14",
  target: { type: "once", count: 1, days: [] },
});

test("a Habits body accepts a once Target as the server stores it", () => {
  assert.equal(Habit.safeParse(portage).success, true);
});

test("isOneOff is true only for a once Target", () => {
  assert.equal(isOneOff(portage), true);
  assert.equal(isOneOff(makeHabit()), false);
});

test("only a good recurring Habit has a Tiny version", () => {
  assert.equal(hasTinyVersion(makeHabit()), true);
  assert.equal(hasTinyVersion(makeHabit({ kind: "bad" })), false);
  assert.equal(hasTinyVersion(portage), false);
  assert.equal(hasTinyVersion(makeHabit({ target: { type: "none", count: 7, days: [] } })), false);
});

test("a blank Habit has no Tiny version", () => {
  assert.equal(blankHabit("good").tinyVersion, "");
});

// A Check-in at `time` in Toronto on Sat 14 Nov 2026.
const checkInAt = (time: string, zone: "Storm" | "Rain" | "Cloud" | "Sun") => ({
  checkedInAt: `2026-11-14T${time}-05:00`,
  zone,
});

describe("isTinyDay", () => {
  // 15:00 in Toronto on Sat 14 Nov 2026.
  const now = new Date("2026-11-14T20:00:00Z");

  test.each(["Rain", "Storm"] as const)("is true when today's newest Check-in is %s", (zone) => {
    assert.equal(isTinyDay([checkInAt("09:00", "Sun"), checkInAt("14:00", zone)], now), true);
  });

  test.each(["Cloud", "Sun"] as const)("is false when today's newest Check-in is %s", (zone) => {
    assert.equal(isTinyDay([checkInAt("14:00", zone), checkInAt("09:00", "Storm")], now), false);
  });

  test("is false with no Check-in today", () => {
    assert.equal(
      isTinyDay([{ checkedInAt: "2026-11-13T22:00:00-05:00", zone: "Storm" }], now),
      false,
    );
    assert.equal(isTinyDay([], now), false);
  });
});

test("a One-off takes a date fix only before its date and its first Reschedule", () => {
  const moved = [
    { from: "2026-11-10", to: "2026-11-14", cause: "outside" as const, note: "", createdAt: "" },
  ];

  assert.equal(canFixDate(portage, [], "2026-11-13"), true);
  assert.equal(canFixDate(portage, [], "2026-11-14"), false);
  assert.equal(canFixDate(portage, moved, "2026-11-13"), false);
});

test("the date-fix rule reads a date already come or an earlier Reschedule as needing one", () => {
  assert.deepEqual(
    [
      canFixStartDate("2026-11-14", false, "2026-11-13"),
      canFixStartDate("2026-11-14", false, "2026-11-14"),
      canFixStartDate("2026-11-14", true, "2026-11-13"),
    ],
    [true, false, false],
  );
});

test("the tracker leaves out Reference Habits and One-offs", () => {
  assert.equal(inTracker(makeHabit()), true);
  assert.equal(inTracker(portage), false);
  assert.equal(inTracker(makeHabit({ target: { type: "none", count: 7, days: [] } })), false);
});

test("dueDateLabel names the weekday, day and month", () => {
  assert.equal(dueDateLabel("2026-11-14"), "Sat 14 Nov");
  assert.equal(dueDateLabel("2027-01-01"), "Fri 1 Jan");
});

test("a One-off's schedule names its date", () => {
  assert.equal(scheduleLabel(portage), "Once, Sat 14 Nov");
  assert.equal(scheduleLabel({ ...portage, record: "count" }), "Once, Sat 14 Nov, counted");
  assert.equal(targetWhen(portage.target), "once");
  assert.equal(scheduleSummary(portage), "Once, Sat 14 Nov");
});

test("a One-off draft with no date yet asks for one", () => {
  assert.equal(scheduleSummary({ ...portage, startDate: "" }), "Once, pick a date");
});

const outside = {
  from: "2026-11-07",
  to: "2026-11-14",
  cause: "outside",
  note: "Rain",
  createdAt: "2026-11-07T18:00:00Z",
};

test("Reschedules parse per Habit, earliest first, as GET /api/habits sends them", () => {
  const body = {
    portage: [
      outside,
      { ...outside, from: "2026-11-14", to: "2026-11-21", cause: "avoidance", note: "" },
    ],
  };

  assert.deepEqual(Reschedules.parse(body), body);
});

test("a Reschedule refuses an unknown cause", () => {
  assert.equal(Reschedule.safeParse({ ...outside, cause: "weather" }).success, false);
});
