import assert from "node:assert/strict";
import {
  ALARM_KINDS,
  checkDraft,
  CUE_TYPES,
  KINDS,
  PRIORITIES,
  RECORD_STYLES,
  TARGET_TYPES,
  torontoDay,
  type DraftProblem,
  HabitChange,
} from "@/core";

const GARDEN = {
  name: "Scrolling on the laptop",
  kind: "bad",
  record: "check",
  description: "Most nights, on the couch.",
  startDate: "2026-11-01",
  cueType: "action",
  target: { type: "weekly", count: 2, days: [] },
} satisfies HabitChange;

const RUN = { ...GARDEN, name: "Run 5 km", kind: "good", target: { type: "daily" } } as const;

const drafted = (change: Parameters<typeof checkDraft>[0]) => {
  const { draft, problem } = checkDraft(change);
  assert.ok(draft, `refused: ${String(problem)}`);

  return draft;
};

const problemOf = (change: HabitChange) => checkDraft(change).problem;

const PROBLEMS: [string, HabitChange, DraftProblem][] = [
  ["blank_name", { ...GARDEN, name: " " }, "name"],
  ["name_too_long", { ...GARDEN, name: "x".repeat(201) }, "name"],
  ["bad_start_date", { name: "X", startDate: "last week" }, "startDate"],
  ["goal_not_positive", { ...GARDEN, goals: [0] }, "fields"],
  ["stacked_after_bad_id", { name: "X", stackedAfter: "Up Now!" }, "fields"],
  ["stacked_without_habit", { name: "X", cueType: "stacked" }, "stacked"],
  [
    "typed_cue_with_stacked_habit",
    { name: "X", cueType: "time", stackedAfter: "sit" },
    "stackedAfter",
  ],
  ["time_cue_without_time", { name: "X", cueType: "time" }, "time"],
  [
    "days_without_weekdays",
    { ...GARDEN, target: { type: "days", count: 1, days: [] } },
    "weekdays",
  ],
  ["days_bad_weekday", { ...GARDEN, target: { type: "days", count: 7, days: [7] } }, "weekdays"],
  [
    "days_fractional_weekday",
    { ...GARDEN, target: { type: "days", count: 7, days: [1.5] } },
    "weekdays",
  ],
  ["once_without_date", { ...GARDEN, startDate: "", target: { type: "once" } }, "startDate"],
  ["weekly_count_zero", { ...GARDEN, target: { type: "weekly", count: 0, days: [] } }, "count"],
  ["weekly_count_eight", { ...GARDEN, target: { type: "weekly", count: 8, days: [] } }, "count"],
  [
    "weekly_count_fractional",
    { ...GARDEN, target: { type: "weekly", count: 1.5, days: [] } },
    "count",
  ],
  ["monthly_count_32", { ...GARDEN, target: { type: "monthly", count: 32, days: [] } }, "count"],
  [
    "interval_without_date",
    { ...GARDEN, startDate: "", target: { type: "interval", count: 3 } },
    "startDate",
  ],
  ["interval_every_day", { ...GARDEN, target: { type: "interval", count: 1, days: [] } }, "count"],
  ["interval_count_31", { ...GARDEN, target: { type: "interval", count: 31, days: [] } }, "count"],
  ["usual_when_free_text", { ...GARDEN, usualWhen: "evening" }, "time"],
  ["usual_when_twelve_hour", { ...GARDEN, usualWhen: "7:45 a.m." }, "time"],
  ["usual_when_bad_hour", { ...GARDEN, usualWhen: "24:00" }, "time"],
  ["alarm_bad_time", { ...GARDEN, alarm: { time: "24:00", kind: "alarm" } }, "time"],
  [
    "season_ends_before_it_starts",
    { ...GARDEN, seasons: [{ start: "2026-05-03", end: "2026-05-02" }] },
    "seasons",
  ],
  ["season_bad_date", { ...GARDEN, seasons: [{ start: "May 3", end: null }] }, "seasons"],
  ["season_quiet_bad_date", { ...GARDEN, seasonQuietUntil: "soon" }, "fields"],
  ["tiny_version_too_long", { ...GARDEN, tinyVersion: "x".repeat(201) }, "tinyVersion"],
  [
    "too_many_places",
    { ...GARDEN, places: Array.from({ length: 21 }, (_, i) => `Place ${String(i)}`) },
    "places",
  ],
  ["place_too_long", { ...GARDEN, places: ["x".repeat(201)] }, "places"],
  ["duration_without_minutes", { ...GARDEN, record: "duration" }, "targetMinutes"],
  ["duration_zero_minutes", { ...GARDEN, record: "duration", targetMinutes: 0 }, "targetMinutes"],
  ["duration_over_a_day", { ...GARDEN, record: "duration", targetMinutes: 1441 }, "targetMinutes"],
  [
    "duration_fractional_minutes",
    { ...GARDEN, record: "duration", targetMinutes: 1.5 },
    "targetMinutes",
  ],
  [
    "opt_out_duration_without_usual_length",
    { ...RUN, record: "duration", targetMinutes: 30, optOutFrom: "2026-11-01", usualMinutes: null },
    "usualMinutes",
  ],
];

