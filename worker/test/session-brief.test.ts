import assert from "node:assert/strict";
import { onRequestGet as getBrief } from "@worker/api/session-brief";
import { onRequestGet as getWindow } from "@worker/api/session-brief-window";
import {
  factsOf,
  parseProse,
  shiftDay,
  coachName,
  torontoDay,
  windowFrom,
  windowNote,
  blankCheckIn,
  type SessionSearch,
  type CheckIn,
} from "@/core";
import { apiRequest, makeEnv, OWNER } from "./helpers/env";

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
  assert.deepEqual(facts.habits, [{ name: "Walk", days: 2 }]);
});

test("parseProse accepts the JSON shape, even inside a code fence", () => {
  const reply = '```json\n{"summary":"s","patterns":["a"],"toRaise":"r"}\n```';
  assert.deepEqual(parseProse(reply), { summary: "s", patterns: ["a"], toRaise: "r" });
});

for (const reply of [
  undefined,
  "no json",
  '{"summary":1}',
  '{"summary":"s","patterns":[1],"toRaise":"r"}',
])
  test(`parseProse rejects ${String(reply)}`, () => {
    assert.equal(parseProse(reply), null);
  });

const call = (env: ReturnType<typeof makeEnv>, path: string, email: string | null = OWNER) =>
  getBrief({ env, params: {}, request: apiRequest("GET", `https://x${path}`, { email }) });

test("the brief needs sign-in", async () => {
  assert.equal((await call(makeEnv(), "/api/session-brief?start=2026-11-01", null)).status, 401);
});

test("a bad start date is a 400", async () => {
  assert.equal((await call(makeEnv(), "/api/session-brief?start=soon")).status, 400);
});

test("no Check-ins in the window returns no prose and never calls the AI", async () => {
  const env = makeEnv();
  env.AI = { run: () => assert.fail("AI must not run") };
  const body = await (await call(env, "/api/session-brief?start=2026-11-01")).json();
  assert.equal(body.facts.rows.length, 0);
  assert.equal(body.prose, null);
});

test("the brief returns facts and AI prose, and saves nothing", async () => {
  const env = makeEnv();
  const today = torontoDay(new Date());
  await env.DB.prepare(
    "INSERT INTO check_ins (checked_in_at, zone, score, note) VALUES (?, 'Storm', 1, 'bad')",
  )
    .bind(new Date().toISOString())
    .run();
  env.AI = {
    run: () =>
      Promise.resolve({ response: '{"summary":"rough","patterns":[],"toRaise":"Thursday"}' }),
  };
  const body = await (await call(env, `/api/session-brief?start=${today}`)).json();
  assert.equal(body.facts.lows.length, 1);
  assert.equal(body.prose.toRaise, "Thursday");
});

test("the brief counts a duration Habit once on each day it has an entry", async () => {
  const env = makeEnv();
  const today = torontoDay(new Date());
  await env.DB.prepare(
    "UPDATE habits SET record = 'duration', target_minutes = 15 WHERE id = 'sit'",
  )
    .bind()
    .run();
  await env.DB.prepare(
    "INSERT INTO habit_durations (habit, date, start_time, minutes) VALUES ('sit', ?, '08:00', 10), ('sit', ?, '20:00', 20)",
  )
    .bind(today, today)
    .run();
  const body = await (await call(env, `/api/session-brief?start=${today}`)).json();
  assert.deepEqual(body.facts.habits, [{ name: "Bedtime meditation (15 min)", days: 1 }]);
});

const seedOneOff = async (env: ReturnType<typeof makeEnv>, startDate: string) =>
  env.DB.prepare(
    "INSERT INTO habits (id, name, kind, target_type, target_count, start_date) VALUES ('portage', 'Go portaging', 'good', 'once', 1, ?)",
  )
    .bind(startDate)
    .run();

