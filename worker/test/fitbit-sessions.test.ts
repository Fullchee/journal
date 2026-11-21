import assert from "node:assert/strict";
import type { Env, Json } from "@worker/lib/env";
import { syncFitbitSessions } from "@worker/lib/fitbit-sessions";
import worker, { FITBIT_SESSIONS_CRON } from "@worker/index";
import { makeEnv } from "./helpers/env";
import { sentText, urlOf } from "./helpers/fetch";

const NOW = new Date("2026-11-20T14:11:00Z");
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const connected = (): Env => ({
  ...makeEnv(),
  GOOGLE_HEALTH_CLIENT_ID: "health-id",
  GOOGLE_HEALTH_CLIENT_SECRET: "health-secret",
  GOOGLE_HEALTH_REFRESH_TOKEN: "health-refresh",
});

/** An exercise data point as the Google Health API lists it, starting on 2026-11-18 at 07:00 Toronto time. */
const session = (name: string, exercise: Record<string, Json> = {}) => ({
  name: `users/me/dataTypes/exercise/dataPoints/${name}`,
  exercise: {
    exerciseType: "RUNNING",
    displayName: "Morning run",
    interval: {
      startTime: "2026-11-18T12:00:00Z",
      endTime: "2026-11-18T12:30:00Z",
      startUtcOffset: "-18000s",
      endUtcOffset: "-18000s",
      civilStartTime: { date: { year: 2026, month: 11, day: 18 }, time: { hours: 7 } },
    },
    activeDuration: "1830s",
    metricsSummary: { distanceMillimeters: 5_012_345, caloriesKcal: 320 },
    exerciseMetadata: { hasGps: true },
    ...exercise,
  },
});

const distancePoint = (millimeters: string | number) => ({
  name: "users/me/dataTypes/distance/dataPoints/d",
  distance: {
    interval: { startTime: "2026-11-18T12:01:00Z", endTime: "2026-11-18T12:02:00Z" },
    millimeters,
  },
});

interface FakeHealth {
  /** Pages of exercise data points, served in order through `nextPageToken`. */
  exercisePages?: Json[][];
  distance?: Json[];
  token?: () => Response;
  /** Overrides the answer to a data point list of this type. */
  fail?: string;
}

const granted = () => Response.json({ access_token: "health-access" });

/** One page of `pages`, picked by `pageToken`; proto3 JSON leaves out empty fields, such as the last page's token. */
function exercisePage(pages: Json[][], url: URL) {
  const page = Number(url.searchParams.get("pageToken") ?? "0");
  const points = pages[page] ?? [];

  return Response.json({
    ...(points.length > 0 && { dataPoints: points }),
    ...(page < pages.length - 1 && { nextPageToken: String(page + 1) }),
  });
}

/** Serves Google's token endpoint and the dataPoints list, recording every call. */
function fakeHealth({ exercisePages = [[]], distance = [], token = granted, fail }: FakeHealth) {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];

  const answer = (url: URL) => {
    if (url.href === TOKEN_URL) return token();
    const dataType = url.pathname.split("/").at(-2);

    if (dataType === fail) return new Response("boom", { status: 503 });

    return dataType === "distance"
      ? Response.json({ dataPoints: distance })
      : exercisePage(exercisePages, url);
  };

  const fetcher: typeof fetch = (input, init) => {
    const url = new URL(urlOf(input));
    calls.push({ url, init });

    return Promise.resolve(answer(url));
  };

  return { fetcher, calls };
}

interface StoredSession {
  name: string;
  exercise_type: string;
  display_name: string | null;
  start_date: string;
  start_time: string;
  end_time: string;
  active_duration_s: number | null;
  has_gps: number | null;
  distance_mm: number | null;
  distance_source: string | null;
  synced_at: string;
}

const stored = async (env: Env) =>
  (await env.DB.prepare("SELECT * FROM fitbit_sessions ORDER BY name").bind().all<StoredSession>())
    .results;

const listCalls = (calls: { url: URL }[], dataType: string) =>
  calls.filter(({ url }) => url.pathname.endsWith(`/${dataType}/dataPoints`));

let errors: jest.SpyInstance;

beforeEach(() => {
  errors = jest.spyOn(console, "error").mockImplementation(() => null);
});

afterEach(() => {
  errors.mockRestore();
});

const loggedErrors = () => Array.from(errors.mock.calls, (args) => String(args[0]));

test("stores each watch session with its summary distance and details", async () => {
  const env = connected();
  const { fetcher, calls } = fakeHealth({ exercisePages: [[session("run-1")]] });

  await syncFitbitSessions(env, NOW, fetcher);

  assert.deepEqual(await stored(env), [
    {
      name: "users/me/dataTypes/exercise/dataPoints/run-1",
      exercise_type: "RUNNING",
      display_name: "Morning run",
      start_date: "2026-11-18",
      start_time: "2026-11-18T12:00:00Z",
      end_time: "2026-11-18T12:30:00Z",
      active_duration_s: 1830,
      has_gps: 1,
      distance_mm: 5_012_345,
      distance_source: "summary",
      synced_at: NOW.toISOString(),
    },
  ]);
  assert.deepEqual(listCalls(calls, "distance"), []);
  assert.deepEqual(loggedErrors(), []);
});

