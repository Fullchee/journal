import assert from "node:assert/strict";
import { torontoDate } from "./helpers/toronto";
import { shiftDay, torontoDay } from "@/core/calendar";
import {
  LEVELS,
  feelingsFor,
  weekdayOf,
  withPast,
  zoneOf,
  chartData,
  signalPeriods,
  checkInsWithin,
  hasNextDay,
  pagesFor,
  periodLabel,
  periodStep,
  shiftPeriod,
  blankCheckIn,
  doingSpan,
  draftOf,
  listOf,
  patchForFields,
  type CheckIn,
  checkInRows,
  byDay,
  checkInWindow,
  whenOf,
} from "@/core/check-in-view";

test("the ladder lists scores 8 down to 1, each with its zone and half", () => {
  assert.deepEqual(
    LEVELS.map((l) => [l.score, l.zone, l.half]),
    [
      [8, "Sun", "upper"],
      [7, "Sun", "lower"],
      [6, "Cloud", "upper"],
      [5, "Cloud", "lower"],
      [4, "Rain", "upper"],
      [3, "Rain", "lower"],
      [2, "Storm", "upper"],
      [1, "Storm", "lower"],
    ],
  );
});

test("zoneOf rejects a score outside 1-8", () => {
  assert.throws(() => zoneOf(0), RangeError);
  assert.throws(() => zoneOf(9), RangeError);
});

const LOCAL_NOW = torontoDate(2026, 10, 4, 15);

// Every Check-in in these tests is at 9 AM.
const at = (day: number, score: number) => ({
  score,
  note: "",
  checkedInAt: torontoDate(2026, 10, day, 9).toISOString(),
});

test("chart axis spans the last 7 local days with one weekday tick per day", () => {
  const { min, max, ticks } = chartData([], 7, LOCAL_NOW);
  assert.equal(min, torontoDate(2026, 9, 29).getTime());
  assert.equal(max, torontoDate(2026, 10, 5).getTime());
  assert.deepEqual(
    ticks.map((t) => t.label),
    ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"],
  );
});

test("chart points are in time order and drop check-ins older than the week", () => {
  const { points } = chartData(
    [
      at(4, 8),
      at(2, 1),
      { score: 5, note: "", checkedInAt: torontoDate(2026, 9, 28, 9).toISOString() },
    ],
    7,
    LOCAL_NOW,
  );

  assert.deepEqual(
    points.map((p) => p.y),
    [1, 8],
  );
  const [first, second] = points;
  assert.ok(first && second && first.x < second.x);
});

test("ranges longer than a week show at most 6 date ticks, starting on the first day", () => {
  const { ticks } = chartData([], 150, LOCAL_NOW);
  assert.ok(ticks.length <= 6);
  assert.equal(ticks[0]?.label, "Jun 8");
});

test("a 30-day range drops older check-ins", () => {
  const old = { score: 5, note: "", checkedInAt: torontoDate(2026, 8, 1).toISOString() };
  assert.equal(chartData([old, at(3, 6)], 30, LOCAL_NOW).points.length, 1);
});

test("all-time range starts at the first check-in's day and keeps every point in order", () => {
  const { min, max, points } = chartData(
    [at(4, 8), { score: 2, note: "", checkedInAt: torontoDate(2026, 8, 1, 9).toISOString() }],
    "all",
    LOCAL_NOW,
  );

  assert.equal(min, torontoDate(2026, 8, 1).getTime());
  assert.equal(max, torontoDate(2026, 10, 5).getTime());
  assert.deepEqual(
    points.map((p) => p.y),
    [2, 8],
  );
});

test("all-time range with no check-ins covers just today", () => {
  const { min, ticks } = chartData([], "all", LOCAL_NOW);
  assert.equal(min, torontoDate(2026, 10, 4).getTime());
  assert.deepEqual(
    ticks.map((t) => t.label),
    ["Wed"],
  );
});

