import assert from "node:assert/strict";
import type { Json } from "@worker/lib/env";
import { REQUEST_BUDGET, SCAN_EVERY_MS, syncHevy } from "@worker/lib/hevy-sync";
import worker, { HEVY_SYNC_CRON } from "@worker/index";
import { makeD1 } from "./helpers/d1";
import { makeEnv } from "./helpers/env";
import { sentText, urlOf } from "./helpers/fetch";

const NOW = new Date("2026-11-12T07:23:00Z");
const LATER = new Date("2026-12-31T00:00:00Z").toISOString();
const PAST = new Date("2026-11-01T00:00:00Z").toISOString();
const BATCH_SIZE = 5;

type Db = ReturnType<typeof makeD1>;

type HevyWorkout = Record<string, Json> & { index: number };

/** A workout as hevy.com's export reads it; `index` doubles as its id suffix. */
const workout = (index: number, extra: Record<string, Json> = {}) => ({
  id: `w-${index}`,
  index,
  name: `Push ${index}`,
  description: "Felt strong",
  start_time: 1_794_000_000 + index * 86_400,
  end_time: 1_794_003_600 + index * 86_400,
  updated_at: "2026-11-01T00:00:00Z",
  exercises: [
    {
      title: "Bench Press (Barbell)",
      exercise_template_id: "79D0BB3A",
      notes: "Pause reps",
      superset_id: 1,
      sets: [
        {
          indicator: "warmup",
          weight_kg: 40,
          reps: 10,
          rpe: null,
          distance_meters: null,
          duration_seconds: null,
        },
        {
          indicator: "normal",
          weight_kg: 60,
          reps: 8,
          rpe: 8.5,
          distance_meters: 0,
          duration_seconds: 30,
        },
      ],
    },
  ],
  ...extra,
});

/** Every optional field left out, as an untitled cardio workout might come back. */
const bare = (index: number) => ({
  id: `w-${index}`,
  index,
  name: "Run",
  start_time: 1_794_000_000,
  end_time: 1_794_001_800,
  exercises: [{ title: "Running", sets: [{ indicator: "normal" }] }],
});

interface FakeHevy {
  workouts: HevyWorkout[];
  /** What `auth/refresh_token` answers. */
  refresh?: () => Response;
  /** Overrides the answer to one `workouts_batch/{index}` request. */
  batch?: (index: number) => Response | undefined;
}

const tokens = () =>
  Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_at: LATER });

/** Serves Hevy's web API from `hevy.workouts`, BATCH_SIZE at a time in index order, and records every call. */
function fakeHevy(hevy: FakeHevy) {
  const calls: { path: string; init: RequestInit | undefined }[] = [];

  const fetcher: typeof fetch = (input, init) => {
    const path = urlOf(input).replace("https://api.hevyapp.com/", "");
    calls.push({ path, init });

    if (path === "auth/refresh_token") return Promise.resolve((hevy.refresh ?? tokens)());
    const index = Number(path.replace("workouts_batch/", ""));

    const page = hevy.workouts
      .filter((w) => w.index >= index)
      .toSorted((a, b) => a.index - b.index)
      .slice(0, BATCH_SIZE);

    return Promise.resolve(hevy.batch?.(index) ?? Response.json(page));
  };

  return { fetcher, calls };
}

const range = (count: number) => Array.from({ length: count }, (_, i) => i);

async function seedAuth(
  db: Db,
  {
    access = "old-access",
    expires = LATER,
  }: { access?: string | null; expires?: string | null } = {},
) {
  await db
    .prepare(
      "INSERT INTO hevy_auth (id, refresh_token, access_token, expires_at) VALUES (1, 'old-refresh', ?, ?)",
    )
    .bind(access, expires)
    .run();
}

const rows = async <Row>(db: Db, sql: string) => (await db.prepare(sql).bind().all<Row>()).results;

const storedIndexes = async (db: Db) =>
  (await rows<{ index: number }>(db, 'SELECT "index" FROM hevy_workouts ORDER BY "index"')).map(
    (r) => r.index,
  );

const scanState = async (db: Db) =>
  (
    await rows<{ scan_started_at: string | null; next_index: number; finished_at: string | null }>(
      db,
      "SELECT scan_started_at, next_index, finished_at FROM hevy_scan",
    )
  )[0];

