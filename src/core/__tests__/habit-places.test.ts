import assert from "node:assert/strict";
import { fitsPlace, normalizePlaces, samePlace } from "@/core/habit-places";
import { makeHabit } from "./helpers/habit";

test("samePlace ignores case and surrounding spaces", () => {
  assert.equal(samePlace(" gym ", "Gym"), true);
  assert.equal(samePlace("Gym", "Work"), false);
});

test("normalizePlaces trims, drops blanks and keeps the first spelling of each place", () => {
  assert.deepEqual(normalizePlaces([" Gym ", "", "  ", "gym", "Home"]), ["Gym", "Home"]);
});

test("fitsPlace: a Habit with no Places fits every place", () => {
  assert.equal(fitsPlace(makeHabit({ places: [] }), "Work"), true);
});

test("fitsPlace: a Habit fits a place it holds, case-insensitive and trimmed", () => {
  const habit = makeHabit({ places: ["Gym", "Home"] });

  assert.equal(fitsPlace(habit, " gym "), true);
  assert.equal(fitsPlace(habit, "Work"), false);
});

test("fitsPlace: no place chosen means no filter", () => {
  assert.equal(fitsPlace(makeHabit({ places: ["Gym"] }), " "), true);
});