test("weekend bands cover each Saturday and Sunday in range", () => {
  const { weekends } = chartData([], 7, LOCAL_NOW);
  assert.deepEqual(weekends, [
    { from: torontoDate(2026, 9, 31).getTime(), to: torontoDate(2026, 10, 1).getTime() },
    { from: torontoDate(2026, 10, 1).getTime(), to: torontoDate(2026, 10, 2).getTime() },
  ]);
});

test("feelings: none until both axes are picked", () => {
  assert.deepEqual(feelingsFor("", ""), []);
  assert.deepEqual(feelingsFor("Pleasant", ""), []);
  assert.deepEqual(feelingsFor("", "Low"), []);
});

test("feelings: both axes pick one quadrant", () => {
  const words = feelingsFor("Unpleasant", "High");
  assert.ok(words.includes("Anxious") && words.includes("Angry"));
  assert.ok(!words.includes("Sad") && !words.includes("Calm"));
});

const card = (id: number, day: number) => ({
  id,
  zone: "Rain",
  score: 3,
  checkedInAt: torontoDate(2026, 10, day, 12),
});

test("checkInsWithin drops check-ins older than the range", () => {
  const list = [card(1, 4), card(2, 1)];

  assert.deepEqual(
    checkInsWithin(list, 3, LOCAL_NOW).map((c) => c.id),
    [1],
  );
  assert.equal(checkInsWithin(list, "all", LOCAL_NOW).length, 2);
});

test("checkInsWithin a past period drops check-ins after its last day", () => {
  const list = [card(1, 5), card(2, 4), card(3, 3), card(4, 1)];

  assert.deepEqual(
    checkInsWithin(list, 2, LOCAL_NOW).map((c) => c.id),
    [2, 3],
  );
});

test("checkInsWithin a day keeps only that local day, dropping later days too", () => {
  const list = [card(1, 5), card(2, 4), card(3, 3)];

  assert.deepEqual(
    checkInsWithin(list, "day", LOCAL_NOW).map((c) => c.id),
    [2],
  );
});

test("a day range spans one local day with an hour tick every 3 hours", () => {
  const { min, max, ticks } = chartData([], "day", LOCAL_NOW);

  assert.equal(min, torontoDate(2026, 10, 4).getTime());
  assert.equal(max, torontoDate(2026, 10, 5).getTime());
  assert.deepEqual(
    ticks.map((t) => [t.value, t.label]),
    ["12 AM", "3 AM", "6 AM", "9 AM", "12 PM", "3 PM", "6 PM", "9 PM"].map((label, i) => [
      torontoDate(2026, 10, 4, i * 3).getTime(),
      label,
    ]),
  );
});

test("a day range charts only that day's check-ins", () => {
  const { points } = chartData([at(3, 2), at(4, 6), at(5, 8)], "day", LOCAL_NOW);

  assert.deepEqual(
    points.map((p) => p.y),
    [6],
  );
});

test("periodStep moves Day one day and other ranges their own length", () => {
  assert.deepEqual([periodStep("day"), periodStep(7), periodStep(90)], [1, 7, 90]);
});

test("shiftPeriod and checkInsWithin read the current date by default", () => {
  const today = torontoDay(new Date());

  assert.equal(shiftPeriod(today, 7), today);
  assert.deepEqual(checkInsWithin([{ checkedInAt: new Date() }], "day").length, 1);
  assert.equal(checkInsWithin([{ checkedInAt: new Date() }], 7).length, 1);
});

test("chartData defaults to the last 7 days ending today", () => {
  assert.equal(chartData([]).ticks.length, 7);
});

test("pagesFor counts the two-week pages back to a Check-in", () => {
  const [newest, oldest, far] = [card(1, 4), card(2, 1), card(3, 28)];

  assert.equal(pagesFor([], oldest), 1);
  assert.equal(pagesFor([newest, oldest], newest), 1);
  assert.equal(pagesFor([newest, oldest], oldest), 1);
  assert.equal(pagesFor([far, oldest], oldest), 2);
});

test("shiftPeriod steps a whole period back", () => {
  assert.equal(shiftPeriod("2026-11-04", -7, LOCAL_NOW), "2026-10-28");
});

test("shiftPeriod never ends a period after today", () => {
  assert.equal(shiftPeriod("2026-11-01", 7, LOCAL_NOW), "2026-11-04");
});

