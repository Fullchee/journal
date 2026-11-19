import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "@worker/api/habits";
import { makeD1 } from "./helpers/d1";
import type { Env, Json } from "@worker/lib/env";
import { MAX_BODY_BYTES } from "@worker/lib/note-body";
import {
  MISSED,
  type Counts,
  type Durations,
  type Goal,
  type Skips,
  ALARM_KINDS,
  CUE_TYPES,
  KINDS,
  PRIORITIES,
  RECORD_STYLES,
  STAGES,
  TARGET_TYPES,
  torontoDay,
  type Habit,
} from "@/core";
import { apiRequest, makeEnv, OWNER } from "./helpers/env";
import { readJson } from "./helpers/json";

// What GET /api/habits returns for each `view`; `counts` and `durations` come with a `since` date.
interface HabitsBody {
  habits: Habit[];
}

type HomeBody = HabitsBody & { counts: Counts; durations: Durations };

type TrackerBody = HomeBody & { goals: Goal[] };

const STRANGER = "stranger@example.com";

const get = (env: Env, email: string | null, query = "") =>
  onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", `https://x/api/habits${query}`, { email }),
  });

const post = (env: Env, email: string | null, body: Json) =>
  onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/habits", { body, email }),
  });

// Tests that seed rows with raw SQL need the in-memory database's exec.
const makeEnvWithExec = () => ({ ...makeEnv(), DB: makeD1() });

// Every count the tests write falls after this date.
const ALL_TIME = "2000-01-01";

const fetchBody = async (env: Env, email: string | null) =>
  readJson<TrackerBody>(await get(env, email, `?view=tracker&since=${ALL_TIME}`));

const check = (date: string, habit: string, on: Json) => ({ type: "check", date, habit, on });

test("GET without the Access header is rejected", async () => {
  assert.equal((await get(makeEnv(), null)).status, 401);
});

test("GET on empty storage returns no counts", async () => {
  assert.deepEqual((await fetchBody(makeEnv(), OWNER)).counts, {});
});

test("GET lets in the owner, matched case-insensitively, and forbids a stranger", async () => {
  const env = makeEnv();
  assert.equal((await get(env, "ME@example.com", "?view=tracker")).status, 200);
  assert.equal((await get(env, STRANGER, "?view=tracker")).status, 403);
});

test("POST without the Access header is rejected", async () => {
  assert.equal((await post(makeEnv(), null, check("2026-11-04", "up", true))).status, 401);
});

test("POST from a stranger is forbidden and writes nothing", async () => {
  const env = makeEnv();
  assert.equal((await post(env, STRANGER, check("2026-11-04", "up", true))).status, 403);
  assert.deepEqual((await fetchBody(env, OWNER)).counts, {});
});

test("POST checks then unchecks a habit", async () => {
  const env = makeEnv();
  await post(env, OWNER, check("2026-11-04", "up", true));
  await post(env, OWNER, check("2026-11-04", "sit", true));
  await post(env, OWNER, check("2026-11-04", "up", false));
  assert.deepEqual((await fetchBody(env, OWNER)).counts, { "2026-11-04": { sit: 1 } });
});

test("POST checking the same habit twice keeps one check", async () => {
  const env = makeEnv();
  await post(env, OWNER, check("2026-11-04", "up", true));
  await post(env, OWNER, check("2026-11-04", "up", true));
  assert.deepEqual((await fetchBody(env, OWNER)).counts, { "2026-11-04": { up: 1 } });
});

const INVALID_CHANGES: [string, Json][] = [
  ["bad_date", check("yesterday", "up", true)],
  ["bad_habit", check("2026-11-04", "Up Now!", true)],
  ["non_boolean_on", check("2026-11-04", "up", "yes")],
  ["bad_start_date", { type: "habit", name: "X", startDate: "last week" }],
  ["replaces_a_build_habit", { type: "habit", name: "X", replaces: "up" }],
  ["stacked_after_unknown_habit", { type: "habit", name: "X", stackedAfter: "nope" }],
  ["links_to_itself", { type: "habit", id: "up", name: "Up", stackedAfter: "up" }],
  ["retired_text_type", { type: "text", focus: "", discuss: "" }],
  ["unknown_type", { type: "wipe" }],
  ["not_json", "{nope"],
  [
    "too_many_places",
    {
      type: "habit",
      name: "X",
      places: Array.from({ length: 21 }, (_, i) => `Place ${String(i)}`),
    },
  ],
  ["place_too_long", { type: "habit", name: "X", places: ["x".repeat(201)] }],
];

for (const [id, body] of INVALID_CHANGES) {
  test(`POST rejects invalid change: ${id}`, async () => {
    assert.equal((await post(makeEnv(), OWNER, body)).status, 400);
  });
}

test("a Habit whose name has no letters or digits gets a generic id", async () => {
  const { id } = await readJson<{ id: string }>(
    await post(makeEnv(), OWNER, { type: "habit", name: "!!!" }),
  );

  assert.match(id, /^habit-[0-9a-f]{6}$/);
});

