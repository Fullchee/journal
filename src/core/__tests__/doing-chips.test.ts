import assert from "node:assert/strict";
import { doingHabitNames } from "@/core/doing-chips";
import { makeHabit } from "./helpers/habit";

const timed = (name: string, active = true, places: string[] = []) =>
  makeHabit({ id: name, name, active, places, record: "duration", targetMinutes: 30 });

const doing = (...names: string[]) => names.map((name) => ({ doing: name }));

test("doingHabitNames keeps only active Timed Habits", () => {
  const habits = [
    makeHabit({ id: "meds", name: "Meds", record: "check" }),
    makeHabit({ id: "water", name: "Water", record: "count" }),
    timed("Walk"),
    timed("Old run", false),
  ];

  assert.deepEqual(doingHabitNames(habits, [], ""), ["Walk"]);
});

test("doingHabitNames puts the most named Habit first, matching case-insensitively and trimmed", () => {
  const habits = [timed("Read"), timed("Walk")];

  assert.deepEqual(doingHabitNames(habits, doing("Read", " walk ", "WALK", "Walk"), ""), [
    "Walk",
    "Read",
  ]);
});

test("doingHabitNames keeps the Habits' order on a tie and ignores names no Habit has", () => {
  const habits = [timed("Read"), timed("Walk"), timed("Yoga")];

  assert.deepEqual(doingHabitNames(habits, doing("Yoga", "Walk", "Napping", ""), ""), [
    "Walk",
    "Yoga",
    "Read",
  ]);
});

test("doingHabitNames keeps Habits tagged with the place and untagged ones, matching trimmed and case-insensitively", () => {
  const habits = [timed("Lift", true, ["Gym"]), timed("Read"), timed("Code", true, ["Work"])];

  assert.deepEqual(doingHabitNames(habits, [], " gym "), ["Lift", "Read"]);
});

test("doingHabitNames shows every active Timed Habit when no place is chosen", () => {
  const habits = [timed("Lift", true, ["Gym"]), timed("Code", true, ["Work"])];

  assert.deepEqual(doingHabitNames(habits, [], ""), ["Lift", "Code"]);
});

test("doingHabitNames falls back to every active Timed Habit when none fits the place", () => {
  const habits = [
    timed("Lift", true, ["Gym"]),
    timed("Code", true, ["Work"]),
    timed("Old", false, ["Park"]),
  ];

  assert.deepEqual(doingHabitNames(habits, [], "Park"), ["Lift", "Code"]);
});
