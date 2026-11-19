import assert from "node:assert/strict";
import { blankCheckIn, type CheckIn } from "@/core/check-in-view";
import {
  dayLabel,
  draftMarkdown,
  groupByDay,
  hasEntries,
  isoWeekOf,
  isWeek,
  lastFullWeek,
  parseWeeklyProse,
  shiftWeek,
  weekDays,
  weekLabel,
  CLOSING_QUESTION,
  type WeekDay,
  type WeeklyGoal,
} from "@/core/weekly-review";
import type { WorkoutRow } from "@/core/workout-summary";

const checkIn = (checkedInAt: string, extra: Partial<CheckIn> = {}): CheckIn => ({
  ...blankCheckIn(3, checkedInAt),
  id: 1,
  ...extra,
});

const EMPTY = { checkIns: [], sleep: [], habitsDone: [], activity: [], workouts: [] };

const workout = (activityId: number, date: string): WorkoutRow => ({
  activityId,
  date,
  startLocal: `${date} 07:00:00`,
  typeKey: "cycling",
  name: "Ride",
  durationS: 2700,
  distanceM: null,
  avgHr: null,
  calories: null,
});

const GOALS: WeeklyGoal[] = [
  { title: "Move every day", why: "Energy for the kids", habits: ["Walk"] },
  { title: "Sleep", why: "", habits: [] },
];

describe("isoWeekOf", () => {
  it.each([
    ["2026-11-02", "2026-W45"],
    ["2026-11-08", "2026-W45"],
    ["2025-12-29", "2026-W01"],
    ["2026-12-31", "2026-W53"],
    ["2027-01-03", "2026-W53"],
    ["2027-01-04", "2027-W01"],
  ])("puts %s in %s", (day, week) => {
    assert.equal(isoWeekOf(day), week);
  });
});

