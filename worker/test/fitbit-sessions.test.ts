import assert from "node:assert/strict";
import { FITBIT_PACKAGE, fitbitExerciseSessions, fitbitSession, type FitbitSession } from "@/core";
import { onRequestPost } from "@worker/api/fitbit-sessions";
import type { Env, Json } from "@worker/lib/env";
import {
  accessHeaders,
  apiRequest,
  makeEnv,
  OWNER,
  STRANGER,
  type RequestBody,
} from "./helpers/env";

const fitbit = (id: string) => ({ id, dataOrigin: FITBIT_PACKAGE });

/** A Fitbit session as the phone builds it from Health Connect records, starting on `day` at 07:00 Toronto time. */
function session(id: string, day: string, meters: number | null, exerciseType = 56): FitbitSession {
  const startTime = `${day}T12:00:00.000Z`;
  const endTime = `${day}T12:30:00.000Z`;

  const [record] = fitbitExerciseSessions([
    { startTime, endTime, exerciseType, title: "Morning run", metadata: fitbit(id) },
  ]);

  assert.ok(record);

  const distances =
    meters === null
      ? []
      : [{ startTime, endTime, distance: { inMeters: meters }, metadata: fitbit(`d-${id}`) }];

  return fitbitSession(record, distances);
}

const post = (env: Env, body: RequestBody, email = OWNER) =>
  onRequestPost({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/fitbit-sessions", {
      body,
      headers: accessHeaders(email),
    }),
  });

const upload = (from: string, sessions: FitbitSession[]) => ({ from, sessions }) satisfies Json;

interface StoredSession {
  id: string;
  exercise_type: number;
  title: string | null;
  start_date: string;
  start_time: string;
  end_time: string;
  duration_s: number;
  distance_m: number | null;
}

const stored = async (env: Env) =>
  (await env.DB.prepare("SELECT * FROM fitbit_sessions ORDER BY id").bind().all<StoredSession>())
    .results;

test("stores each posted session with its km, and a session without Distance with a null distance", async () => {
  const env = makeEnv();

  const res = await post(
    env,
    upload("2026-11-06", [
      session("run", "2026-11-18", 5012.3),
      session("walk", "2026-11-19", null, 79),
    ]),
  );

  assert.deepEqual(await res.json(), { stored: 2 });
  assert.deepEqual(await stored(env), [
    {
      id: "run",
      exercise_type: 56,
      title: "Morning run",
      start_date: "2026-11-18",
      start_time: "2026-11-18T12:00:00.000Z",
      end_time: "2026-11-18T12:30:00.000Z",
      duration_s: 1800,
      distance_m: 5012.3,
    },
    {
      id: "walk",
      exercise_type: 79,
      title: "Morning run",
      start_date: "2026-11-19",
      start_time: "2026-11-19T12:00:00.000Z",
      end_time: "2026-11-19T12:30:00.000Z",
      duration_s: 1800,
      distance_m: null,
    },
  ]);
});

test("a re-post changes nothing, and an edited session updates in place", async () => {
  const env = makeEnv();
  const first = upload("2026-11-06", [session("run", "2026-11-18", 5000)]);

  await post(env, first);
  const before = await stored(env);

  await post(env, first);
  assert.deepEqual(await stored(env), before);

  await post(env, upload("2026-11-06", [session("run", "2026-11-18", 5100, 8)]));
  assert.deepEqual(
    (await stored(env)).map((row) => [row.exercise_type, row.distance_m]),
    [[8, 5100]],
  );
});

test("drops stored sessions in the window the phone no longer has, and keeps older ones", async () => {
  const env = makeEnv();

  await post(
    env,
    upload("2026-11-01", [session("old", "2026-11-02", 3000), session("gone", "2026-11-18", 900)]),
  );
  await post(env, upload("2026-11-06", [session("run", "2026-11-18", 5000)]));

  assert.deepEqual(
    (await stored(env)).map((row) => row.id),
    ["old", "run"],
  );
});

test("an empty upload clears the window", async () => {
  const env = makeEnv();

  await post(env, upload("2026-11-06", [session("run", "2026-11-18", 5000)]));
  await post(env, upload("2026-11-06", []));

  assert.deepEqual(await stored(env), []);
});

test("rejects a malformed upload and a caller who isn't the owner", async () => {
  const env = makeEnv();

  const bad = await post(env, { from: "2026-11-06", sessions: [{ id: "run" }] });

  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: "invalid Fitbit sessions" });
  assert.equal((await post(env, upload("2026-11-06", []), STRANGER)).status, 403);
  assert.deepEqual(await stored(env), []);
});
