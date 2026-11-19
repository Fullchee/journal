import assert from "node:assert/strict";
import { workoutDuration, workoutRows, workoutType } from "@/core/workout-summary";

test("rows count each type's workouts and total their time, the most time first", () => {
  assert.deepEqual(
    workoutRows([
      { typeKey: "running", durationS: 1800 },
      { typeKey: "cycling", durationS: 2700 },
      { typeKey: "cycling", durationS: 2700 },
    ]),
    [
      { label: "Cycling", value: "2 workouts, 1h 30m", trend: "" },
      { label: "Running", value: "1 workout, 30 min", trend: "" },
    ],
  );
});

test("types with the same total time sort by name", () => {
  assert.deepEqual(
    workoutRows([
      { typeKey: "walking", durationS: 600 },
      { typeKey: "hiking", durationS: 600 },
    ]).map((r) => r.label),
    ["Hiking", "Walking"],
  );
});

test("a period without workouts has no rows", () => {
  assert.deepEqual(workoutRows([]), []);
});

test("a duration under an hour is in minutes, and an hour or more in hours and minutes", () => {
  assert.equal(workoutDuration(2690), "45 min");
  assert.equal(workoutDuration(3900), "1h 05m");
});

test("a type key reads as words", () => {
  assert.equal(workoutType("road_biking"), "Road biking");
});