test("asks for the watch's sessions from the last 14 Days with a fresh access token", async () => {
  const { fetcher, calls } = fakeHealth({});

  await syncFitbitSessions(connected(), NOW, fetcher);

  const [tokenCall, list] = calls;

  assert.ok(tokenCall);
  assert.ok(list);
  const sent = new URLSearchParams(sentText(tokenCall.init));

  assert.deepEqual(Object.fromEntries(sent), {
    client_id: "health-id",
    client_secret: "health-secret",
    refresh_token: "health-refresh",
    grant_type: "refresh_token",
  });
  assert.equal(list.url.pathname, "/v4/users/me/dataTypes/exercise/dataPoints");
  assert.deepEqual(Object.fromEntries(list.url.searchParams), {
    filter: 'exercise.interval.civil_start_time >= "2026-11-06"',
    dataSourceFamily: "users/me/dataSourceFamilies/google-wearables",
    pageSize: "25",
  });
  assert.equal(new Headers(list.init?.headers).get("authorization"), "Bearer health-access");
});

test("follows nextPageToken through every page", async () => {
  const env = connected();

  const { fetcher, calls } = fakeHealth({
    exercisePages: [[session("a"), session("b")], [session("c")]],
  });

  await syncFitbitSessions(env, NOW, fetcher);

  assert.deepEqual(
    listCalls(calls, "exercise").map(({ url }) => url.searchParams.get("pageToken")),
    [null, "1"],
  );
  assert.equal((await stored(env)).length, 3);
});

test("a re-fetched session updates its row instead of adding one", async () => {
  const env = connected();
  await syncFitbitSessions(env, NOW, fakeHealth({ exercisePages: [[session("run-1")]] }).fetcher);
  const later = new Date("2026-11-21T14:11:00Z");

  await syncFitbitSessions(
    env,
    later,
    fakeHealth({
      exercisePages: [[session("run-1", { displayName: "Tempo run", exerciseType: "TREADMILL" })]],
    }).fetcher,
  );

  const rows = await stored(env);

  assert.deepEqual(
    rows.map((row) => [row.display_name, row.exercise_type, row.synced_at]),
    [["Tempo run", "TREADMILL", later.toISOString()]],
  );
});

test("an empty re-fetch deletes the window's sessions but keeps older rows", async () => {
  const env = connected();

  await syncFitbitSessions(
    env,
    NOW,
    fakeHealth({ exercisePages: [[session("run-1"), session("walk-1")]] }).fetcher,
  );
  await env.DB.prepare(
    "UPDATE fitbit_sessions SET start_date = '2026-11-05' WHERE name LIKE '%/run-1'",
  )
    .bind()
    .run();

  await syncFitbitSessions(env, NOW, fakeHealth({}).fetcher);

  assert.deepEqual(
    (await stored(env)).map((row) => row.name),
    ["users/me/dataTypes/exercise/dataPoints/run-1"],
  );
});

test("a session the API no longer lists is deleted, and the rest stay", async () => {
  const env = connected();
  const both = [[session("run-1"), session("walk-1")]];
  await syncFitbitSessions(env, NOW, fakeHealth({ exercisePages: both }).fetcher);

  await syncFitbitSessions(env, NOW, fakeHealth({ exercisePages: [[session("walk-1")]] }).fetcher);

  assert.deepEqual(
    (await stored(env)).map((row) => row.name),
    ["users/me/dataTypes/exercise/dataPoints/walk-1"],
  );
});

test("without a summary distance, sums the watch's distance points inside the session", async () => {
  const env = connected();

  const { fetcher, calls } = fakeHealth({
    exercisePages: [[session("walk-1", { exerciseType: "WALKING", metricsSummary: {} })]],
    distance: [distancePoint("1200000"), distancePoint(800_500)],
  });

  await syncFitbitSessions(env, NOW, fetcher);

  const rows = await stored(env);

  const distanceQueries = listCalls(calls, "distance").map(({ url }) =>
    Object.fromEntries(url.searchParams),
  );

  assert.deepEqual(
    rows.map((row) => [row.distance_mm, row.distance_source]),
    [[2_000_500, "points"]],
  );
  assert.deepEqual(distanceQueries, [
    {
      filter:
        'distance.interval.start_time >= "2026-11-18T12:00:00Z" AND distance.interval.start_time < "2026-11-18T12:30:00Z"',
      dataSourceFamily: "users/me/dataSourceFamilies/google-wearables",
      pageSize: "10000",
    },
  ]);
});