test("POST rejects an edit that stacks a saved Habit after itself", async () => {
  const env = makeEnv();

  const { id } = await readJson<{ id: string }>(
    await post(env, OWNER, { type: "habit", name: "Up" }),
  );

  const stacked = { type: "habit", id, cueType: "stacked", stackedAfter: id };

  assert.equal((await post(env, OWNER, stacked)).status, 400);
});

const GARDEN = {
  type: "habit",
  name: "Scrolling on the laptop",
  kind: "bad",
  stage: "seed",
  record: "check",
  description: "Most nights, on the couch.",
  startDate: "2026-11-01",
  cue: "laptop open after 9pm",
  cueType: "action",
  routine: "close the lid",
  reward: "tea",
  obstacles: ["Tired after work", "no time", "tired after work"],
  target: { type: "weekly", count: 2, days: [] },
};

const goalIds = async (env: Env) => {
  const [first, second, third] = (await fetchBody(env, OWNER)).goals.map((g) => g.id);
  assert.ok(
    first !== undefined && second !== undefined && third !== undefined,
    "three seeded Goals",
  );

  return [first, second, third] as const;
};

const habitNamed = async (env: Env, name: string) => {
  const habit = (await fetchBody(env, OWNER)).habits.find((h) => h.name === name);
  assert.ok(habit, `no habit named ${name}`);

  return habit;
};

test("GET lists the original habits as daily build habits that keep their ids", async () => {
  const { habits } = await fetchBody(makeEnv(), OWNER);
  assert.equal(habits.filter((h) => !/^(?:practice|ref)-/.test(h.id)).length, 8);
  assert.deepEqual(
    [habits[0]?.id, habits[0]?.kind, habits[0]?.target.type],
    ["up", "good", "daily"],
  );
});

test("the owner adds a habit with a generated id", async () => {
  const env = makeEnv();
  const res = await post(env, OWNER, GARDEN);
  const habit = await habitNamed(env, GARDEN.name);
  assert.deepEqual([res.status, await res.json()], [201, { id: habit.id }]);
  assert.match(habit.id, /^scrolling-on-the-laptop-[0-9a-f]{6}$/);
  assert.deepEqual(
    [
      habit.kind,
      habit.stage,
      habit.description,
      habit.startDate,
      habit.cueType,
      [habit.cue, habit.routine, habit.reward, habit.obstacles],
      habit.target,
    ],
    [
      "bad",
      "seed",
      "Most nights, on the couch.",
      "2026-11-01",
      "action",
      ["laptop open after 9pm", "close the lid", "tea", ["tired after work", "no time"]],
      GARDEN.target,
    ],
  );
  assert.equal("usualFrequency" in habit, false);
});

test("the owner saves a habit's Places trimmed, without blanks or repeats", async () => {
  const env = makeEnv();
  await post(env, OWNER, { ...GARDEN, places: [" Gym ", "", "gym", "Home"] });
  assert.deepEqual((await habitNamed(env, GARDEN.name)).places, ["Gym", "Home"]);
});

test("the owner saves a habit's why", async () => {
  const env = makeEnv();
  await post(env, OWNER, { ...GARDEN, why: "Nights are when the scroll starts" });
  assert.equal((await habitNamed(env, GARDEN.name)).why, "Nights are when the scroll starts");
});

const RUN = {
  ...GARDEN,
  name: "Run 5 km",
  kind: "good",
  target: { type: "daily", count: 7, days: [] },
};

test("the owner saves a good Habit's Tiny version trimmed, and an edit keeps it", async () => {
  const env = makeEnv();
  await post(env, OWNER, { ...RUN, tinyVersion: " Put on running shoes " });
  const saved = await habitNamed(env, RUN.name);
  assert.equal(saved.tinyVersion, "Put on running shoes");

  await post(env, OWNER, { type: "habit", id: saved.id, stage: "sprout" });
  assert.equal((await habitNamed(env, RUN.name)).tinyVersion, "Put on running shoes");
});

test("a Habit saved without a Tiny version has an empty one", async () => {
  const env = makeEnv();
  await post(env, OWNER, RUN);
  assert.equal((await habitNamed(env, RUN.name)).tinyVersion, "");
});

test.each([
  ["a bad Habit", { kind: "bad" }],
  ["a One-off", { target: { type: "once", count: 1, days: [] } }],
  ["a Reference Habit", { target: { type: "none", count: 7, days: [] } }],
])("%s drops its Tiny version", async (_name, change) => {
  const env = makeEnv();
  await post(env, OWNER, { ...RUN, ...change, tinyVersion: "Put on running shoes" });
  assert.equal((await habitNamed(env, RUN.name)).tinyVersion, "");
});

test("GET lists the Goals a habit can point at, retired ones included", async () => {
  const env = makeEnvWithExec();
  await env.DB.exec("UPDATE goals SET state = 'retired' WHERE title = 'Less Screen Time'");
  const { goals } = await fetchBody(env, OWNER);
  assert.deepEqual(
    goals.map((g) => [g.title, g.state]),
    [
      ["Deliberate Work", "active"],
      ["Less Screen Time", "retired"],
      ["Stretch Daily", "active"],
    ],
  );
});

