import assert from "node:assert/strict";
import { clockTime, minutesPast18, sleepRows, sleepSummary } from "@/core/sleep-summary";

const night = (date: string, time: string) => ({ date, sleepStart: `${date}T${time}` });

// One night per day of November from `firstDay`, at each of `times`.
const week = (firstDay: number, times: string[]) =>
  times.map((time, i) => night(`2026-11-${String(firstDay + i).padStart(2, "0")}`, time));

test("bedtimes map to minutes past 18:00, carrying past midnight", () => {
  assert.equal(minutesPast18("2026-11-01T23:00"), 300);
  assert.equal(minutesPast18("2026-11-02T00:30"), 390);
  assert.equal(minutesPast18("2026-11-02T01:15:00"), 435);
  assert.equal(minutesPast18("2026-11-02T00:10") - minutesPast18("2026-11-01T23:50"), 20);
});

test("minutes past 18:00 read as a 12-hour clock time", () => {
  assert.deepEqual(
    [300, 342, 360, 390, 1080 - 1].map((minutes) => clockTime(minutes)),
    ["11:00 PM", "11:42 PM", "12:00 AM", "12:30 AM", "11:59 AM"],
  );
});

test("there is no summary without at least two nights", () => {
  assert.equal(sleepSummary([]), null);
  assert.equal(sleepSummary([night("2026-11-01", "23:00")]), null);
});

test("23:50 and 00:10 average to midnight, 10 minutes apart", () => {
  const summary = sleepSummary([night("2026-11-01", "23:50"), night("2026-11-02", "00:10")]);

  assert.deepEqual(summary, {
    bedtime: { minutes: 360, change: null },
    spread: { minutes: 10, change: null },
  });
});

test("a period reports its change from the period before", () => {
  const before = week(1, ["23:00", "23:30", "23:00", "23:30"]);
  const latest = week(8, ["22:30", "22:30", "22:30", "22:30"]);

  const summary = sleepSummary(latest, before);

  assert.equal(summary?.bedtime.change, -45);
  assert.equal(summary.spread.change, -15);
});

test("a single night before is too little to compare with", () => {
  const summary = sleepSummary(week(8, ["22:50", "23:00"]), [night("2026-11-01", "01:00")]);

  assert.equal(summary?.bedtime.change, null);
  assert.equal(summary.spread.change, null);
});

test("rows show clock time, spread and the trend in minutes", () => {
  const summary = sleepSummary(week(8, ["22:30", "22:30"]), week(1, ["23:00", "23:30"]));

  assert.ok(summary);
  assert.deepEqual(sleepRows(summary, "the week before"), [
    { label: "Average bedtime", value: "10:30 PM", trend: "45 min earlier than the week before" },
    { label: "Bedtime varies by", value: "±0 min", trend: "15 min steadier than the week before" },
  ]);
});

test("rows show a later bedtime and a wider spread as later and less steady", () => {
  const summary = sleepSummary(week(8, ["23:00", "23:30"]), week(1, ["22:30", "22:30"]));

  assert.ok(summary);
  assert.deepEqual(
    sleepRows(summary, "the week before").map((r) => r.trend),
    ["45 min later than the week before", "15 min less steady than the week before"],
  );
});

test("rows say same when the change rounds to zero, and nothing without a comparison", () => {
  const nights = week(1, ["23:00", "23:00"]);
  const same = sleepSummary(nights, week(8, ["23:00", "23:00"]));

  assert.ok(same);
  assert.deepEqual(
    sleepRows(same, "the month before").map((r) => r.trend),
    ["same as the month before", "same as the month before"],
  );

  const alone = sleepSummary(nights);

  assert.ok(alone);
  assert.deepEqual(
    sleepRows(alone, "the month before").map((r) => r.trend),
    ["", ""],
  );
});