describe("weekDays", () => {
  it("lists Monday to Sunday", () => {
    assert.deepEqual(weekDays("2026-W45"), [
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
  });

  it("starts W01 in December when the year starts late in the week", () => {
    assert.equal(weekDays("2026-W01")[0], "2025-12-29");
  });

  it("runs W53 across the new year", () => {
    assert.deepEqual(
      [weekDays("2026-W53")[0], weekDays("2026-W53")[6]],
      ["2026-12-28", "2027-01-03"],
    );
  });
});

describe("isWeek", () => {
  it.each(["2026-W45", "2026-W01", "2026-W53"])("accepts %s", (week) => {
    assert.equal(isWeek(week), true);
  });

  it.each(["2027-W53", "2026-W00", "2026-W54", "2026-45", "soon", "2026-W5"])(
    "rejects %s",
    (week) => {
      assert.equal(isWeek(week), false);
    },
  );
});

describe("lastFullWeek", () => {
  it("is the week just ended at 00:30 on a Toronto Monday", () => {
    assert.equal(lastFullWeek(new Date("2026-11-09T05:30:00Z")), "2026-W45");
  });

  it("is still the week before at 23:30 on a Toronto Sunday, already Monday in UTC", () => {
    assert.equal(lastFullWeek(new Date("2026-11-09T04:30:00Z")), "2026-W44");
  });
});

describe("shiftWeek", () => {
  it.each([
    ["2026-W45", 1, "2026-W46"],
    ["2026-W45", -1, "2026-W44"],
    ["2026-W53", 1, "2027-W01"],
    ["2026-W01", -1, "2025-W52"],
  ] as const)("moves %s by %i to %s", (week, by, shifted) => {
    assert.equal(shiftWeek(week, by), shifted);
  });
});

describe("labels", () => {
  it("names a week by its dates", () => {
    assert.equal(weekLabel("2026-W45"), "2026-W45 · Nov 2–8");
  });

  it("names both months when a week crosses one", () => {
    assert.equal(weekLabel("2026-W44"), "2026-W44 · Oct 26–Nov 1");
  });

  it("names a day by its weekday", () => {
    assert.equal(dayLabel("2026-11-08"), "Sun Nov 8");
  });
});

describe("groupByDay", () => {
  it("keeps a 23:30 Sunday Check-in in the week and moves a 00:30 Monday one out", () => {
    const days = groupByDay("2026-W45", {
      ...EMPTY,
      checkIns: [
        checkIn("2026-11-09T04:30:00Z", { note: "late Sunday" }),
        checkIn("2026-11-09T05:30:00Z", { note: "Monday" }),
      ],
    });

    assert.deepEqual(
      days.flatMap((d) => d.checkIns.map((c) => [d.day, c.time, c.note])),
      [["2026-11-08", "11:30 PM", "late Sunday"]],
    );
  });

  it("puts sleep, activity and habits under their day and drops other weeks", () => {
    const days = groupByDay("2026-W45", {
      checkIns: [],
      workouts: [],
      sleep: [
        { date: "2026-11-03", durationMin: 420, sleepScore: 80 },
        { date: "2026-11-10", durationMin: 300, sleepScore: 50 },
      ],
      activity: [
        {
          date: "2026-11-03",
          steps: 9000,
          moderateMin: null,
          vigorousMin: null,
          restingHr: null,
          avgStress: 30,
        },
      ],
      habitsDone: [
        { date: "2026-11-03", name: "Walk" },
        { date: "2026-11-01", name: "Gym" },
      ],
    });

    const tuesday = days.find((d) => d.day === "2026-11-03");

    assert.equal(days.length, 7);
    assert.equal(tuesday?.sleep?.durationMin, 420);
    assert.equal(tuesday.activity?.steps, 9000);
    assert.deepEqual(tuesday.habits, ["Walk"]);
    assert.equal(days.filter((d) => d.sleep !== null).length, 1);
    assert.equal(days.flatMap((d) => d.habits).length, 1);
  });

  it("puts each workout under the day it started", () => {
    const days = groupByDay("2026-W45", {
      ...EMPTY,
      workouts: [workout(1, "2026-11-03"), workout(2, "2026-11-03"), workout(3, "2026-11-10")],
    });

    assert.deepEqual(
      days.flatMap((d) => d.workouts.map((w) => [d.day, w.activityId])),
      [
        ["2026-11-03", 1],
        ["2026-11-03", 2],
      ],
    );
  });

  it("lists Check-ins oldest first", () => {
    const days = groupByDay("2026-W45", {
      ...EMPTY,
      checkIns: [
        checkIn("2026-11-02T20:00:00Z", { note: "b" }),
        checkIn("2026-11-02T14:00:00Z", { note: "a" }),
      ],
    });

    assert.deepEqual(
      days[0]?.checkIns.map((c) => c.note),
      ["a", "b"],
    );
  });
});

const weekWith = (input: Partial<Parameters<typeof groupByDay>[1]> = {}): WeekDay[] =>
  groupByDay("2026-W45", { ...EMPTY, ...input });

// A section is its heading and the paragraph under it.
function sectionOf(markdown: string, heading: string) {
  const paragraphs = markdown.split("\n\n");
  const at = paragraphs.indexOf(`## ${heading}`);

  return at === -1 ? "" : `${paragraphs[at]}\n\n${paragraphs[at + 1] ?? ""}`;
}

// 2026-11-02 is the Monday of 2026-W45.
const monday = (input: Partial<Parameters<typeof groupByDay>[1]> = {}) => {
  const [day] = weekWith(input);

  assert.ok(day);

  return day;
};

describe("hasEntries", () => {
  it("is false for a day with nothing logged", () => {
    assert.equal(hasEntries(monday()), false);
  });

  it("is true for a day with only a Habit done", () => {
    assert.equal(hasEntries(monday({ habitsDone: [{ date: "2026-11-02", name: "Walk" }] })), true);
  });

  it("is true for a day with only a workout", () => {
    const workouts = [workout(1, "2026-11-02")];

    assert.equal(hasEntries(monday({ workouts })), true);
  });

  it("is true for a day with only sleep", () => {
    assert.equal(
      hasEntries(monday({ sleep: [{ date: "2026-11-02", durationMin: 420, sleepScore: null }] })),
      true,
    );
  });
});

describe("draftMarkdown", () => {
  it("writes one Directions bullet per active Goal with its felt why", () => {
    const draft = draftMarkdown({ days: weekWith(), goals: GOALS }, null);

    assert.equal(
      sectionOf(draft, "Directions").trim(),
      "## Directions\n\n- **Move every day**: Energy for the kids\n- **Sleep**",
    );
  });

  it("adds the model's movement, ignoring invented Goals and keeping omitted ones", () => {
    const draft = draftMarkdown(
      { days: weekWith(), goals: GOALS },
      {
        summary: "A steady week.",
        directions: [
          { goal: "move every day ", movement: "walked four\nmornings" },
          { goal: "Learn Rust", movement: "started" },
        ],
      },
    );

    const bullets = sectionOf(draft, "Directions")
      .split("\n")
      .filter((line) => line.startsWith("- "));

    assert.deepEqual(bullets, [
      "- **Move every day**: Energy for the kids; walked four mornings",
      "- **Sleep**",
    ]);
    assert.match(draft, /^A steady week\.$/m);
  });

  it("keeps a model clause that scores the week", () => {
    const draft = draftMarkdown(
      { days: weekWith(), goals: GOALS },
      {
        summary: "I'd rate this week 7/10.",
        directions: [{ goal: "Sleep", movement: "a solid B grade" }],
      },
    );

    assert.match(draft, /^I'd rate this week 7\/10\.$/m);
    assert.match(draft, /^- \*\*Sleep\*\*.*; a solid B grade$/m);
  });

  it("writes a signal line only for a signal with data", () => {
    const sleepOnly = draftMarkdown(
      {
        days: weekWith({
          sleep: [
            { date: "2026-11-03", durationMin: 420, sleepScore: 80 },
            { date: "2026-11-04", durationMin: 450, sleepScore: null },
          ],
        }),
        goals: [],
      },
      null,
    );

    assert.equal(
      sectionOf(sleepOnly, "Signals").trim(),
      "## Signals\n\n- Sleep: 2 nights, average 7h 15m",
    );

    const activityOnly = draftMarkdown(
      {
        days: weekWith({
          activity: [
            {
              date: "2026-11-03",
              steps: 8000,
              moderateMin: null,
              vigorousMin: null,
              restingHr: null,
              avgStress: null,
            },
            {
              date: "2026-11-04",
              steps: 10_001,
              moderateMin: null,
              vigorousMin: null,
              restingHr: null,
              avgStress: null,
            },
          ],
        }),
        goals: [],
      },
      null,
    );

    assert.equal(
      sectionOf(activityOnly, "Signals").trim(),
      "## Signals\n\n- Activity: average 9,001 steps",
    );
  });

  it("averages stress over the days that measured it", () => {
    const draft = draftMarkdown(
      {
        days: weekWith({
          activity: [
            {
              date: "2026-11-03",
              steps: 100,
              moderateMin: null,
              vigorousMin: null,
              restingHr: null,
              avgStress: 30,
            },
            {
              date: "2026-11-04",
              steps: 100,
              moderateMin: null,
              vigorousMin: null,
              restingHr: null,
              avgStress: null,
            },
          ],
        }),
        goals: [],
      },
      null,
    );

    assert.match(draft, /- Activity: average 100 steps, average stress 30/);
  });

  it("counts the week's Tense, Low and Tired among the signals", () => {
    const draft = draftMarkdown(
      { days: weekWith({ checkIns: [checkIn("2026-11-03T14:00:00Z", { low: 1 })] }), goals: [] },
      null,
    );

    assert.equal(
      sectionOf(draft, "Signals").trim(),
      "## Signals\n\n- Zones: Rain on 1 of 1 Check-in\n- Low: Some on 1 of 1 Check-in",
    );
  });

  it("counts the week's Check-ins by zone, Sun first, leaving out empty zones", () => {
    const draft = draftMarkdown(
      {
        days: weekWith({
          checkIns: [
            checkIn("2026-11-03T14:00:00Z", { zone: "Storm" }),
            checkIn("2026-11-04T14:00:00Z", { zone: "Sun" }),
            checkIn("2026-11-05T14:00:00Z", { zone: "Cloud" }),
            checkIn("2026-11-06T14:00:00Z", { zone: "Sun" }),
          ],
        }),
        goals: [],
      },
      null,
    );

    assert.match(draft, /^- Zones: Sun on 2, Cloud on 1, Storm on 1 of 4 Check-ins$/m);
  });

  it("lists each Habit done with its Days, most first and ties by name", () => {
    const habitsDone = [
      { date: "2026-11-02", name: "Walk" },
      { date: "2026-11-03", name: "Walk" },
      { date: "2026-11-04", name: "Walk" },
      { date: "2026-11-03", name: "Stretch" },
      { date: "2026-11-06", name: "Bike" },
      { date: "2026-11-02", name: "Read" },
      { date: "2026-11-05", name: "Read" },
    ];

    const draft = draftMarkdown(
      { days: weekWith({ habitsDone }), goals: [] },
      { summary: "Steady.", directions: [] },
    );

    assert.equal(
      sectionOf(draft, "Habits").trim(),
      "## Habits\n\n- Walk: 3 days\n- Read: 2 days\n- Bike: 1 day\n- Stretch: 1 day",
    );
    assert.ok(draft.indexOf("## Habits") < draft.indexOf("Steady."));
  });

  it("puts Habits after Signals", () => {
    const draft = draftMarkdown(
      {
        days: weekWith({
          checkIns: [checkIn("2026-11-03T14:00:00Z")],
          habitsDone: [{ date: "2026-11-03", name: "Walk" }],
        }),
        goals: [],
      },
      null,
    );

    assert.ok(draft.indexOf("## Signals") < draft.indexOf("## Habits"));
  });

  it("leaves out Habits when no Habit was done", () => {
    const draft = draftMarkdown(
      { days: weekWith({ checkIns: [checkIn("2026-11-03T14:00:00Z")] }), goals: [] },
      null,
    );

    assert.doesNotMatch(draft, /Habits/);
  });

  it("leaves out Signals when no signal has data", () => {
    assert.doesNotMatch(
      draftMarkdown({ days: weekWith(), goals: GOALS }, null),
      /Signals|Sleep:|Activity:/,
    );
  });

  it("is a skeleton ending in the closing question when there is no prose", () => {
    const draft = draftMarkdown({ days: weekWith(), goals: [] }, null);

    assert.equal(draft, `## Directions\n\nNo active Goals.\n\n${CLOSING_QUESTION}\n`);
  });

  it("always ends with the closing question", () => {
    const draft = draftMarkdown(
      {
        days: weekWith({ sleep: [{ date: "2026-11-03", durationMin: 60, sleepScore: 10 }] }),
        goals: GOALS,
      },
      { summary: "Quiet.", directions: [] },
    );

    assert.ok(draft.trimEnd().endsWith(CLOSING_QUESTION));
    assert.equal(CLOSING_QUESTION, "Anything this week the Check-ins didn't capture?");
  });
});

describe("parseWeeklyProse", () => {
  it("reads the JSON shape inside a code fence", () => {
    assert.deepEqual(
      parseWeeklyProse('```json\n{"summary":"s","directions":[{"goal":"g","movement":"m"}]}\n```'),
      {
        summary: "s",
        directions: [{ goal: "g", movement: "m" }],
      },
    );
  });

  it.each([undefined, "no json", '{"summary":"s"}', '{"summary":"s","directions":[{"goal":1}]}'])(
    "rejects %s",
    (reply) => {
      assert.equal(parseWeeklyProse(reply), null);
    },
  );
});
