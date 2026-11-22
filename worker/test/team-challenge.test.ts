import assert from "node:assert/strict";
import { dateSerial, SHEET_OWNER, shiftDay, torontoDay } from "@/core";
import type { Env, Json } from "@worker/lib/env";
import worker from "@worker/index";
import { apiRequest, makeEnv, OWNER, STRANGER, type RequestBody } from "./helpers/env";

const post = (env: Env, body: RequestBody, email = OWNER) =>
  worker.fetch(apiRequest("POST", "https://x/api/team-challenge", { body, email }), env);

interface FitbitRow {
  id: string;
  day: string;
  exerciseType: number;
  distanceM: number;
}

async function addFitbit(env: Env, { id, day, exerciseType, distanceM }: FitbitRow) {
  await env.DB.prepare(
    `INSERT INTO fitbit_sessions (id, exercise_type, start_date, start_time, end_time, duration_s, distance_m)
      VALUES (?, ?, ?, ?, ?, 1800, ?)`,
  )
    .bind(id, exerciseType, day, `${day}T12:00:00.000Z`, `${day}T12:30:00.000Z`, distanceM)
    .run();
}

const HEVY_HEADER = "exercise_title,start_time,exercise_notes,reps,weight_lbs,distance_km";

const hevyCsv = (...rows: string[]) => [HEVY_HEADER, ...rows].join("\n");

/** Signs the Hevy sync in, as the owner's seed step does. */
const seedHevyAuth = (env: Env) =>
  env.DB.prepare("INSERT INTO hevy_auth (id, refresh_token) VALUES (1, 'refresh')").bind().run();

interface SyncedSet {
  workout: string;
  start: string;
  title: string;
  notes?: string | null;
  reps?: number | null;
  kg?: number | null;
  meters?: number | null;
}