test("the owner links a habit to Goals and the links come back sorted", async () => {
  const env = makeEnv();
  const ids = await goalIds(env);
  await post(env, OWNER, { ...GARDEN, goals: [ids[2], ids[0]] });
  assert.deepEqual((await habitNamed(env, GARDEN.name)).goals, [ids[0], ids[2]]);
});

test("relinking keeps the note on a Goal that stays and drops the others", async () => {
  const env = makeEnvWithExec();
  const [first, second] = await goalIds(env);
  await post(env, OWNER, { ...GARDEN, goals: [first, second] });
  const { id } = await habitNamed(env, GARDEN.name);
  await env.DB.exec("UPDATE goal_habits SET note = 'the Nurture move'");
  await post(env, OWNER, { ...GARDEN, id, goals: [second] });

  const { results } = await env.DB.prepare("SELECT goal_id, note FROM goal_habits ORDER BY goal_id")
    .bind()
    .all<{ goal_id: number; note: string }>();

  assert.deepEqual(
    results.map((r) => ({ ...r })),
    [{ goal_id: second, note: "the Nurture move" }],
  );
});

test("deleting a habit removes its Goal links", async () => {
  const env = makeEnv();
  const [goalId] = await goalIds(env);
  await post(env, OWNER, { ...GARDEN, goals: [goalId] });
  const habit = await habitNamed(env, GARDEN.name);
  await post(env, OWNER, { type: "delete-habit", id: habit.id });

  const { results } = await env.DB.prepare("SELECT goal_id FROM goal_habits")
    .bind()
    .all<{ goal_id: number }>();

  assert.deepEqual(results, []);
});

test("the owner saves a Reference Habit with no target, its count and days reset", async () => {
  const env = makeEnv();
  await post(env, OWNER, { ...GARDEN, target: { type: "none", count: 3, days: [2] } });
  assert.deepEqual((await habitNamed(env, GARDEN.name)).target, {
    type: "none",
    count: 7,
    days: [],
  });
});

test.each([
  ["monthly", 31],
  ["interval", 30],
])("the owner saves a %s Habit at its highest count", async (type, count) => {
  const env = makeEnv();
  await post(env, OWNER, { ...GARDEN, target: { type, count, days: [] } });
  assert.deepEqual((await habitNamed(env, GARDEN.name)).target, { type, count, days: [] });
});

test("the owner saves a One-off on its date, its count and days reset", async () => {
  const env = makeEnv();
  const portage = { ...GARDEN, kind: "good", target: { type: "once", count: 3, days: [2] } };
  assert.equal((await post(env, OWNER, portage)).status, 201);
  const habit = await habitNamed(env, GARDEN.name);
  assert.deepEqual(habit.target, { type: "once", count: 1, days: [] });
  assert.equal(habit.startDate, GARDEN.startDate);
});

test("GET keeps a One-off's answer from before `since`, so it never turns overdue again", async () => {
  const env = makeEnv();
  await post(env, OWNER, { ...GARDEN, kind: "good", target: { type: "once", count: 1, days: [] } });
  await post(env, OWNER, { ...GARDEN, name: "Walk" });
  const oneOff = await habitNamed(env, GARDEN.name);
  const walk = await habitNamed(env, "Walk");
  await post(env, OWNER, check("2026-11-02", oneOff.id, true));
  await post(env, OWNER, check("2026-11-02", walk.id, true));

  const { counts } = await readJson<HomeBody>(await get(env, OWNER, "?view=home&since=2026-11-05"));

  assert.deepEqual(counts, { "2026-11-02": { [oneOff.id]: 1 } });
});

test("an edit can't move a One-off whose date has come, so that move goes through a Reschedule", async () => {
  const env = makeEnv();
  await post(env, OWNER, { ...GARDEN, kind: "good", target: { type: "once", count: 1, days: [] } });
  const { id } = await habitNamed(env, GARDEN.name);

  const moved = await post(env, OWNER, { type: "habit", id, startDate: "2026-11-20" });

  const renamed = await post(env, OWNER, {
    type: "habit",
    id,
    startDate: GARDEN.startDate,
    name: "Portage",
  });

  assert.equal(moved.status, 400);
  assert.equal(renamed.status, 204);
  assert.equal((await habitNamed(env, "Portage")).startDate, GARDEN.startDate);
});

test("an edit still moves a repeating Habit's start date", async () => {
  const env = makeEnv();
  await post(env, OWNER, GARDEN);
  const { id } = await habitNamed(env, GARDEN.name);
  assert.equal(
    (await post(env, OWNER, { type: "habit", id, startDate: "2026-11-20" })).status,
    204,
  );
  assert.equal((await habitNamed(env, GARDEN.name)).startDate, "2026-11-20");
});

test("a habit saves without an alarm", async () => {
  const env = makeEnv();
  await post(env, OWNER, GARDEN);
  assert.equal((await habitNamed(env, GARDEN.name)).alarm, null);
});

