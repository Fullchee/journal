import assert from "node:assert/strict";
import { fitsPlace, normalizePlaces, replaceCandidates, samePlace } from "@/core/habit-places";
import type { Habit } from "@/core/habits-view";
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

const BAD = [
  makeHabit({ id: "gym-snack", kind: "bad", places: ["Gym"] }),
  makeHabit({ id: "work-scroll", kind: "bad", places: ["Work"] }),
  makeHabit({ id: "anywhere", kind: "bad", places: [] }),
  makeHabit({ id: "good", kind: "good", places: [] }),
];

const candidateIds = (draft: Partial<Habit>) =>
  replaceCandidates(BAD, makeHabit(draft)).map((habit) => habit.id);

test("replaceCandidates: a good Habit tagged Gym lists bad Habits tagged Gym or untagged", () => {
  assert.deepEqual(candidateIds({ places: ["gym"] }), ["gym-snack", "anywhere"]);
});

test("replaceCandidates: an untagged good Habit lists every bad Habit", () => {
  assert.deepEqual(candidateIds({ places: [] }), ["gym-snack", "work-scroll", "anywhere"]);
});

test("replaceCandidates keeps the current pick when it no longer shares a place", () => {
  assert.deepEqual(candidateIds({ places: ["Gym"], replaces: "work-scroll" }), [
    "gym-snack",
    "work-scroll",
    "anywhere",
  ]);
});

test("replaceCandidates leaves out the Habit itself", () => {
  assert.deepEqual(candidateIds({ id: "anywhere", kind: "bad" }), ["gym-snack", "work-scroll"]);
});