/** One synced set; `start` is the workout's UTC instant. */
async function addSynced(env: Env, set: SyncedSet) {
  const { workout, start, title, notes = null, reps = null, kg = null, meters = null } = set;

  await env.DB.prepare(
    `INSERT INTO hevy_workouts (id, "index", title, start_time, end_time, seen_at)
      VALUES (?1, 0, 'Pull day', ?2, ?2, ?2) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(workout, start)
    .run();
  await env.DB.prepare(
    `INSERT INTO hevy_sets (workout_id, exercise_index, set_index, exercise_title, exercise_notes, set_type, weight_kg, reps, distance_m)
      VALUES (?, 0, (SELECT COUNT(*) FROM hevy_sets WHERE workout_id = ?), ?, ?, 'normal', ?, ?, ?)`,
  )
    .bind(workout, workout, title, notes, kg, reps, meters)
    .run();
}

const RUNNING = 56;
const WALKING = 79;
const ROWING_MACHINE = 54;

test("cardio logs new Fitbit and Hevy sessions, and sorts out what the sheet already has", async () => {
  const env = makeEnv();

  await addFitbit(env, { id: "run", day: "2026-11-02", exerciseType: RUNNING, distanceM: 5012 });
  await addFitbit(env, { id: "walk", day: "2026-11-03", exerciseType: WALKING, distanceM: 3100 });
  await addFitbit(env, {
    id: "row",
    day: "2026-11-04",
    exerciseType: ROWING_MACHINE,
    distanceM: 2000,
  });
  await addFitbit(env, { id: "early", day: "2026-10-20", exerciseType: RUNNING, distanceM: 4000 });

  const res = await post(env, {
    kind: "cardio",
    since: "2026-11-01",
    until: "2026-11-08",
    sheet: [
      ["Date", "Athlete", "Activity", "Km"],
      ["2026-11-02", SHEET_OWNER, "Running", 5],
      ["2026-11-03", SHEET_OWNER, "Walking", "2.5"],
    ],
    hevy_csv: hevyCsv(
      'Rowing Machine,"4 Nov 2026, 18:10",,,,2.1',
      'Air Bike,"5 Nov 2026, 18:10",hard,,,',
    ),
  });

  const walk = { date: "2026-11-03", activity: "Walking", quantity: 3.1 };

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    to_log: [{ date: "2026-11-04", activity: "Indoor rowing", quantity: 2.1, date_serial: 46_330 }],
    already_logged: [{ date: "2026-11-02", activity: "Running", quantity: 5.01 }],
    ask: [{ new: walk, sheet_row: ["2026-11-03", SHEET_OWNER, "Walking", "2.5"] }],
    skipped: [
      {
        date: "2026-11-04",
        exercise: "exercise type 54",
        quantity: null,
        reason: "logged from Hevy",
      },
      { date: "2026-11-05", exercise: "Air Bike", quantity: null, reason: "no distance" },
    ],
  } satisfies Json);
});

const run = (date: string, quantity: number) => ({ date, activity: "Running", quantity });

test("cardio without a Hevy export reads Fitbit, from the challenge start through today", async () => {
  const env = makeEnv();
  await seedHevyAuth(env);
  const today = torontoDay(new Date());

  await addFitbit(env, { id: "start", day: "2026-10-25", exerciseType: RUNNING, distanceM: 6000 });
  await addFitbit(env, { id: "today", day: today, exerciseType: RUNNING, distanceM: 7000 });
  await addFitbit(env, { id: "before", day: "2026-10-24", exerciseType: RUNNING, distanceM: 8000 });
  await addFitbit(env, {
    id: "tomorrow",
    day: shiftDay(today, 1),
    exerciseType: RUNNING,
    distanceM: 9000,
  });

  const res = await post(env, { kind: "cardio", sheet: [] });

  assert.deepEqual(await res.json(), {
    to_log: [
      { ...run("2026-10-25", 6), date_serial: 46_320 },
      { ...run(today, 7), date_serial: dateSerial(today) },
    ],
    already_logged: [],
    ask: [],
    skipped: [],
  } satisfies Json);
});

test("pull-ups come from the Hevy export", async () => {
  const env = makeEnv();

  const res = await post(env, {
    kind: "pullups",
    since: "2026-11-01",
    until: "2026-11-08",
    sheet: [["2026-11-05", SHEET_OWNER, "Bodyweight pull-up", 12]],
    hevy_csv: hevyCsv(
      'Pull Up,"5 Nov 2026, 07:30",,12,,',
      'Pull Up (Weighted),"6 Nov 2026, 07:30",,5,22.5,',
      'Pull Up (Band),"7 Nov 2026, 07:30",,8,,',
    ),
  });

  assert.deepEqual(await res.json(), {
    to_log: [
      {
        date: "2026-11-06",
        variation: "Weighted pull-up",
        reps: 5,
        assistance_kg: 0,
        added_kg: 10.21,
        date_serial: 46_332,
      },
    ],
    already_logged: [
      {
        date: "2026-11-05",
        variation: "Bodyweight pull-up",
        reps: 12,
        assistance_kg: 0,
        added_kg: 0,
      },
    ],
    ask: [],
    skipped: [
      {
        date: "2026-11-07",
        exercise: "Pull Up (Band)",
        quantity: 8,
        reason: "band tier missing from notes",
      },
    ],
  } satisfies Json);
});

test("without a Hevy export, pull-ups and Hevy cardio come from the synced sets on their Toronto Day", async () => {
  const env = makeEnv();
  await seedHevyAuth(env);
  // 01:30 UTC on Nov 6 is the evening of Nov 5 in Toronto.
  await addSynced(env, {
    workout: "w-1",
    start: "2026-11-06T01:30:00.000Z",
    title: "Pull Up",
    reps: 8,
  });
  await addSynced(env, {
    workout: "w-1",
    start: "2026-11-06T01:30:00.000Z",
    title: "Pull Up",
    reps: 4,
  });
  await addSynced(env, {
    workout: "w-2",
    start: "2026-11-06T12:00:00.000Z",
    title: "Pull Up (Weighted)",
    reps: 5,
    kg: 10,
  });
  await addSynced(env, {
    workout: "w-2",
    start: "2026-11-06T12:00:00.000Z",
    title: "Rowing Machine",
    meters: 2000,
  });
  await addSynced(env, {
    workout: "w-0",
    start: "2026-10-31T12:00:00.000Z",
    title: "Pull Up",
    reps: 9,
  });
  // Nov 9 01:30 UTC is still Nov 8 in Toronto, so it counts; Nov 9 12:00 UTC does not.
  await addSynced(env, {
    workout: "w-3",
    start: "2026-11-09T01:30:00.000Z",
    title: "Chin Up",
    reps: 6,
  });
  await addSynced(env, {
    workout: "w-4",
    start: "2026-11-09T12:00:00.000Z",
    title: "Pull Up",
    reps: 7,
  });

  const range = { since: "2026-11-01", until: "2026-11-08", sheet: [] };
  const pullUps = await post(env, { kind: "pullups", ...range });
  const cardio = await post(env, { kind: "cardio", ...range });

  const bodyweight = { variation: "Bodyweight pull-up", assistance_kg: 0, added_kg: 0 };

  assert.deepEqual(await pullUps.json(), {
    to_log: [
      { date: "2026-11-05", ...bodyweight, reps: 12, date_serial: 46_331 },
      {
        date: "2026-11-06",
        variation: "Weighted pull-up",
        reps: 5,
        assistance_kg: 0,
        added_kg: 10,
        date_serial: 46_332,
      },
      { date: "2026-11-08", ...bodyweight, reps: 6, date_serial: 46_334 },
    ],
    already_logged: [],
    ask: [],
    skipped: [],
  } satisfies Json);
  assert.deepEqual(await cardio.json(), {
    to_log: [{ date: "2026-11-06", activity: "Indoor rowing", quantity: 2, date_serial: 46_332 }],
    already_logged: [],
    ask: [],
    skipped: [],
  } satisfies Json);
});

test("a sent Hevy export wins over the synced sets", async () => {
  const env = makeEnv();
  await seedHevyAuth(env);
  await addSynced(env, {
    workout: "w-1",
    start: "2026-11-05T12:00:00.000Z",
    title: "Pull Up",
    reps: 8,
  });

  const res = await post(env, {
    kind: "pullups",
    since: "2026-11-01",
    until: "2026-11-08",
    sheet: [],
    hevy_csv: hevyCsv('Pull Up,"5 Nov 2026, 07:30",,3,,'),
  });

  assert.deepEqual(await res.json(), {
    to_log: [
      {
        date: "2026-11-05",
        variation: "Bodyweight pull-up",
        reps: 3,
        assistance_kg: 0,
        added_kg: 0,
        date_serial: 46_331,
      },
    ],
    already_logged: [],
    ask: [],
    skipped: [],
  } satisfies Json);
});

test.each([
  [{ kind: "cardio", sheet: [], since: "2026-13-01" }, "since must be YYYY-MM-DD, got 2026-13-01"],
  [{ kind: "cardio", sheet: [], until: "Nov 5" }, "until must be YYYY-MM-DD, got Nov 5"],
  [
    { kind: "cardio", sheet: [], since: "2026-11-05", until: "2026-11-01" },
    "since 2026-11-05 is after until 2026-11-01",
  ],
  [
    { kind: "pullups", sheet: [] },
    "Hevy sync has no sign-in (hevy_auth is empty): send hevy_csv, Hevy's workout export, or seed it per docs/research/hevy-data.md",
  ],
  [
    { kind: "cardio", sheet: [] },
    "Hevy sync has no sign-in (hevy_auth is empty): send hevy_csv, Hevy's workout export, or seed it per docs/research/hevy-data.md",
  ],
  [
    { kind: "cardio", sheet: [], hevy_csv: "Date,Km\n2026-11-05,5" },
    "hevy_csv is not Hevy's workout export",
  ],
  [{ kind: "squats", sheet: [] }, "invalid team challenge request"],
])("answers 400 with a one-line reason for %j", async (body, error) => {
  const res = await post(makeEnv(), body);

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error });
});

test("refuses a caller who isn't the owner", async () => {
  assert.equal((await post(makeEnv(), { kind: "cardio", sheet: [] }, STRANGER)).status, 403);
});