const headerOf = (init: RequestInit | undefined, name: string) =>
  new Headers(init?.headers).get(name);

let errors: jest.SpyInstance;

beforeEach(() => {
  errors = jest.spyOn(console, "error").mockImplementation(() => null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const loggedErrors = () => Array.from(errors.mock.calls, (args) => String(args[0]));

describe("tokens", () => {
  test("an unseeded hevy_auth logs how to seed it and calls nothing", async () => {
    const hevy = fakeHevy({ workouts: [workout(0)] });

    await syncHevy(makeD1(), NOW, hevy.fetcher);

    assert.deepEqual(hevy.calls, []);
    assert.match(loggedErrors().join("\n"), /hevy_auth has no row.*auth2\.0-token/);
  });

  test("an expired access token is refreshed, and the new tokens are saved before any workout request", async () => {
    const db = makeD1();
    await seedAuth(db, { expires: PAST });
    let savedBeforeFirstBatch: unknown;

    const hevy = fakeHevy({
      workouts: [workout(0)],
      batch: (index) => {
        savedBeforeFirstBatch ??= rows(db, "SELECT * FROM hevy_auth");

        return index === 0 ? undefined : Response.json([]);
      },
    });

    await syncHevy(db, NOW, hevy.fetcher);

    const expected = [
      { id: 1, refresh_token: "new-refresh", access_token: "new-access", expires_at: LATER },
    ];

    assert.deepEqual(await savedBeforeFirstBatch, expected);
    const [refresh] = hevy.calls;
    assert.ok(refresh);
    const batches = hevy.calls.slice(1);
    assert.equal(refresh.path, "auth/refresh_token");
    assert.deepEqual(JSON.parse(sentText(refresh.init)), { refresh_token: "old-refresh" });
    assert.equal(headerOf(refresh.init, "authorization"), "Bearer old-access");
    assert.equal(headerOf(refresh.init, "x-api-key"), "shelobs_hevy_web");
    assert.equal(headerOf(refresh.init, "Hevy-Platform"), "web");
    assert.ok(batches.every((c) => headerOf(c.init, "authorization") === "Bearer new-access"));
    assert.deepEqual(await storedIndexes(db), [0]);
  });

  test("a seed with only a refresh token refreshes without a bearer header", async () => {
    const db = makeD1();
    await seedAuth(db, { access: null, expires: null });
    const hevy = fakeHevy({ workouts: [] });

    await syncHevy(db, NOW, hevy.fetcher);

    assert.equal(headerOf(hevy.calls[0]?.init, "authorization"), null);
    assert.equal(hevy.calls[1]?.path, "workouts_batch/0");
  });

  test("an access token with no expiry is refreshed", async () => {
    const db = makeD1();
    await seedAuth(db, { expires: null });
    const hevy = fakeHevy({ workouts: [] });

    await syncHevy(db, NOW, hevy.fetcher);

    assert.equal(hevy.calls[0]?.path, "auth/refresh_token");
  });

  test("a current access token is used without a refresh", async () => {
    const db = makeD1();
    await seedAuth(db);
    const hevy = fakeHevy({ workouts: [] });

    await syncHevy(db, NOW, hevy.fetcher);

    assert.deepEqual(
      hevy.calls.map((c) => c.path),
      ["workouts_batch/0"],
    );
    assert.equal(headerOf(hevy.calls[0]?.init, "authorization"), "Bearer old-access");
  });

  test("a rejected refresh logs one sign-in error, keeps the stored token and reads no workouts", async () => {
    const db = makeD1();
    await seedAuth(db, { expires: PAST });

    const hevy = fakeHevy({
      workouts: [workout(0)],
      refresh: () => Response.json({ error: "Bad Request" }, { status: 400 }),
    });

    await syncHevy(db, NOW, hevy.fetcher);

    assert.deepEqual(
      hevy.calls.map((c) => c.path),
      ["auth/refresh_token"],
    );
    assert.deepEqual(loggedErrors(), [
      "Hevy sign-in failed: auth/refresh_token answered 400. Re-copy refresh_token from the auth2.0-token cookie at hevy.com and seed hevy_auth (docs/research/hevy-data.md).",
    ]);
    assert.deepEqual(
      (await rows<{ refresh_token: string }>(db, "SELECT refresh_token FROM hevy_auth"))[0],
      { refresh_token: "old-refresh" },
    );
  });

  test("a refresh that fails on Hevy's side stops the run without the sign-in advice", async () => {
    const db = makeD1();
    await seedAuth(db, { expires: PAST });
    const hevy = fakeHevy({ workouts: [], refresh: () => new Response("", { status: 503 }) });

    await syncHevy(db, NOW, hevy.fetcher);

    assert.deepEqual(loggedErrors(), ["Hevy sync stopped: Error: auth/refresh_token answered 503"]);
  });
});

describe("sync", () => {
  test("stores each workout with its sets, in exercise and set order", async () => {
    const db = makeD1();
    await seedAuth(db);

    await syncHevy(db, NOW, fakeHevy({ workouts: [workout(0), bare(1)] }).fetcher);

    assert.deepEqual(await rows(db, "SELECT * FROM hevy_workouts ORDER BY id"), [
      {
        id: "w-0",
        index: 0,
        title: "Push 0",
        start_time: "2026-11-06T21:20:00.000Z",
        end_time: "2026-11-06T22:20:00.000Z",
        description: "Felt strong",
        updated_at: "2026-11-01T00:00:00Z",
        seen_at: NOW.toISOString(),
      },
      {
        id: "w-1",
        index: 1,
        title: "Run",
        start_time: "2026-11-06T21:20:00.000Z",
        end_time: "2026-11-06T21:50:00.000Z",
        description: null,
        updated_at: null,
        seen_at: NOW.toISOString(),
      },
    ]);
    assert.deepEqual(await rows(db, "SELECT * FROM hevy_sets ORDER BY workout_id, set_index"), [
      {
        workout_id: "w-0",
        exercise_index: 0,
        set_index: 0,
        exercise_title: "Bench Press (Barbell)",
        exercise_template_id: "79D0BB3A",
        exercise_notes: "Pause reps",
        superset_id: 1,
        set_type: "warmup",
        weight_kg: 40,
        reps: 10,
        rpe: null,
        distance_m: null,
        duration_s: null,
      },
      {
        workout_id: "w-0",
        exercise_index: 0,
        set_index: 1,
        exercise_title: "Bench Press (Barbell)",
        exercise_template_id: "79D0BB3A",
        exercise_notes: "Pause reps",
        superset_id: 1,
        set_type: "normal",
        weight_kg: 60,
        reps: 8,
        rpe: 8.5,
        distance_m: 0,
        duration_s: 30,
      },
      {
        workout_id: "w-1",
        exercise_index: 0,
        set_index: 0,
        exercise_title: "Running",
        exercise_template_id: null,
        exercise_notes: null,
        superset_id: null,
        set_type: "normal",
        weight_kg: null,
        reps: null,
        rpe: null,
        distance_m: null,
        duration_s: null,
      },
    ]);
  });

  test("a history bigger than one run's budget backfills across runs with no duplicates or gaps", async () => {
    const db = makeD1();
    await seedAuth(db, { expires: PAST });
    const total = REQUEST_BUDGET * BATCH_SIZE + 12;
    const workouts = range(total).map((i) => workout(i));

    const first = fakeHevy({ workouts });
    await syncHevy(db, NOW, first.fetcher);

    assert.equal(first.calls.length, REQUEST_BUDGET);
    assert.deepEqual(await storedIndexes(db), range((REQUEST_BUDGET - 1) * BATCH_SIZE));

    const second = fakeHevy({ workouts });
    await syncHevy(db, NOW, second.fetcher);

    assert.equal(second.calls[0]?.path, `workouts_batch/${(REQUEST_BUDGET - 1) * BATCH_SIZE}`);
    assert.deepEqual(await storedIndexes(db), range(total));
    assert.deepEqual(loggedErrors(), []);
  });

  test("a daily run starts after the highest stored index", async () => {
    const db = makeD1();
    await seedAuth(db);
    // A scan finished today, so no new one is due.
    await db.exec(`UPDATE hevy_scan SET finished_at = '${NOW.toISOString()}'`);
    await syncHevy(db, NOW, fakeHevy({ workouts: [workout(0), workout(1)] }).fetcher);

    const next = fakeHevy({ workouts: [workout(0), workout(1), workout(2)] });
    await syncHevy(db, NOW, next.fetcher);

    assert.deepEqual(
      next.calls.map((c) => c.path),
      ["workouts_batch/2", "workouts_batch/3"],
    );
    assert.deepEqual(await storedIndexes(db), [0, 1, 2]);
  });

  test("a malformed workout is logged and skipped while the rest of its batch is stored", async () => {
    const db = makeD1();
    await seedAuth(db);
    const broken = workout(1, { exercises: [{ title: 7, sets: [] }] });

    await syncHevy(db, NOW, fakeHevy({ workouts: [workout(0), broken, workout(2)] }).fetcher);

    assert.deepEqual(await storedIndexes(db), [0, 2]);
    const [logged] = loggedErrors();
    assert.match(String(logged), /^Hevy workout w-1 \(index 1\) skipped:/);
    assert.match(String(logged), /exercises\[0\]\.title/);
  });

  test("a workout without an id stops the run", async () => {
    const db = makeD1();
    await seedAuth(db);

    await syncHevy(db, NOW, fakeHevy({ workouts: [{ index: 0, name: "?" }] }).fetcher);

    assert.deepEqual(await storedIndexes(db), []);
    assert.match(loggedErrors().join("\n"), /^Hevy sync stopped: .*"id"/s);
  });

  test("a failed batch request stops the run", async () => {
    const db = makeD1();
    await seedAuth(db);
    const hevy = fakeHevy({ workouts: [], batch: () => new Response("", { status: 401 }) });

    await syncHevy(db, NOW, hevy.fetcher);

    assert.deepEqual(loggedErrors(), ["Hevy sync stopped: Error: workouts_batch/0 answered 401"]);
  });

  test("a missing hevy_scan row stops the run", async () => {
    const db = makeD1();
    await seedAuth(db);
    await db.exec("DELETE FROM hevy_scan");

    await syncHevy(db, NOW, fakeHevy({ workouts: [] }).fetcher);

    assert.deepEqual(loggedErrors(), [
      "Hevy sync stopped: Error: hevy_scan has no row; migration 0007 inserts it",
    ]);
  });
});

const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60_000);

describe("full scan", () => {
  test("a run that catches up starts a scan, which the next run reads from index 0", async () => {
    const db = makeD1();
    await seedAuth(db, { expires: LATER });
    const workouts = [workout(0), workout(1)];

    await syncHevy(db, NOW, fakeHevy({ workouts }).fetcher);

    assert.deepEqual(await scanState(db), {
      scan_started_at: NOW.toISOString(),
      next_index: 0,
      finished_at: null,
    });

    const scan = fakeHevy({ workouts });
    await syncHevy(db, day(1), scan.fetcher);

    assert.equal(scan.calls[0]?.path, "workouts_batch/0");
    assert.deepEqual(await scanState(db), {
      scan_started_at: null,
      next_index: 0,
      finished_at: day(1).toISOString(),
    });
  });

  test("a scan replaces a changed workout's sets and deletes a workout Hevy no longer has", async () => {
    const db = makeD1();
    await seedAuth(db, { expires: LATER });
    await syncHevy(db, NOW, fakeHevy({ workouts: [workout(0), workout(1), workout(2)] }).fetcher);

    const edited = workout(0, {
      name: "Push (edited)",
      exercises: [{ title: "Dips", sets: [{ indicator: "failure", reps: 12 }] }],
    });

    await syncHevy(db, day(1), fakeHevy({ workouts: [edited, workout(2)] }).fetcher);

    assert.deepEqual(await rows(db, "SELECT id, title FROM hevy_workouts ORDER BY id"), [
      { id: "w-0", title: "Push (edited)" },
      { id: "w-2", title: "Push 2" },
    ]);
    assert.deepEqual(
      await rows(
        db,
        "SELECT workout_id, exercise_title, set_type FROM hevy_sets ORDER BY workout_id, set_index",
      ),
      [
        { workout_id: "w-0", exercise_title: "Dips", set_type: "failure" },
        { workout_id: "w-2", exercise_title: "Bench Press (Barbell)", set_type: "warmup" },
        { workout_id: "w-2", exercise_title: "Bench Press (Barbell)", set_type: "normal" },
      ],
    );
  });

  test("a scan bigger than one run resumes at its saved index and deletes only once it finishes", async () => {
    const db = makeD1();
    await seedAuth(db, { expires: LATER });
    const total = REQUEST_BUDGET * BATCH_SIZE + 3;
    const workouts = range(total).map((i) => workout(i));

    await syncHevy(db, NOW, fakeHevy({ workouts }).fetcher);
    await syncHevy(db, NOW, fakeHevy({ workouts }).fetcher);
    assert.equal((await scanState(db))?.scan_started_at, NOW.toISOString());

    const remaining = workouts.filter((w) => w.index !== 3);
    await syncHevy(db, day(1), fakeHevy({ workouts: remaining }).fetcher);

    assert.equal((await scanState(db))?.next_index, REQUEST_BUDGET * BATCH_SIZE + 1);
    assert.equal((await storedIndexes(db)).length, total);

    const last = fakeHevy({ workouts: remaining });
    await syncHevy(db, day(2), last.fetcher);

    assert.equal(last.calls[0]?.path, `workouts_batch/${REQUEST_BUDGET * BATCH_SIZE + 1}`);
    assert.deepEqual(
      await storedIndexes(db),
      range(total).filter((i) => i !== 3),
    );
    assert.deepEqual(
      await rows(db, "SELECT DISTINCT workout_id FROM hevy_sets WHERE workout_id = 'w-3'"),
      [],
    );
  });

  test("a scan whose read fails partway deletes nothing and resumes later", async () => {
    const db = makeD1();
    await seedAuth(db, { expires: LATER });
    const workouts = range(12).map((i) => workout(i));
    await syncHevy(db, NOW, fakeHevy({ workouts }).fetcher);

    const failing = fakeHevy({
      workouts: workouts.filter((w) => w.index !== 0),
      batch: (index) => (index > 0 ? new Response("", { status: 500 }) : undefined),
    });

    await syncHevy(db, day(1), failing.fetcher);

    assert.deepEqual(await storedIndexes(db), range(12));
    assert.equal((await scanState(db))?.scan_started_at, NOW.toISOString());
    assert.match(loggedErrors().join("\n"), /workouts_batch\/\d+ answered 500/);
  });

  test("a workout skipped as malformed during a scan is kept", async () => {
    const db = makeD1();
    await seedAuth(db, { expires: LATER });
    await syncHevy(db, NOW, fakeHevy({ workouts: [workout(0)] }).fetcher);
    assert.equal((await scanState(db))?.scan_started_at, NOW.toISOString());

    await syncHevy(db, day(1), fakeHevy({ workouts: [workout(0, { name: null })] }).fetcher);

    assert.deepEqual(await storedIndexes(db), [0]);
    assert.equal((await scanState(db))?.finished_at, day(1).toISOString());
  });

  test("no new scan starts until a week after the last one finished", async () => {
    const db = makeD1();
    await seedAuth(db, { expires: LATER });
    const workouts = [workout(0)];
    await syncHevy(db, NOW, fakeHevy({ workouts }).fetcher);
    await syncHevy(db, day(1), fakeHevy({ workouts }).fetcher);

    await syncHevy(db, day(2), fakeHevy({ workouts }).fetcher);
    assert.equal((await scanState(db))?.scan_started_at, null);

    const weekLater = new Date(day(1).getTime() + SCAN_EVERY_MS);
    await syncHevy(db, weekLater, fakeHevy({ workouts }).fetcher);
    assert.equal((await scanState(db))?.scan_started_at, weekLater.toISOString());
  });
});

test("the sync writes no Duration entries: Health Connect logs Lift weights", async () => {
  const db = makeD1();
  await seedAuth(db);

  await syncHevy(db, NOW, fakeHevy({ workouts: [workout(0)] }).fetcher);

  assert.deepEqual(await storedIndexes(db), [0]);
  assert.deepEqual(await rows(db, "SELECT id FROM habit_durations"), []);
});

const runCron = async (cron: string) => {
  const pending: Promise<unknown>[] = [];

  worker.scheduled({ cron, scheduledTime: NOW.getTime() }, makeEnv(), {
    waitUntil: (promise) => {
      pending.push(promise);
    },
  });
  await Promise.all(pending);

  return pending;
};

test("the Worker's cron runs the Hevy sync in waitUntil", async () => {
  assert.equal((await runCron(HEVY_SYNC_CRON)).length, 1);
  assert.match(loggedErrors().join("\n"), /hevy_auth has no row/);
});
