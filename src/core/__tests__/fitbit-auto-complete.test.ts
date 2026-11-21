import assert from "node:assert/strict";
import {
  FITBIT_PACKAGE,
  fitbitDayTotals,
  fitbitDoneDays,
  fitbitExerciseEntries,
  fitbitFirstDay,
  fitbitExerciseSessions,
  fitbitReadFrom,
  fitbitSession,
  fitbitThreshold,
  FitbitSessionUpload,
} from "@/core/fitbit-auto-complete";

const GARMIN = "com.garmin.android.apps.connectmobile";

const session = (startTime: string, endTime: string, dataOrigin = FITBIT_PACKAGE) => ({
  startTime,
  endTime,
  metadata: { dataOrigin },
});

const steps = (startTime: string, count: number, dataOrigin = FITBIT_PACKAGE) => ({
  ...session(startTime, startTime, dataOrigin),
  count,
});

test("fitbitDayTotals adds up Fitbit's steps on each Toronto Day, leaving out other apps", () => {
  const records = [
    steps("2026-11-10T14:00:00-05:00", 5000),
    steps("2026-11-10T18:00:00-05:00", 4000),
    steps("2026-11-10T19:00:00-05:00", 9000, GARMIN),
    // 02:00 UTC on the 11th is 21:00 on the 10th in Toronto.
    steps("2026-11-11T02:00:00Z", 100),
    steps("2026-11-11T09:00:00-05:00", 300),
  ];

  assert.deepEqual(
    [...fitbitDayTotals("steps", records)],
    [
      ["2026-11-10", 9100],
      ["2026-11-11", 300],
    ],
  );
});

test("fitbitDayTotals skips records it can't read", () => {
  const records = [
    steps("2026-11-10T14:00:00-05:00", 5000),
    { ...steps("2026-11-10T15:00:00-05:00", 1), count: "many" },
    session("yesterday", "2026-11-10T15:00:00-05:00"),
    null,
  ];

  assert.deepEqual([...fitbitDayTotals("steps", records)], [["2026-11-10", 5000]]);
});

test("fitbitDayTotals puts a night on the Day it ends and keeps its longest sleep", () => {
  const records = [
    session("2026-11-09T23:00:00-05:00", "2026-11-10T06:30:00-05:00"),
    session("2026-11-10T14:00:00-05:00", "2026-11-10T14:30:00-05:00"),
    session("2026-11-10T22:00:00-05:00", "2026-11-11T07:00:00-05:00", GARMIN),
  ];

  assert.deepEqual([...fitbitDayTotals("sleep", records)], [["2026-11-10", 7.5]]);
});

test("fitbitDayTotals adds up a Day's exercise minutes by start", () => {
  const records = [
    session("2026-11-10T07:00:00-05:00", "2026-11-10T07:15:00-05:00"),
    session("2026-11-10T17:00:00-05:00", "2026-11-10T17:10:00-05:00"),
  ];

  assert.deepEqual([...fitbitDayTotals("exercise", records)], [["2026-11-10", 25]]);
});

test("fitbitDoneDays keeps the Days from the first one that reach the threshold and have no answer", () => {
  const records = [
    steps("2026-11-08T12:00:00-05:00", 9000),
    steps("2026-11-12T12:00:00-05:00", 8000),
    steps("2026-11-09T12:00:00-05:00", 8500),
    steps("2026-11-10T12:00:00-05:00", 7999),
    steps("2026-11-11T12:00:00-05:00", 12_000),
    steps("2026-11-13T12:00:00-05:00", 10_000),
  ];

  const days = fitbitDoneDays({
    rule: "steps",
    records,
    threshold: 8000,
    habit: "walk",
    from: "2026-11-09",
    // The 11th is Skipped, the 13th already Done; a cleared Day and another Habit's answer don't count.
    counts: {
      "2026-11-09": { walk: 0, read: 1 },
      "2026-11-11": { walk: -1 },
      "2026-11-13": { walk: 1 },
    },
  });

  assert.deepEqual(days, ["2026-11-09", "2026-11-12"]);
});

test("fitbitExerciseEntries logs Fitbit's sessions from the first Day as Duration entries", () => {
  const records = [
    session("2026-11-10T17:00:00-05:00", "2026-11-10T17:30:20-05:00"),
    session("2026-11-08T17:00:00-05:00", "2026-11-08T17:30:00-05:00"),
    session("2026-11-10T07:00:00-05:00", "2026-11-10T07:20:00-05:00"),
    session("2026-11-10T08:00:00-05:00", "2026-11-10T08:20:00-05:00", GARMIN),
  ];

  assert.deepEqual(fitbitExerciseEntries(records, "2026-11-09"), [
    { date: "2026-11-10", startTime: "07:00", minutes: 20 },
    { date: "2026-11-10", startTime: "17:00", minutes: 30 },
  ]);
});