test("periodLabel names a period's first and last day", () => {
  assert.equal(periodLabel("2026-11-04", 7), "Oct 29 – Nov 4");
});

test("hasNextDay allows stepping forward only before today", () => {
  assert.deepEqual(
    ["2026-11-03", "2026-11-04", "2026-11-05"].map((day) => hasNextDay(day, LOCAL_NOW)),
    [true, false, false],
  );
});

test("hasNextDay reads the current date, so yesterday unlocks after midnight", () => {
  const yesterday = shiftDay(torontoDay(new Date()), -1);

  assert.ok(hasNextDay(yesterday));
});

test("the Tense, Low and Tired series skip unanswered and out-of-range check-ins", () => {
  const old = {
    score: 5,
    checkedInAt: torontoDate(2026, 8, 1).toISOString(),
    tense: 2,
    low: 2,
    tired: 2,
  };

  const { tense, low, tired } = chartData(
    [{ ...at(3, 6), tense: 2, low: null }, { ...at(4, 6), tense: null, low: 1, tired: 0 }, old],
    7,
    LOCAL_NOW,
  );

  assert.deepEqual(
    [tense, low, tired].map((series) => series.map((p) => p.y)),
    [[2], [1], [0]],
  );
});

const bare = (overrides: Partial<CheckIn> = {}): CheckIn => ({
  ...blankCheckIn(3, torontoDate(2026, 10, 3, 14, 30).toISOString()),
  id: 1,
  ...overrides,
});

const CARD = bare({ note: "rough", place: "Work", tense: 2, thought: "Sad, Tired" });

test("draftOf fills missing details and shows the time as local wall-clock", () => {
  const draft = draftOf(CARD);
  assert.equal(draft.when, "2026-11-03T14:30");
  assert.deepEqual([draft.place, draft.low, draft.feelings], ["Work", null, ["Sad", "Tired"]]);
});

test("draftOf pads the hour and minute", () => {
  const early = bare({ checkedInAt: torontoDate(2026, 0, 5, 9, 7).toISOString() });
  assert.equal(draftOf(early).when, "2026-01-05T09:07");
});

test("listOf splits the joined string and treats empty as none", () => {
  assert.deepEqual(listOf("Sad, Tired"), ["Sad", "Tired"]);
  assert.deepEqual(listOf(""), []);
});

test("an edited field sends only itself", () => {
  const draft = { ...draftOf(CARD), place: "Home", note: "x" };
  assert.deepEqual(patchForFields(["place"], CARD, draft), { place: "Home" });
  assert.deepEqual(patchForFields(["note"], CARD, draft), {
    inControl: null,
    parts: [],
    note: "x",
  });
  assert.deepEqual(patchForFields(["feelings"], CARD, { ...draft, feelings: ["Calm", "Safe"] }), {
    thought: "Calm, Safe",
    pleasantness: null,
    feelingEnergy: null,
  });
});

test("the How I felt quadrant saves with the feelings and loads back into the draft", () => {
  const draft = { ...draftOf(CARD), pleasantness: "Unpleasant", feelingEnergy: "Low" } as const;
  const patch = patchForFields(["feelings"], CARD, draft);

  assert.deepEqual(patch, {
    thought: "Sad, Tired",
    pleasantness: "Unpleasant",
    feelingEnergy: "Low",
  });

  const loaded = draftOf({ ...CARD, ...patch });

  assert.deepEqual([loaded.pleasantness, loaded.feelingEnergy], ["Unpleasant", "Low"]);
});

test("each mood row sends only itself, and a cleared row sends null", () => {
  const draft = draftOf(CARD);

  assert.deepEqual(patchForFields(["tired"], CARD, { ...draft, tired: 1 }), { tired: 1 });
  assert.deepEqual(patchForFields(["tense"], CARD, { ...draft, tense: null }), {
    tense: null,
  });
});

test("an edited zone sends only the score; the server derives the zone", () => {
  assert.deepEqual(patchForFields(["zone"], CARD, { ...draftOf(CARD), score: 8 }), { score: 8 });
});

