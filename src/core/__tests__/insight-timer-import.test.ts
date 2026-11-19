import assert from "node:assert/strict";
import { insightTimerSessions } from "@/core/insight-timer-import";

// INFERRED FIXTURE: columns come from community converters, not a real export.
// Replace with the header and a few rows from a real "Export Log" CSV (#128).
const HEADER = "Started At,Duration,Preset,Activity";

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

test("insightTimerSessions gives one entry per session, earliest first", () => {
  const text = csv(
    "11/05/2026 07:30:12,0:20:00,,Meditation",
    "11/03/2026 21:05:00,1:02:30,Evening,Meditation",
  );

  assert.deepEqual(insightTimerSessions(text), [
    { date: "2026-11-03", startTime: "21:05", minutes: 63 },
    { date: "2026-11-05", startTime: "07:30", minutes: 20 },
  ]);
});

test("insightTimerSessions reads unpadded dates, missing seconds, CRLF and quoted cells", () => {
  const text = csv('1/8/2022 7:18,0:10:00,"Morning, quiet",Meditation\r', "");

  assert.deepEqual(insightTimerSessions(text), [
    { date: "2022-01-08", startTime: "07:18", minutes: 10 },
  ]);
});

test("insightTimerSessions keeps one entry when a session repeats", () => {
  const row = "11/05/2026 07:30:12,0:20:00,,Meditation";

  assert.equal(insightTimerSessions(csv(row, row))?.length, 1);
});

test("insightTimerSessions finds the header below a title line", () => {
  const text = [
    "Insight Timer session log",
    HEADER,
    "11/05/2026 07:30:12,0:20:00,,Meditation",
  ].join("\n");

  assert.equal(insightTimerSessions(text)?.length, 1);
});

test.each([
  ["under_a_minute", "0:00:20", 1],
  ["over_a_day", "30:00:00", 1440],
])(
  "insightTimerSessions keeps minutes within a Duration entry's range: %s",
  (_id, duration, minutes) => {
    const text = csv(`11/05/2026 07:30:12,${duration},,Meditation`);

    assert.equal(insightTimerSessions(text)?.[0]?.minutes, minutes);
  },
);

test.each([
  ["bad_month", "13/05/2026 07:30:12,0:20:00"],
  ["iso_start", "2026-11-05T07:30:12,0:20:00"],
  ["bad_hour", "11/05/2026 24:30:12,0:20:00"],
  ["no_such_day", "2/30/2026 07:30,0:20:00"],
  ["bad_start_seconds", "11/05/2026 07:30:61,0:20:00"],
  ["minutes_duration", "11/05/2026 07:30:12,20"],
  ["bad_seconds", "11/05/2026 07:30:12,0:20:60"],
  ["empty_start", ",0:20:00"],
  ["short_row", "11/05/2026 07:30:12"],
])("insightTimerSessions skips a malformed row: %s", (_id, row) => {
  assert.deepEqual(insightTimerSessions(csv(row)), []);
});

test.each([
  ["empty", ""],
  [
    "hevy_export",
    '"title","start_time","end_time"\n"Workout","5 Nov 2026, 17:48","5 Nov 2026, 20:00"',
  ],
])("insightTimerSessions refuses a file that isn't a session log: %s", (_id, text) => {
  assert.equal(insightTimerSessions(text), null);
});