// A client sends JSON, so the Worker parses each change with HabitChange before checkDraft sees it.
const MALFORMED: [string, unknown][] = [
  ["bad_kind", { ...GARDEN, kind: "break" }],
  ["bad_kind_without_record", { name: "X", kind: "break" }],
  ["bad_priority", { ...GARDEN, priority: "urgent" }],
  ["bad_cue_type", { ...GARDEN, cueType: "smell" }],
  ["active_not_boolean", { ...GARDEN, active: "yes" }],
  ["goals_not_a_list", { ...GARDEN, goals: 1 }],
  ["alarm_bad_kind", { ...GARDEN, alarm: { time: "07:00", kind: "snooze" } }],
  ["alarm_not_an_object", { ...GARDEN, alarm: "07:00" }],
  ["tiny_version_not_a_string", { ...GARDEN, tinyVersion: 3 }],
];

test.each(MALFORMED)("HabitChange refuses %s", (_id, json) => {
  assert.equal(HabitChange.safeParse(json).success, false);
});

test.each(PROBLEMS)("checkDraft refuses %s", (_id, change, problem) => {
  assert.deepEqual(checkDraft(change), {
    draft: null,
    problem,
  });
});

test("a problem the form shows first wins over a later one", () => {
  assert.equal(problemOf({ name: "X", cueType: "time", record: "duration" }), "time");
  assert.equal(
    problemOf({ name: "X", target: { type: "weekly", count: 9 }, record: "duration" }),
    "count",
  );
  assert.equal(
    problemOf({ name: "X", record: "duration", startDate: "", target: { type: "once" } }),
    "targetMinutes",
  );
  assert.equal(
    problemOf({
      name: "X",
      startDate: "",
      target: { type: "interval", count: 3 },
      cueType: "stacked",
    }),
    "startDate",
  );
});

test("a One-off has no cue, so neither cue rule asks anything of it", () => {
  const once = { name: "Portage", target: { type: "once" } } as const;

  assert.equal(problemOf({ ...once, cueType: "stacked" }), null);
  assert.equal(problemOf({ ...once, cueType: "time" }), null);
  assert.equal(problemOf({ ...once, cueType: "action", stackedAfter: "sit" }), "stackedAfter");
});

test("a Scheduled cue takes its time from the usual when or the alarm", () => {
  assert.equal(problemOf({ name: "X", cueType: "time", usualWhen: "08:00" }), null);
  assert.equal(
    problemOf({ name: "X", cueType: "time", alarm: { time: "07:00", kind: "alarm" } }),
    null,
  );
});

test("an Opt-out duration Habit with its usual length checks out", () => {
  const draft = drafted({
    ...RUN,
    record: "duration",
    targetMinutes: 30,
    optOutFrom: "2026-11-01",
    usualMinutes: 25,
  });

  assert.deepEqual([draft.optOutFrom, draft.usualMinutes], ["2026-11-01", 25]);
});

test("a Habit that can't be Opt-out drops it and its usual length", () => {
  const draft = drafted({
    ...GARDEN,
    record: "duration",
    targetMinutes: 30,
    optOutFrom: "2026-11-01",
    usualMinutes: null,
  });

  assert.deepEqual([draft.optOutFrom, draft.usualMinutes], [null, null]);
});

test("an Opt-out Habit that isn't timed keeps no usual length", () => {
  const draft = drafted({ ...RUN, optOutFrom: "2026-11-01", usualMinutes: 25 });

  assert.deepEqual([draft.optOutFrom, draft.usualMinutes], ["2026-11-01", null]);
});

test("a Habit that isn't timed drops its minutes a day", () => {
  assert.equal(drafted({ ...GARDEN, record: "count", targetMinutes: 60 }).targetMinutes, null);
  assert.equal(drafted({ ...GARDEN, record: "duration", targetMinutes: 60 }).targetMinutes, 60);
});

// A change that names only the habit takes the new-Habit form's default for every other field.
test("a change that names only the habit takes every other field's default", () => {
  assert.deepEqual(drafted({ name: "Stretch" }), {
    name: "Stretch",
    description: "",
    usualWhen: "",
    places: [],
    kind: "good",
    trees: [],
    treeAskFrom: null,
    priority: "normal",
    active: true,
    autoLogged: false,
    optOutFrom: null,
    usualMinutes: null,
    startDate: torontoDay(new Date()),
    cueType: "",
    stackedAfter: null,
    target: { type: "daily", count: 7, days: [] },
    record: "check",
    targetMinutes: null,
    goals: [],
    alarm: null,
    seasons: [],
    seasonQuietUntil: null,
    tinyVersion: "",
  });
});

