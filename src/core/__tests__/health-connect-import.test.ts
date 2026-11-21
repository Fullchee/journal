import assert from "node:assert/strict";
import {
  HEALTH_CONNECT_ORIGINS,
  HealthConnectSession,
  healthConnectReadFrom,
  sourceSessions,
} from "@/core/health-connect-import";

const CALM_PACKAGE: string = HEALTH_CONNECT_ORIGINS.calm.package;

const calmSessions = (sessions: Parameters<typeof sourceSessions>[1]) =>
  sourceSessions("calm", sessions);

const session = (startTime: string, endTime: string, dataOrigin = CALM_PACKAGE) => ({
  startTime,
  endTime,
  metadata: { dataOrigin },
});

test("calmSessions logs each Calm session on its Toronto Day and clock, earliest first", () => {
  const sessions = [
    session("2026-11-05T12:30:00.000Z", "2026-11-05T12:40:00.000Z"),
    session("2026-11-04T23:00:00Z", "2026-11-04T23:15:30Z"),
  ];

  assert.deepEqual(calmSessions(sessions), [
    { date: "2026-11-04", startTime: "18:00", minutes: 16 },
    { date: "2026-11-05", startTime: "07:30", minutes: 10 },
  ]);
});

test("calmSessions puts a late-night UTC session on the Toronto Day it started", () => {
  assert.deepEqual(calmSessions([session("2026-11-06T03:30:00Z", "2026-11-06T03:50:00Z")]), [
    { date: "2026-11-05", startTime: "22:30", minutes: 20 },
  ]);
});

test("sourceSessions leaves out other apps' sessions", () => {
  const sessions = [
    session("2026-11-05T12:30:00Z", "2026-11-05T12:40:00Z", "com.spotlightsix.zentimerlite2"),
    session("2026-11-05T13:30:00Z", "2026-11-05T13:40:00Z"),
  ];

  assert.deepEqual(calmSessions(sessions), [
    { date: "2026-11-05", startTime: "08:30", minutes: 10 },
  ]);
});

test("calmSessions keeps one entry for two sessions that start the same minute", () => {
  const sessions = [
    session("2026-11-05T12:30:00Z", "2026-11-05T12:40:00Z"),
    session("2026-11-05T12:30:20Z", "2026-11-05T12:45:00Z"),
  ];

  assert.deepEqual(calmSessions(sessions), [
    { date: "2026-11-05", startTime: "07:30", minutes: 15 },
  ]);
});

test.each([
  ["under_a_minute", "2026-11-05T12:30:10Z", 1],
  ["over_a_day", "2026-11-07T12:30:00Z", 1440],
])("calmSessions keeps minutes within a Duration entry's range: %s", (_id, end, minutes) => {
  assert.equal(calmSessions([session("2026-11-05T12:30:00Z", end)])[0]?.minutes, minutes);
});

test("HealthConnectSession reads a Health Connect record, dropping fields a Duration entry doesn't need", () => {
  const record = {
    recordType: "MindfulnessSession",
    mindfulnessSessionType: 1,
    ...session("2026-11-05T12:30:00Z", "2026-11-05T12:40:00Z"),
  };

  assert.deepEqual(
    HealthConnectSession.parse(record),
    session("2026-11-05T12:30:00Z", "2026-11-05T12:40:00Z"),
  );
});

test.each([
  ["no_origin", { startTime: "2026-11-05T12:30:00Z", endTime: "2026-11-05T12:40:00Z" }],
  ["bad_time", session("yesterday", "2026-11-05T12:40:00Z")],
  ["not_a_record", "MindfulnessSession"],
])("HealthConnectSession refuses a record it can't read: %s", (_id, record) => {
  assert.equal(HealthConnectSession.safeParse(record).success, false);
});

test("healthConnectReadFrom starts a first read 30 days back, as far as Health Connect allows", () => {
  assert.equal(
    healthConnectReadFrom(null, new Date("2026-11-11T12:00:00Z")),
    "2026-10-12T12:00:00.000Z",
  );
});

test("healthConnectReadFrom overlaps the last read by a day, so a late-synced session still arrives", () => {
  assert.equal(
    healthConnectReadFrom("2026-11-10T08:00:00.000Z", new Date("2026-11-11T12:00:00Z")),
    "2026-11-09T08:00:00.000Z",
  );
});

test("sourceSessions logs Hevy's workouts and leaves out Calm's", () => {
  const sessions = [
    session("2026-11-05T22:48:00Z", "2026-11-06T01:09:00Z", HEALTH_CONNECT_ORIGINS.hevy.package),
    session("2026-11-05T12:30:00Z", "2026-11-05T12:40:00Z"),
  ];

  assert.deepEqual(sourceSessions("hevy", sessions), [
    { date: "2026-11-05", startTime: "17:48", minutes: 141 },
  ]);
});