test("fitbitFirstDay starts at the link's Day, then the Day before the last read", () => {
  assert.equal(fitbitFirstDay("2026-11-10", null), "2026-11-10");
  // 03:00 UTC on the 13th is the 12th in Toronto.
  assert.equal(fitbitFirstDay("2026-11-10", "2026-11-13T03:00:00Z"), "2026-11-11");
  assert.equal(fitbitFirstDay("2026-11-10", "2026-11-10T20:00:00Z"), "2026-11-10");
});

test("fitbitReadFrom reads from Toronto midnight a Day before the first Day", () => {
  assert.equal(fitbitReadFrom("2026-11-10"), "2026-11-09T05:00:00.000Z");
});

test("fitbitThreshold takes a number above zero", () => {
  assert.equal(fitbitThreshold(" 7.5 "), 7.5);
  assert.equal(fitbitThreshold("8000"), 8000);

  for (const text of ["", "  ", "0", "-3", "abc", "Infinity"])
    assert.equal(fitbitThreshold(text), null);
});

// A 30-minute run on 2026-11-10 from 07:00 Toronto time.
const RUN_START = "2026-11-10T12:00:00.000Z";
const RUN_END = "2026-11-10T12:30:00.000Z";

const exercise = (id: string, dataOrigin = FITBIT_PACKAGE, title?: string) => ({
  ...session(RUN_START, RUN_END),
  exerciseType: 56,
  metadata: { id, dataOrigin },
  ...(title !== undefined && { title }),
});

const distance = (
  startTime: string,
  endTime: string,
  inMeters: number,
  dataOrigin = FITBIT_PACKAGE,
) => ({
  ...session(startTime, endTime, dataOrigin),
  distance: { inMeters, inKilometers: inMeters / 1000 },
});

test("fitbitExerciseSessions keeps Fitbit's readable ExerciseSession records", () => {
  const run = exercise("run", FITBIT_PACKAGE, "Morning run");

  assert.deepEqual(
    fitbitExerciseSessions([run, exercise("garmin", GARMIN), { ...run, exerciseType: "RUN" }]),
    [run],
  );
});

test("fitbitSession sums Fitbit's Distance inside the session, prorating records that straddle it", () => {
  const distances = [
    distance(RUN_START, "2026-11-10T12:10:00.000Z", 2000),
    // Half of this record falls before the run starts.
    distance("2026-11-10T11:55:00.000Z", "2026-11-10T12:05:00.000Z", 1000),
    // An instant record inside counts whole; one at the end, or another app's, counts nothing.
    distance("2026-11-10T12:20:00.000Z", "2026-11-10T12:20:00.000Z", 300),
    distance(RUN_END, RUN_END, 999),
    distance(RUN_START, RUN_END, 5000, GARMIN),
  ];

  const [run] = fitbitExerciseSessions([exercise("run", FITBIT_PACKAGE, "Morning run")]);

  assert.ok(run);
  assert.deepEqual(fitbitSession(run, distances), {
    id: "run",
    exerciseType: 56,
    title: "Morning run",
    startDate: "2026-11-10",
    startTime: RUN_START,
    endTime: RUN_END,
    durationS: 1800,
    distanceM: 2800,
  });
});

test("fitbitSession gives a null distance when no Fitbit Distance falls inside, never 0", () => {
  const outside = [
    distance("2026-11-10T11:00:00.000Z", RUN_START, 500),
    distance(RUN_END, "2026-11-10T13:00:00.000Z", 500),
  ];

  const [walk] = fitbitExerciseSessions([exercise("walk")]);

  assert.ok(walk);
  assert.equal(fitbitSession(walk, outside).distanceM, null);
  assert.equal(fitbitSession(walk, []).title, null);
  assert.equal(fitbitSession(walk, [distance(RUN_START, RUN_END, 0)]).distanceM, 0);
});

test("FitbitSessionUpload takes the sessions fitbitSession builds", () => {
  const [run] = fitbitExerciseSessions([exercise("run")]);

  assert.ok(run);
  const upload = { from: "2026-11-01", sessions: [fitbitSession(run, [])] };

  assert.deepEqual(FitbitSessionUpload.parse(upload), upload);
  assert.equal(FitbitSessionUpload.safeParse({ ...upload, from: "Nov 1" }).success, false);
});