test("an edited time sends an ISO time", () => {
  const moved = patchForFields(["time"], CARD, { ...draftOf(CARD), when: "2026-11-04T09:00" });
  assert.equal(moved.checkedInAt, torontoDate(2026, 10, 4, 9, 0).toISOString());
});

test.each([
  { id: "both cleared", when: "" },
  { id: "date cleared", when: "T09:07" },
  { id: "time cleared", when: "2026-11-04T" },
])("a cleared time keeps the saved one: $id", ({ when }) => {
  assert.deepEqual(patchForFields(["time"], CARD, { ...draftOf(CARD), when }), {});
});

const night = (date: string, sleepStart: string, sleepEnd: string) => ({
  date,
  sleepStart,
  sleepEnd,
});

test("a night's sleep bar runs from bedtime to wake, in minutes past 18:00", () => {
  const { sleep } = chartData([], 7, LOCAL_NOW, [
    night("2026-11-03", "2026-11-02T22:13", "2026-11-03T06:00"),
  ]);

  assert.deepEqual(
    sleep.map((p) => [p.from, p.to]),
    [[253, 720]],
  );
});

test("a bedtime after midnight still sits above its wake time", () => {
  const { sleep } = chartData([], 7, LOCAL_NOW, [
    night("2026-11-03", "2026-11-03T01:30", "2026-11-03T09:00"),
  ]);

  assert.deepEqual(
    sleep.map((p) => [p.from, p.to]),
    [[450, 900]],
  );
});

test("a night missing its start or end draws no bar", () => {
  const { sleep } = chartData([], 7, LOCAL_NOW, [
    night("2026-11-02", "2026-11-01T23:00", ""),
    night("2026-11-03", "", "2026-11-03T07:00"),
  ]);

  assert.deepEqual(sleep, []);
});

test("sleep bars plot at wake time and drop nights outside the range", () => {
  const { sleep } = chartData([], 7, LOCAL_NOW, [
    night("2026-11-03", "2026-11-02T23:00", "2026-11-03T07:00"),
    night("2026-09-01", "2026-08-31T23:00", "2026-09-01T07:00"),
  ]);

  assert.deepEqual(
    sleep.map((p) => p.to),
    [780],
  );
});

test("withPast adds typed values after the defaults, most used first", () => {
  assert.deepEqual(
    withPast(["Home", "Work"], ["Cafe", "Home", "Park", "Park", "", null, " Park "]),
    ["Home", "Work", "Park", "Cafe"],
  );
});

test("withPast merges spellings that differ only in case", () => {
  assert.deepEqual(withPast(["Home"], ["cafe", "Cafe", "Cafe", "home", "HOME"]), ["Home", "Cafe"]);
});

test("withPast shows a spelling used more, and the first one on a tie", () => {
  assert.deepEqual(withPast([], ["Cafe", "Cafe", "cafe"]), ["Cafe"]);
  assert.deepEqual(withPast([], ["cafe", "Cafe"]), ["cafe"]);
});

const BARE = bare({ id: 2, score: 5, zone: "Cloud" });

const FULL: CheckIn = { ...CARD, doing: "reading", low: 0, tired: 1 };

test("a Check-in with no details shows only its zone and offers every detail to add", () => {
  const { zone, rows, missing } = checkInRows(BARE);
  assert.equal(zone, "Cloud (5/8)");
  assert.deepEqual(rows, []);
  assert.deepEqual(missing, ["place", "doing", "feelings", "note", "tense", "low", "tired"]);
});

test("a fully filled Check-in shows every field, Tense, Low and Tired last, and has nothing to add", () => {
  const { rows, missing } = checkInRows(FULL);
  assert.deepEqual(rows.map((r) => [r.label, r.value]).slice(-3), [
    ["Tense", "A lot"],
    ["Low", "None"],
    ["Tired", "Some"],
  ]);
  assert.deepEqual(rows.map((r) => r.value).slice(0, 4), [
    "Work",
    "reading",
    "Sad, Tired",
    "rough",
  ]);
  assert.deepEqual(missing, []);
});