test("the owner sets a habit's alarm time and kind", async () => {
  const env = makeEnv();
  const alarm = { time: "21:30", kind: "persistent" };
  await post(env, OWNER, { ...GARDEN, alarm });
  assert.deepEqual((await habitNamed(env, GARDEN.name)).alarm, alarm);
});

test("a Reference Habit drops its alarm", async () => {
  const env = makeEnv();
  await post(env, OWNER, {
    ...GARDEN,
    target: { type: "none", count: 7, days: [] },
    alarm: { time: "07:00", kind: "alarm" },
  });
  assert.equal((await habitNamed(env, GARDEN.name)).alarm, null);
});

test("the owner edits a habit's stage by id", async () => {
  const env = makeEnv();
  await post(env, OWNER, {
    ...GARDEN,
    id: "up",
    name: "Out of bed at alarm",
    stage: "tree",
  });
  const habit = await habitNamed(env, "Out of bed at alarm");
  assert.deepEqual([habit.id, habit.stage], ["up", "tree"]);
});

test("an edit that names only some fields keeps the others", async () => {
  const env = makeEnv();
  await post(env, OWNER, { ...GARDEN, id: "up" });
  await post(env, OWNER, { type: "habit", id: "up", stage: "sprout" });
  const habit = await habitNamed(env, GARDEN.name);
  assert.deepEqual(
    [habit.stage, habit.description, habit.target],
    ["sprout", GARDEN.description, GARDEN.target],
  );
});

test("a habit defaults to normal priority and active, and keeps what the owner sets", async () => {
  const env = makeEnv();
  await post(env, OWNER, GARDEN);
  await post(env, OWNER, { ...GARDEN, name: "Nibble the frog", priority: "high", active: false });
  assert.deepEqual(
    [await habitNamed(env, GARDEN.name), await habitNamed(env, "Nibble the frog")].map((h) => [
      h.priority,
      h.active,
    ]),
    [
      ["normal", true],
      ["high", false],
    ],
  );
});

test("GET lists high priority habits first", async () => {
  const env = makeEnv();
  await post(env, OWNER, { ...GARDEN, priority: "high" });
  const { habits } = await fetchBody(env, OWNER);
  assert.equal(habits[0]?.name, GARDEN.name);
});

test("deleting a habit removes its checks", async () => {
  const env = makeEnv();
  await post(env, OWNER, check("2026-11-04", "up", true));
  await post(env, OWNER, { type: "delete-habit", id: "up" });
  const { habits, counts } = await fetchBody(env, OWNER);
  assert.deepEqual([habits.some((h) => h.id === "up"), counts], [false, {}]);
});

test("a count habit stores a count that a later count replaces", async () => {
  const env = makeEnv();
  await post(env, OWNER, { ...check("2026-11-04", "up", true), count: 2 });
  await post(env, OWNER, { ...check("2026-11-04", "up", true), count: 3 });
  assert.deepEqual((await fetchBody(env, OWNER)).counts, { "2026-11-04": { up: 3 } });
});

test("a stranger cannot change a habit", async () => {
  assert.equal((await post(makeEnv(), STRANGER, GARDEN)).status, 403);
});

const ADD_DURATION = {
  type: "add-duration",
  habit: "sit",
  date: "2026-11-04",
  startTime: "09:00",
  minutes: 20,
};

