import assert from "node:assert/strict";
import { activityRows } from "@/core/activity-summary";

type Day = Parameters<typeof activityRows>[0][number];

const day = (extra: Partial<Day> = {}): Day => ({
  steps: 8000,
  moderateMin: 10,
  vigorousMin: 5,
  restingHr: 55,
  avgStress: 30,
  ...extra,
});

test("rows average each metric over the period, counting vigorous minutes twice", () => {
  assert.deepEqual(activityRows([day(), day({ steps: 10_000 })], [], "the week before"), [
    { label: "Steps a day", value: "9,000", trend: "" },
    { label: "Intensity minutes a week", value: "140 min", trend: "" },
    { label: "Resting heart rate", value: "55 bpm", trend: "" },
    { label: "Stress", value: "30 of 100", trend: "" },
  ]);
});

test("rows compare each metric with the period before", () => {
  const before = [day({ steps: 10_000, moderateMin: 0, vigorousMin: 0, restingHr: 58 })];

  assert.deepEqual(
    activityRows([day()], before, "the week before").map((r) => r.trend),
    [
      "2,000 fewer than the week before",
      "140 more than the week before",
      "3 lower than the week before",
      "same as the week before",
    ],
  );
});

test("a metric missing on every day of the period has no row", () => {
  const rows = activityRows([day({ restingHr: null, avgStress: null })], [], "");

  assert.deepEqual(
    rows.map((r) => r.label),
    ["Steps a day", "Intensity minutes a week"],
  );
});

test("days missing a metric are left out of its average, not counted as zero", () => {
  const stress = activityRows([day({ avgStress: 40 }), day({ avgStress: null })], [], "")[3];

  assert.equal(stress?.value, "40 of 100");
});

test("a day with neither intensity count has no intensity minutes", () => {
  const rows = activityRows([day({ moderateMin: null, vigorousMin: null })], [], "");

  assert.ok(rows.every((r) => r.label !== "Intensity minutes a week"));
});

const intensity = (extra: Partial<Day>) => activityRows([day(extra)], [], "")[1]?.value;

test("a day with only one intensity count still has intensity minutes", () => {
  assert.equal(intensity({ moderateMin: null, vigorousMin: 5 }), "70 min");
  assert.equal(intensity({ moderateMin: 10, vigorousMin: null }), "70 min");
});

test("a period with no days has no rows", () => {
  assert.deepEqual(activityRows([], [day()], "the week before"), []);
});