test("the zone row follows an edited score before the reload brings the saved zone", () => {
  assert.equal(checkInRows({ ...BARE, score: 8 }).zone, "Sun (8/8)");
});

test("a partly filled Check-in offers only its empty fields", () => {
  assert.deepEqual(checkInRows(CARD).missing, ["doing", "low", "tired"]);
});

const WOLF = { id: 1, name: "Worry wolf" };
const DOER = { id: 2, name: "Doer" };
const SKEPTIC = { id: 4, name: "Skeptic" };

test("who is in control and the parts present show as their own rows before the note", () => {
  const ifs = bare({ inControl: WOLF, parts: [DOER, SKEPTIC] });
  assert.deepEqual(
    checkInRows(ifs).rows.map((r) => [r.label, r.value]),
    [
      ["In control", "Worry wolf"],
      ["Present", "Doer, Skeptic"],
    ],
  );
});

test("the note is missing only while it, who is in control and the parts present are all empty", () => {
  assert.equal(checkInRows(bare({ parts: [DOER] })).missing.includes("note"), false);
  assert.equal(checkInRows(bare({ inControl: "Self" })).missing.includes("note"), false);
  assert.equal(checkInRows(bare()).missing.includes("note"), true);
});

test("Self in control shows as its own row", () => {
  assert.deepEqual(
    checkInRows(bare({ inControl: "Self" })).rows.map((r) => [r.label, r.value]),
    [["In control", "Self"]],
  );
});

test("draftOf keeps the Parts by reference and patchForFields sends them back", () => {
  const draft = draftOf(bare({ inControl: WOLF, parts: [DOER, SKEPTIC] }));
  assert.deepEqual([draft.inControl, draft.parts], [WOLF, [DOER, SKEPTIC]]);
  assert.deepEqual(patchForFields(["note"], BARE, { ...draftOf(BARE), parts: [DOER] }), {
    inControl: null,
    parts: [DOER],
    note: "",
  });
});

test("patchForFields sends only the fields the draft changed", () => {
  const draft = { ...draftOf(BARE), place: "Home", feelings: ["Calm"] };
  assert.deepEqual(patchForFields(["time", "place", "feelings", "note"], BARE, draft), {
    place: "Home",
    thought: "Calm",
    pleasantness: null,
    feelingEnergy: null,
  });
});

test("patchForFields sends a cleared detail but nothing for an untouched form", () => {
  assert.deepEqual(patchForFields(["place", "note"], CARD, { ...draftOf(CARD), note: "" }), {
    inControl: null,
    parts: [],
    note: "",
  });
  assert.deepEqual(patchForFields(["time", "zone", "feelings"], CARD, draftOf(CARD)), {});
});

test("byDay groups check-ins under their local day, newest day and time first", () => {
  const list = [
    { id: 1, score: 5, checkedInAt: torontoDate(2026, 10, 3, 9) },
    { id: 2, score: 5, checkedInAt: torontoDate(2026, 10, 4, 8) },
    { id: 3, score: 5, checkedInAt: torontoDate(2026, 10, 3, 21) },
  ];

  assert.deepEqual(
    byDay(list).map((d) => [d.day, d.checkIns.map((c) => c.id)]),
    [
      ["2026-11-04", [2]],
      ["2026-11-03", [3, 1]],
    ],
  );
});

test("byDay puts a check-in just after midnight under the new day", () => {
  const list = [
    { id: 1, score: 5, checkedInAt: torontoDate(2026, 10, 3, 23, 59).toISOString() },
    { id: 2, score: 5, checkedInAt: torontoDate(2026, 10, 4, 0, 1).toISOString() },
  ];

  assert.deepEqual(
    byDay(list).map((d) => [d.day, d.checkIns.map((c) => c.id)]),
    [
      ["2026-11-04", [2]],
      ["2026-11-03", [1]],
    ],
  );
});