test("a session with no distance anywhere stores none, and optional fields left out store null", async () => {
  const env = connected();

  const { fetcher } = fakeHealth({
    exercisePages: [
      [
        {
          name: "users/me/dataTypes/exercise/dataPoints/yoga-1",
          exercise: {
            exerciseType: "YOGA",
            interval: {
              startTime: "2026-11-19T23:30:00Z",
              endTime: "2026-11-20T00:15:00Z",
              civilStartTime: { date: { year: 2026, month: 11, day: 19 } },
            },
          },
        },
      ],
    ],
  });

  await syncFitbitSessions(env, NOW, fetcher);

  assert.deepEqual(await stored(env), [
    {
      name: "users/me/dataTypes/exercise/dataPoints/yoga-1",
      exercise_type: "YOGA",
      display_name: null,
      start_date: "2026-11-19",
      start_time: "2026-11-19T23:30:00Z",
      end_time: "2026-11-20T00:15:00Z",
      active_duration_s: null,
      has_gps: null,
      distance_mm: null,
      distance_source: null,
      synced_at: NOW.toISOString(),
    },
  ]);
});

test("an indoor session stores has_gps as 0", async () => {
  const env = connected();

  const { fetcher } = fakeHealth({
    exercisePages: [
      [session("bike-1", { exerciseType: "BIKING", exerciseMetadata: { hasGps: false } })],
    ],
  });

  await syncFitbitSessions(env, NOW, fetcher);

  const rows = await stored(env);

  assert.deepEqual(
    rows.map((row) => row.has_gps),
    [0],
  );
});

test("a refresh-token failure logs one clear error and leaves stored rows untouched", async () => {
  const env = connected();
  await syncFitbitSessions(env, NOW, fakeHealth({ exercisePages: [[session("run-1")]] }).fetcher);
  const before = await stored(env);

  const { fetcher, calls } = fakeHealth({
    token: () => Response.json({ error: "invalid_grant" }, { status: 400 }),
  });

  await syncFitbitSessions(env, new Date("2026-11-21T14:11:00Z"), fetcher);

  assert.deepEqual(await stored(env), before);
  assert.equal(calls.length, 1);
  assert.deepEqual(loggedErrors(), [
    "Google Health sign-in failed: the token endpoint answered 400 (invalid_grant). Mint a new Google Health refresh token and run `wrangler secret put GOOGLE_HEALTH_REFRESH_TOKEN`.",
  ]);
});

test("a token answer without a JSON error still names the status", async () => {
  const { fetcher } = fakeHealth({ token: () => new Response("oops", { status: 500 }) });

  await syncFitbitSessions(connected(), NOW, fetcher);

  assert.match(loggedErrors().join("\n"), /answered 500\. Mint a new/);
});

test("without the secrets, the sync logs why and calls nothing", async () => {
  const env = makeEnv();
  const { fetcher, calls } = fakeHealth({});

  await syncFitbitSessions(env, NOW, fetcher);

  assert.deepEqual(calls, []);
  assert.match(loggedErrors().join("\n"), /Google Health skipped: its secrets are not set/);
});

test("a failed distance read stops the sync before any write", async () => {
  const env = connected();

  const { fetcher } = fakeHealth({
    exercisePages: [[session("run-1"), session("walk-1", { metricsSummary: {} })]],
    fail: "distance",
  });

  await syncFitbitSessions(env, NOW, fetcher);

  assert.deepEqual(await stored(env), []);
  assert.deepEqual(loggedErrors(), [
    "Fitbit session sync stopped: Error: distance dataPoints answered 503",
  ]);
});

test("a malformed session stops the sync with the parse error", async () => {
  const env = connected();

  const { fetcher } = fakeHealth({
    exercisePages: [[session("run-1", { activeDuration: "half an hour" })]],
  });

  await syncFitbitSessions(env, NOW, fetcher);

  assert.deepEqual(await stored(env), []);
  assert.match(loggedErrors().join("\n"), /^Fitbit session sync stopped: /);
});

test("the Worker's Fitbit cron runs the session sync in waitUntil", async () => {
  const pending: Promise<unknown>[] = [];

  worker.scheduled({ cron: FITBIT_SESSIONS_CRON, scheduledTime: NOW.getTime() }, makeEnv(), {
    waitUntil: (promise) => {
      pending.push(promise);
    },
  });

  await Promise.all(pending);
  assert.equal(pending.length, 1);
  assert.match(loggedErrors().join("\n"), /Google Health skipped/);
});

test("a cron with no job logs it and runs nothing", () => {
  const pending: Promise<unknown>[] = [];

  worker.scheduled({ cron: "0 0 * * *", scheduledTime: NOW.getTime() }, makeEnv(), {
    waitUntil: (promise) => {
      pending.push(promise);
    },
  });

  assert.deepEqual(pending, []);
  assert.deepEqual(loggedErrors(), ['No job runs on cron "0 0 * * *"; add it to CRON_JOBS.']);
});