test("a new bad habit with no record style is counted, as the form defaults it", () => {
  assert.equal(drafted({ name: "Snacking", kind: "bad" }).record, "count");
});

test("a stackedAfter with no cueType makes the cue stacked", () => {
  assert.deepEqual(
    [
      drafted({ name: "Walk", stackedAfter: "sit" }).cueType,
      drafted({ name: "Walk", stackedAfter: null }).cueType,
    ],
    ["stacked", ""],
  );
});

test("the name and the Places come back trimmed, without blanks or repeats", () => {
  const draft = drafted({ ...GARDEN, name: " Scroll ", places: [" Gym ", "", "gym", "Home"] });

  assert.deepEqual([draft.name, draft.places], ["Scroll", ["Gym", "Home"]]);
});

test("an old client's dropped Habit fields are ignored, not refused", () => {
  const draft = drafted(HabitChange.parse({ ...GARDEN, why: "Nights", reward: "tea" }));

  assert.deepEqual(
    Object.keys(draft).filter((field) => field === "why" || field === "reward"),
    [],
  );
});

test("a good recurring Habit keeps its Tiny version trimmed", () => {
  assert.equal(
    drafted({ ...RUN, tinyVersion: " Put on running shoes " }).tinyVersion,
    "Put on running shoes",
  );
});

test.each([
  ["a bad Habit", { kind: "bad" }],
  ["a One-off", { target: { type: "once" } }],
  ["a Reference Habit", { target: { type: "none" } }],
] as const)("%s drops its Tiny version", (_name, change) => {
  assert.equal(drafted({ ...RUN, ...change, tinyVersion: "Put on running shoes" }).tinyVersion, "");
});

test("a Reference Habit and a One-off reset their count and days", () => {
  assert.deepEqual(drafted({ ...GARDEN, target: { type: "none", count: 3, days: [2] } }).target, {
    type: "none",
    count: 7,
    days: [],
  });
  assert.deepEqual(drafted({ ...RUN, target: { type: "once", count: 3, days: [2] } }).target, {
    type: "once",
    count: 1,
    days: [],
  });
});

test("fixed weekdays come back sorted, without repeats", () => {
  assert.deepEqual(
    drafted({ ...GARDEN, target: { type: "days", count: 7, days: [5, 1, 5] } }).target,
    {
      type: "days",
      count: 7,
      days: [1, 5],
    },
  );
});

test.each([
  ["monthly", 31],
  ["interval", 30],
] as const)("a %s Habit saves at its highest count", (type, count) => {
  assert.deepEqual(drafted({ ...GARDEN, target: { type, count, days: [] } }).target, {
    type,
    count,
    days: [],
  });
});

test("Goals come back sorted, without repeats", () => {
  assert.deepEqual(drafted({ ...GARDEN, goals: [3, 1, 3] }).goals, [1, 3]);
});

test("a Reference Habit drops its alarm", () => {
  const alarm = { time: "07:00", kind: "alarm" } as const;

  assert.equal(drafted({ ...GARDEN, target: { type: "none" }, alarm }).alarm, null);
  assert.deepEqual(drafted({ ...GARDEN, alarm }).alarm, alarm);
});

test("Seasons come back earliest first, and a One-off or Reference Habit keeps none", () => {
  const later = { start: "2027-05-02", end: null };
  const earlier = { start: "2026-05-03", end: "2026-10-18" };

  assert.deepEqual(drafted({ name: "Paddle", seasons: [later, earlier] }).seasons, [
    earlier,
    later,
  ]);
  assert.deepEqual(
    drafted({ name: "Once", target: { type: "once" }, seasons: [later] }).seasons,
    [],
  );
  assert.deepEqual(
    drafted({ name: "Ref", target: { type: "none" }, seasons: [later] }).seasons,
    [],
  );
});

// Every value the client lists is one the rules accept.
test("checkDraft accepts every listed value", () => {
  const accepted: HabitChange[] = [
    ...KINDS.map((kind) => ({ kind })),
    ...PRIORITIES.map(({ id: priority }) => ({ priority })),
    ...RECORD_STYLES.map((record) => ({ record, targetMinutes: 30 })),
    ...TARGET_TYPES.map((type) => ({ target: { type, count: 2, days: [1] } })),
    ...CUE_TYPES.map(({ id: cueType }) =>
      cueType === "stacked" ? { cueType, stackedAfter: "sit" } : { cueType, usualWhen: "07:00" },
    ),
    ...ALARM_KINDS.map((kind) => ({ alarm: { time: "07:00", kind } })),
  ];

  for (const change of accepted) assert.equal(checkDraft({ ...GARDEN, ...change }).problem, null);
});