test("checkInWindow shows two weeks per page and says when older ones remain", () => {
  // Day numbers count from November, so -9 is October 22: the first day of the two weeks up to the newest, November 4.
  const list = [card(1, 4), card(2, -9), card(3, -16)];

  const first = checkInWindow(list, 1);
  assert.deepEqual(
    first.shown.map((c) => c.id),
    [1, 2],
  );
  assert.equal(first.hasOlder, true);

  const second = checkInWindow(list, 2);
  assert.deepEqual(
    second.shown.map((c) => c.id),
    [1, 2, 3],
  );
  assert.equal(second.hasOlder, false);
});

test("checkInWindow counts the two weeks back from the newest Check-in, not from today", () => {
  const list = [card(1, -40), card(2, -60)];

  const first = checkInWindow(list, 1);
  assert.deepEqual(
    first.shown.map((c) => c.id),
    [1],
  );
  assert.equal(first.hasOlder, true);
});

test("checkInWindow shows nothing and no Show older for no Check-ins", () => {
  assert.deepEqual(checkInWindow([], 1), { shown: [], hasOlder: false });
});

test("weekdayOf names the day of a datetime-local value", () => {
  assert.equal(weekdayOf("2026-11-06T09:30"), "Friday");
});

test("weekdayOf names no day for a half-typed value", () => {
  assert.equal(weekdayOf(""), "");
});

const wake = (month: number, day: number) =>
  night(`2026-${month}-${day}`, "", torontoDate(2026, month - 1, day, 7).toISOString());

test("sleep periods split the nights at the chart's first day", () => {
  const nights = [wake(10, 29), wake(11, 1), wake(11, 2), wake(11, 3)];
  const { current, previous } = signalPeriods(nights, 3, chartData([], 3, LOCAL_NOW));

  assert.deepEqual(
    current.map((n) => n.date),
    ["2026-11-2", "2026-11-3"],
  );
  assert.deepEqual(
    previous.map((n) => n.date),
    ["2026-11-1"],
  );
});

test("all time has no period before it", () => {
  const { previous } = signalPeriods([wake(10, 1)], "all", chartData([], "all", LOCAL_NOW));

  assert.deepEqual(previous, []);
});

test("a night with an empty wake time falls in the period holding its date", () => {
  const { current } = signalPeriods(
    [night("2026-11-03", "2026-11-02T23:00", "")],
    3,
    chartData([], 3, LOCAL_NOW),
  );

  assert.deepEqual(
    current.map((n) => n.date),
    ["2026-11-03"],
  );
});

test("an activity day without a wake time falls in the period holding its date", () => {
  const days = [{ date: "2026-11-01" }, { date: "2026-11-02" }, { date: "2026-11-03" }];
  const { current, previous } = signalPeriods(days, 3, chartData([], 3, LOCAL_NOW));

  assert.deepEqual(
    current.map((d) => d.date),
    ["2026-11-02", "2026-11-03"],
  );
  assert.deepEqual(
    previous.map((d) => d.date),
    ["2026-11-01"],
  );
});

test("blankCheckIn takes its zone from the score and leaves every detail empty", () => {
  const blank = blankCheckIn(5, "2026-11-09T12:00:00.000Z");
  assert.equal(blank.zone, "Cloud");
  assert.deepEqual(checkInRows(blank).rows, []);
});

test("whenOf gives a padded local datetime-local value", () => {
  assert.equal(whenOf(torontoDate(2026, 0, 5, 9, 7)), "2026-01-05T09:07");
});

test("doingSpan logs the activity on the Check-in's Day from its start and end", () => {
  const draft = { ...draftOf(CARD), doingStart: "13:15", doingEnd: "14:00" };
  assert.deepEqual(doingSpan(draft), { date: "2026-11-03", start_time: "13:15", minutes: 45 });
});

test("doingSpan runs an end before the start past midnight", () => {
  const draft = { ...draftOf(CARD), doingStart: "23:30", doingEnd: "00:15" };
  assert.equal(doingSpan(draft).minutes, 45);
});

test("doingSpan says nothing without both times or with no length", () => {
  assert.deepEqual(doingSpan({ ...draftOf(CARD), doingStart: "13:15" }), {});
  assert.deepEqual(doingSpan({ ...draftOf(CARD), doingStart: "13:15", doingEnd: "13:15" }), {});
});