const INVALID_HABIT_CHANGES: [string, Json][] = [
  ["blank_name", { ...GARDEN, name: " " }],
  ["bad_kind", { ...GARDEN, kind: "break" }],
  ["bad_kind_without_record", { type: "habit", name: "X", kind: "break" }],
  ["bad_stage", { ...GARDEN, stage: "forest" }],
  ["bad_priority", { ...GARDEN, priority: "urgent" }],
  ["bad_cue_type", { ...GARDEN, cueType: "smell" }],
  ["stacked_without_habit", { type: "habit", name: "X", cueType: "stacked" }],
  [
    "typed_cue_with_stacked_habit",
    { type: "habit", name: "X", cueType: "time", stackedAfter: "sit" },
  ],
  ["active_not_boolean", { ...GARDEN, active: "yes" }],
  ["days_without_weekdays", { ...GARDEN, target: { type: "days", count: 1, days: [] } }],
  ["once_without_date", { ...GARDEN, startDate: "", target: { type: "once", count: 1, days: [] } }],
  ["weekly_count_zero", { ...GARDEN, target: { type: "weekly", count: 0, days: [] } }],
  ["weekly_count_eight", { ...GARDEN, target: { type: "weekly", count: 8, days: [] } }],
  ["monthly_count_32", { ...GARDEN, target: { type: "monthly", count: 32, days: [] } }],
  [
    "interval_without_date",
    { ...GARDEN, startDate: "", target: { type: "interval", count: 3, days: [] } },
  ],
  ["interval_every_day", { ...GARDEN, target: { type: "interval", count: 1, days: [] } }],
  ["interval_count_31", { ...GARDEN, target: { type: "interval", count: 31, days: [] } }],
  ["why_not_a_string", { ...GARDEN, why: 3 }],
  ["goals_not_a_list", { ...GARDEN, goals: 1 }],
  ["usual_when_free_text", { ...GARDEN, usualWhen: "evening" }],
  ["usual_when_twelve_hour", { ...GARDEN, usualWhen: "7:45 a.m." }],
  ["usual_when_bad_hour", { ...GARDEN, usualWhen: "24:00" }],
  ["alarm_bad_time", { ...GARDEN, alarm: { time: "24:00", kind: "alarm" } }],
  ["alarm_bad_kind", { ...GARDEN, alarm: { time: "07:00", kind: "snooze" } }],
  ["alarm_not_an_object", { ...GARDEN, alarm: "07:00" }],
  [
    "season_ends_before_it_starts",
    { ...GARDEN, seasons: [{ start: "2026-05-03", end: "2026-05-02" }] },
  ],
  ["season_bad_date", { ...GARDEN, seasons: [{ start: "May 3", end: null }] }],
  ["season_quiet_bad_date", { ...GARDEN, seasonQuietUntil: "soon" }],
  ["tiny_version_not_a_string", { ...GARDEN, tinyVersion: 3 }],
  ["tiny_version_too_long", { ...GARDEN, tinyVersion: "x".repeat(201) }],
  ["unknown_goal", { ...GARDEN, goals: [9999] }],
  ["unknown_habit_id", { ...GARDEN, id: "nope" }],
  ["count_zero", { ...check("2026-11-04", "up", true), count: 0 }],
  ["delete_bad_id", { type: "delete-habit", id: "BAD ID" }],
  ["duration_without_minutes", { ...GARDEN, record: "duration" }],
  ["duration_zero_minutes", { ...GARDEN, record: "duration", targetMinutes: 0 }],
  ["duration_over_a_day", { ...GARDEN, record: "duration", targetMinutes: 1441 }],
  ["duration_fractional_minutes", { ...GARDEN, record: "duration", targetMinutes: 1.5 }],
  ["delete_duration_not_a_number", { type: "delete-duration", entry: "1" }],
  ["delete_duration_unknown", { type: "delete-duration", entry: 999 }],
  ["add_duration_zero_minutes", { ...ADD_DURATION, minutes: 0 }],
  ["add_duration_over_a_day", { ...ADD_DURATION, minutes: 1441 }],
  ["add_duration_fractional", { ...ADD_DURATION, minutes: 1.5 }],
  ["add_duration_bad_time", { ...ADD_DURATION, startTime: "24:00" }],
  ["add_duration_bad_date", { ...ADD_DURATION, date: "2026-11" }],
  ["add_duration_untimed_habit", { ...ADD_DURATION, habit: "up" }],
];

for (const [id, body] of INVALID_HABIT_CHANGES) {
  test(`POST rejects invalid habit change: ${id}`, async () => {
    assert.equal((await post(makeEnv(), OWNER, body)).status, 400);
  });
}

const accepts = (
  field: string,
  values: readonly string[],
  patch: (value: string) => Record<string, Json>,
  read: (habit: Habit) => string | undefined,
) => values.map((value) => ({ field, value, patch: patch(value), read }));

// Every value the client lists is one the server stores; "sit" is a seeded habit to stack after.
const ACCEPTED_VALUES = [
  ...accepts(
    "kind",
    KINDS,
    (kind) => ({ kind }),
    (h) => h.kind,
  ),
  ...accepts(
    "stage",
    STAGES.map((s) => s.id),
    (stage) => ({ stage }),
    (h) => h.stage,
  ),
  ...accepts(
    "priority",
    PRIORITIES.map((p) => p.id),
    (priority) => ({ priority }),
    (h) => h.priority,
  ),
  ...accepts(
    "record",
    RECORD_STYLES,
    (record) => ({ record, targetMinutes: 30 }),
    (h) => h.record,
  ),
  ...accepts(
    "target",
    TARGET_TYPES,
    (type) => ({ target: { type, count: 2, days: [1] } }),
    (h) => h.target.type,
  ),
  ...accepts(
    "cueType",
    CUE_TYPES.map((c) => c.id),
    (cueType) => (cueType === "stacked" ? { cueType, stackedAfter: "sit" } : { cueType }),
    (h) => h.cueType,
  ),
  ...accepts(
    "alarm",
    ALARM_KINDS,
    (kind) => ({ alarm: { time: "07:00", kind } }),
    (h) => h.alarm?.kind,
  ),
];

for (const { field, value, patch, read } of ACCEPTED_VALUES) {
  test(`POST stores every listed ${field}: ${value}`, async () => {
    const env = makeEnv();
    const name = `${field} ${value}`;
    assert.equal((await post(env, OWNER, { ...GARDEN, name, ...patch })).status, 201);
    assert.equal(read(await habitNamed(env, name)), value);
  });
}

test("a new bad habit with no record style is counted, as the form defaults it", async () => {
  const env = makeEnv();
  await post(env, OWNER, { type: "habit", name: "Snacking", kind: "bad" });
  assert.equal((await habitNamed(env, "Snacking")).record, "count");
});