test("the brief lists One-offs and their Reschedules even with no Check-ins", async () => {
  const env = makeEnv();
  env.AI = { run: () => assert.fail("AI must not run") };
  const today = torontoDay(new Date());
  await seedOneOff(env, "2026-01-02");
  await env.DB.prepare(
    "INSERT INTO habit_reschedules (habit, from_date, to_date, cause, note) VALUES ('portage', '2026-01-01', '2026-01-02', 'avoidance', 'tired')",
  )
    .bind()
    .run();
  const body = await (await call(env, `/api/session-brief?start=${today}`)).json();
  assert.equal(body.facts.oneOffs[0].status, "overdue");
  assert.equal(body.facts.oneOffs[0].reschedules[0].flagged, true);
  assert.equal(body.prose, null);
});

test("the brief lists Skips oldest first and flags an avoidance one", async () => {
  const env = makeEnv();
  const today = torontoDay(new Date());
  const tomorrow = shiftDay(today, 1);
  await env.DB.prepare(
    "INSERT INTO habit_checks (date, habit, count) VALUES (?1, 'sit', -1), (?2, 'up', -1)",
  )
    .bind(today, tomorrow)
    .run();
  await env.DB.prepare(
    "INSERT INTO habit_skips (habit, date, cause, note) VALUES ('sit', ?1, 'avoidance', 'tired'), ('up', ?2, 'outside', '')",
  )
    .bind(today, tomorrow)
    .run();
  const body = await (await call(env, `/api/session-brief?start=${today}`)).json();
  assert.deepEqual(body.facts.skips, [
    {
      name: "Bedtime meditation (15 min)",
      date: today,
      cause: "avoidance",
      note: "tired",
      flagged: true,
    },
    { name: "Out of bed at alarm", date: tomorrow, cause: "outside", note: "", flagged: false },
  ]);
});

test("What helped skips missed days and One-offs", async () => {
  const env = makeEnv();
  const today = torontoDay(new Date());
  await seedOneOff(env, today);
  await env.DB.prepare(
    "INSERT INTO habit_checks (date, habit, count) VALUES (?, 'portage', 1), (?, 'sit', -1)",
  )
    .bind(today, today)
    .run();
  const body = await (await call(env, `/api/session-brief?start=${today}`)).json();
  assert.deepEqual(body.facts.habits, []);
  assert.equal(body.facts.oneOffs[0].status, "done");
});

test("a failing AI still returns the facts", async () => {
  const env = makeEnv();
  await env.DB.prepare("INSERT INTO check_ins (checked_in_at, zone, score) VALUES (?, 'Sun', 8)")
    .bind(new Date().toISOString())
    .run();
  env.AI = {
    run: () => Promise.reject(new Error("down")),
  };
  const body = await (await call(env, `/api/session-brief?start=${torontoDay(new Date())}`)).json();
  assert.equal(body.facts.highs.length, 1);
  assert.equal(body.prose, null);
});

test("the window without Google secrets says not-connected and defaults to 7 days", async () => {
  const env = makeEnv();
  await env.DB.prepare("INSERT INTO health_plan (id, body) VALUES (1, 'Coach: Dr. Rao')")
    .bind()
    .run();

  const res = await getWindow({
    env,
    params: {},
    request: apiRequest("GET", "https://x/api/session-brief-window", { email: OWNER }),
  });

  const body = await res.json();
  const today = torontoDay(new Date());
  assert.equal(body.calendar, "not-connected");
  assert.equal(body.start, shiftDay(today, -7));
  assert.equal(body.coach, "Dr. Rao");
});

test("the window skips the calendar when no coach is named", async () => {
  const res = await getWindow({
    env: makeEnv(),
    params: {},
    request: apiRequest("GET", "https://x/api/session-brief-window", { email: OWNER }),
  });

  assert.equal((await res.json()).calendar, "no-coach");
});

for (const calendar of ["found", "no-match", "no-coach", "not-connected", "unreachable"] as const)
  test(`windowNote explains ${calendar}`, () => {
    assert.match(windowNote({ start: "2026-10-30", calendar }, "Dr. Rao"), /\w+/);
  });

test("windowNote says the calendar is unreachable and tells the user to reconnect", () => {
  assert.match(windowNote({ start: "x", calendar: "unreachable" }, null), /unreachable/);
  assert.match(windowNote({ start: "x", calendar: "not-connected" }, null), /reconnect/i);
});