test("a new good habit with no record style is checked", async () => {
  const env = makeEnv();
  await post(env, OWNER, { type: "habit", name: "Stretch", kind: "good" });
  assert.equal((await habitNamed(env, "Stretch")).record, "check");
});

test("posting a stackedAfter with no cueType normalizes the cue type to stacked", async () => {
  const env = makeEnv();
  await post(env, OWNER, { type: "habit", name: "Walk", stackedAfter: "sit" });
  assert.equal((await habitNamed(env, "Walk")).cueType, "stacked");
});

test("a habit stacks after one habit and replaces a break habit; deleting either clears the link", async () => {
  const env = makeEnv();
  await post(env, OWNER, { ...GARDEN, id: "up", name: "Out of bed at alarm", kind: "bad" });
  await post(env, OWNER, { type: "habit", name: "Walk", replaces: "up", stackedAfter: "sit" });
  const walk = await habitNamed(env, "Walk");
  assert.deepEqual([walk.replaces, walk.stackedAfter, walk.cueType], ["up", "sit", "stacked"]);

  await post(env, OWNER, { type: "delete-habit", id: "up" });
  await post(env, OWNER, { type: "delete-habit", id: "sit" });
  const after = await habitNamed(env, "Walk");
  assert.deepEqual([after.replaces, after.stackedAfter, after.cueType], [null, null, ""]);
});

test("a Skip is stored as the MISSED count and reads back with its cause", async () => {
  const env = makeEnv();

  const skip = {
    ...check("2026-11-04", "up", true),
    count: MISSED,
    cause: "avoidance",
    note: "tired",
  };

  assert.equal((await post(env, OWNER, skip)).status, 204);

  const { counts, skips } = await readJson<TrackerBody & { skips: Skips }>(
    await get(env, OWNER, `?view=tracker&since=${ALL_TIME}`),
  );

  assert.deepEqual(
    { counts, skips },
    {
      counts: { "2026-11-04": { up: MISSED } },
      skips: { "2026-11-04": { up: { cause: "avoidance", note: "tired" } } },
    },
  );
});

test("a Skip cause the server doesn't know is refused", async () => {
  const env = makeEnv();
  const skip = { ...check("2026-11-04", "up", true), count: MISSED, cause: "lazy" };

  assert.equal((await post(env, OWNER, skip)).status, 400);
});

async function seedBacklogAndReference(env: Env) {
  await post(env, OWNER, { ...GARDEN, active: false });
  await post(env, OWNER, { ...GARDEN, name: "Reading list", target: { type: "none" } });
  await post(env, OWNER, check("2026-11-01", "up", true));
  await post(env, OWNER, check("2026-11-04", "up", true));

  return {
    backlog: await habitNamed(env, GARDEN.name),
    reference: await habitNamed(env, "Reading list"),
  };
}

const ids = (habits: Habit[]) => habits.map((h) => h.id);

test("the tracker view returns every Habit, the Goals and the counts since `since`", async () => {
  const env = makeEnv();
  const { backlog, reference } = await seedBacklogAndReference(env);
  const body = await readJson<TrackerBody>(await get(env, OWNER, "?view=tracker&since=2026-11-02"));
  assert.deepEqual(
    [backlog.id, reference.id].filter((id) => ids(body.habits).includes(id)),
    [backlog.id, reference.id],
  );
  assert.deepEqual([body.goals.length, body.counts], [3, { "2026-11-04": { up: 1 } }]);
});

test("the home view returns only active Habits with their counts", async () => {
  const env = makeEnv();
  const { backlog } = await seedBacklogAndReference(env);
  const body = await readJson<HomeBody>(await get(env, OWNER, "?view=home&since=2026-11-02"));
  assert.deepEqual(
    [body.habits.every((h) => h.active), ids(body.habits).includes(backlog.id), "goals" in body],
    [true, false, false],
  );
  assert.deepEqual(body.counts, { "2026-11-04": { up: 1 } });
});

test("a view without `since` sends no counts or durations", async () => {
  const body = await readJson<HabitsBody>(await get(makeEnv(), OWNER, "?view=home"));
  assert.deepEqual(["counts" in body, "durations" in body], [false, false]);
});

// "sit" becomes a duration Habit with three entries; "up" keeps one left over from an earlier Record style.
async function seedDurations() {
  const env = makeEnvWithExec();
  await env.DB.exec(`
    UPDATE habits SET record = 'duration', target_minutes = 60 WHERE id = 'sit';
    INSERT INTO habit_durations (id, habit, date, start_time, minutes) VALUES
      (1, 'sit', '2026-11-04', '20:00', 30),
      (2, 'sit', '2026-11-04', '08:00', 15),
      (3, 'sit', '2026-11-01', '08:00', 10),
      (4, 'up', '2026-11-04', '07:00', 5);
  `);

  return env;
}

test("a habit is not auto-logged until the owner says so, and keeps the flag through an edit", async () => {
  const env = makeEnv();
  await post(env, OWNER, GARDEN);
  const { id, autoLogged } = await habitNamed(env, GARDEN.name);
  await post(env, OWNER, { type: "habit", id, autoLogged: true });
  await post(env, OWNER, { type: "habit", id, stage: "sprout" });
  assert.deepEqual([autoLogged, (await habitNamed(env, GARDEN.name)).autoLogged], [false, true]);
});

test("a duration habit saves its minutes a day", async () => {
  const env = makeEnv();
  await post(env, OWNER, { ...GARDEN, record: "duration", targetMinutes: 60 });
  const habit = await habitNamed(env, GARDEN.name);
  assert.deepEqual([habit.record, habit.targetMinutes], ["duration", 60]);
});

test("a habit that stops being timed drops its minutes a day", async () => {
  const env = makeEnv();
  await post(env, OWNER, { ...GARDEN, record: "duration", targetMinutes: 60 });
  const { id } = await habitNamed(env, GARDEN.name);
  await post(env, OWNER, { type: "habit", id, record: "count" });
  assert.equal((await habitNamed(env, GARDEN.name)).targetMinutes, null);
});

test("GET returns each duration Habit's entries since `since`, earliest first", async () => {
  const env = await seedDurations();
  const body = await readJson<HomeBody>(await get(env, OWNER, "?view=home&since=2026-11-02"));
  assert.deepEqual(body.durations, {
    "2026-11-04": {
      sit: [
        { id: 2, startTime: "08:00", minutes: 15 },
        { id: 1, startTime: "20:00", minutes: 30 },
      ],
    },
  });
});

test("the owner deletes one duration entry", async () => {
  const env = await seedDurations();
  assert.equal((await post(env, OWNER, { type: "delete-duration", entry: 1 })).status, 204);

  const { durations } = await readJson<HomeBody>(
    await get(env, OWNER, "?view=home&since=2026-11-04"),
  );

  assert.deepEqual(durations, {
    "2026-11-04": { sit: [{ id: 2, startTime: "08:00", minutes: 15 }] },
  });
});

test("the owner adds a duration entry from Today", async () => {
  const env = await seedDurations();
  assert.equal((await post(env, OWNER, ADD_DURATION)).status, 204);

  const { durations } = await readJson<HomeBody>(
    await get(env, OWNER, "?view=home&since=2026-11-04"),
  );

  assert.deepEqual(durations["2026-11-04"]?.["sit"]?.at(1), {
    id: 5,
    startTime: "09:00",
    minutes: 20,
  });
});

const importDurations = (habit: string, entries: Json[]) => ({
  type: "import-durations",
  habit,
  entries,
});

const entry = (date: string, startTime: string, minutes: number) => ({ date, startTime, minutes });

test("an import adds only the entries the Habit doesn't have yet", async () => {
  const env = await seedDurations();

  const change = importDurations("sit", [
    entry("2026-11-04", "08:00", 15),
    entry("2026-11-05", "18:00", 60),
  ]);

  const res = await post(env, OWNER, change);

  assert.deepEqual([res.status, await readJson(res)], [201, { added: 1 }]);

  const { durations } = await readJson<HomeBody>(
    await get(env, OWNER, "?view=home&since=2026-11-05"),
  );

  assert.deepEqual(durations, {
    "2026-11-05": { sit: [{ id: 5, startTime: "18:00", minutes: 60 }] },
  });
});

const INVALID_IMPORTS: [string, Json][] = [
  ["untimed_habit", importDurations("up", [entry("2026-11-05", "18:00", 60)])],
  ["no_entries", importDurations("sit", [])],
  ["bad_entry", importDurations("sit", [entry("2026-11-05", "25:00", 60)])],
];

for (const [id, change] of INVALID_IMPORTS) {
  test(`an import is rejected and writes nothing: ${id}`, async () => {
    const env = await seedDurations();
    assert.equal((await post(env, OWNER, change)).status, 400);

    const { results } = await env.DB.prepare("SELECT id FROM habit_durations").bind().all();

    assert.equal(results.length, 4);
  });
}

test("a stranger cannot import duration entries", async () => {
  const env = await seedDurations();
  const change = importDurations("sit", [entry("2026-11-05", "18:00", 60)]);
  assert.equal((await post(env, STRANGER, change)).status, 403);
});

test("a stranger cannot add a duration entry", async () => {
  const env = await seedDurations();
  assert.equal((await post(env, STRANGER, ADD_DURATION)).status, 403);
});

test("a stranger cannot delete a duration entry", async () => {
  const env = await seedDurations();
  assert.equal((await post(env, STRANGER, { type: "delete-duration", entry: 1 })).status, 403);
});

test("a check on a duration habit is rejected and writes no count", async () => {
  const env = await seedDurations();
  assert.equal((await post(env, OWNER, check("2026-11-04", "sit", true))).status, 400);
  assert.deepEqual((await fetchBody(env, OWNER)).counts, {});
});

test("the library view returns only Reference Habits", async () => {
  const env = makeEnv();
  const { reference } = await seedBacklogAndReference(env);
  const { habits } = await readJson<HabitsBody>(await get(env, OWNER, "?view=library"));
  assert.ok(ids(habits).includes(reference.id));
  assert.ok(habits.every((h) => h.target.type === "none"));
});

const BAD_QUERIES: [string, string][] = [
  ["no_view", ""],
  ["unknown_view", "?view=backlog"],
  ["bad_since", "?view=tracker&since=last-week"],
];

for (const [id, query] of BAD_QUERIES) {
  test(`GET rejects a bad query: ${id}`, async () => {
    assert.equal((await get(makeEnv(), OWNER, query)).status, 400);
  });
}

test("a saved change answers 204 with no body", async () => {
  const res = await post(makeEnv(), OWNER, check("2026-11-04", "up", true));
  assert.deepEqual([res.status, await res.text()], [204, ""]);
});

test("a saved draft reads back field for field, on insert and on update", async () => {
  const env = makeEnv();
  const [goalId] = await goalIds(env);
  await post(env, OWNER, { ...GARDEN, id: "up", name: "Out of bed at alarm", kind: "bad" });

  const draft: Omit<Habit, "id"> = {
    name: "Walk",
    description: "Round the block",
    why: "Clear head",
    usualWhen: "18:30",
    usualWhere: "outside",
    places: ["Gym", "Home"],
    kind: "good",
    stage: "sprout",
    priority: "high",
    active: false,
    autoLogged: true,
    optOutFrom: "2026-10-01",
    usualMinutes: null,
    startDate: "2026-10-01",
    cue: "",
    cueType: "stacked",
    routine: "walk",
    reward: "podcast",
    obstacles: ["rain"],
    replaces: "up",
    stackedAfter: "sit",
    target: { type: "days", count: 7, days: [1, 3] },
    record: "count",
    targetMinutes: null,
    goals: [goalId],
    alarm: { time: "18:30", kind: "persistent" },
    seasons: [
      { start: "2026-05-03", end: "2026-10-18" },
      { start: "2027-05-02", end: null },
    ],
    seasonQuietUntil: "2027-04-25",
    tinyVersion: "Step outside",
  };

  await post(env, OWNER, { type: "habit", ...draft });
  const saved = await habitNamed(env, "Walk");
  const edited = { ...saved, stage: "plant", alarm: null, target: { ...saved.target, days: [5] } };
  await post(env, OWNER, { type: "habit", ...edited });

  assert.deepEqual(saved, { ...draft, id: saved.id });
  assert.deepEqual(await habitNamed(env, "Walk"), edited);
});

// A change that names only the habit takes the new-Habit form's default for every other field.
const DEFAULTS: [keyof Habit, Json][] = [
  ["description", ""],
  ["why", ""],
  ["usualWhen", ""],
  ["usualWhere", ""],
  ["places", []],
  ["kind", "good"],
  ["stage", "seed"],
  ["priority", "normal"],
  ["active", true],
  ["startDate", torontoDay(new Date())],
  ["cue", ""],
  ["cueType", ""],
  ["routine", ""],
  ["reward", ""],
  ["obstacles", []],
  ["replaces", null],
  ["stackedAfter", null],
  ["target", { type: "daily", count: 7, days: [] }],
  ["record", "check"],
  ["targetMinutes", null],
  ["goals", []],
  ["alarm", null],
  ["seasons", []],
  ["seasonQuietUntil", null],
];

for (const [field, expected] of DEFAULTS) {
  test(`a habit saved without ${field} defaults it`, async () => {
    const env = makeEnv();
    await post(env, OWNER, { type: "habit", name: "Stretch" });
    assert.deepEqual((await habitNamed(env, "Stretch"))[field], expected);
  });
}

test("Seasons save earliest first", async () => {
  const env = makeEnv();
  const later = { start: "2027-05-02", end: null };
  const earlier = { start: "2026-05-03", end: "2026-10-18" };
  await post(env, OWNER, { type: "habit", name: "Paddle", seasons: [later, earlier] });

  assert.deepEqual((await habitNamed(env, "Paddle")).seasons, [earlier, later]);
});

test("a One-off or Reference Habit keeps no Season", async () => {
  const env = makeEnv();
  const seasons = [{ start: "2026-05-03", end: null }];
  await post(env, OWNER, {
    type: "habit",
    name: "Once",
    startDate: "2026-11-20",
    target: { type: "once" },
    seasons,
  });
  await post(env, OWNER, { type: "habit", name: "Ref", target: { type: "none" }, seasons });

  assert.deepEqual(
    [(await habitNamed(env, "Once")).seasons, (await habitNamed(env, "Ref")).seasons],
    [[], []],
  );
});

test("a description of MAX_BODY_BYTES saves", async () => {
  const description = "x".repeat(MAX_BODY_BYTES);
  assert.equal((await post(makeEnv(), OWNER, { ...GARDEN, description })).status, 201);
});

test("a description over MAX_BODY_BYTES in UTF-8 is rejected", async () => {
  const description = "é".repeat(MAX_BODY_BYTES / 2 + 1);
  assert.equal((await post(makeEnv(), OWNER, { ...GARDEN, description })).status, 400);
});
