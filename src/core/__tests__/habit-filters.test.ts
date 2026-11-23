import assert from "node:assert/strict";
import { filterHabits, filtersFromParams, type HabitFilters } from "@/core/habit-filters";
import { makeHabit } from "./helpers/habit";

// With no params every filter is unset.
const blankFilters = () => filtersFromParams(new URLSearchParams());

test("filterHabits with blank filters keeps every habit", () => {
  const habits = [makeHabit({ id: "a" }), makeHabit({ id: "b", stage: "tree" })];
  assert.equal(filterHabits(habits, blankFilters()).length, 2);
});

test("filterHabits matches enum columns", () => {
  const habits = [
    makeHabit({ id: "a" }),
    makeHabit({ id: "b", stage: "tree", priority: "high", active: false, record: "count" }),
  ];

  assert.deepEqual(
    filterHabits(habits, { ...blankFilters(), stage: "tree" }).map((h) => h.id),
    ["b"],
  );
  assert.deepEqual(
    filterHabits(habits, { ...blankFilters(), priority: "normal" }).map((h) => h.id),
    ["a"],
  );
  assert.deepEqual(
    filterHabits(habits, { ...blankFilters(), active: "no" }).map((h) => h.id),
    ["b"],
  );
  assert.deepEqual(
    filterHabits(habits, { ...blankFilters(), record: "count" }).map((h) => h.id),
    ["b"],
  );
  assert.deepEqual(
    filterHabits(habits, { ...blankFilters(), targetType: "weekly" }).map((h) => h.id),
    [],
  );
});

test("filterHabits matches links, dates and text case-insensitively", () => {
  const habits = [
    makeHabit({ id: "a", startDate: "2026-10-01" }),
    makeHabit({ id: "b", startDate: "2026-11-01", stackedAfter: "a" }),
    makeHabit({ id: "c" }),
  ];

  const ids = (over: Partial<HabitFilters>) =>
    filterHabits(habits, { ...blankFilters(), ...over }).map((h) => h.id);

  assert.deepEqual(ids({ stackedAfter: "has" }), ["b"]);
  assert.deepEqual(ids({ stackedAfter: "none" }), ["a", "c"]);
  assert.deepEqual(ids({ startFrom: "2026-10-15" }), ["b"]);
  assert.deepEqual(ids({ startTo: "2026-10-15" }), ["a"]);
});

test("filterHabits matches kind", () => {
  const habits = [makeHabit({ id: "a" }), makeHabit({ id: "b", kind: "bad" })];

  const ids = (over: Partial<HabitFilters>) =>
    filterHabits(habits, { ...blankFilters(), ...over }).map((h) => h.id);

  assert.deepEqual(ids({ kind: "bad" }), ["b"]);
});

test("filtersFromParams reads every set filter", () => {
  const filters: HabitFilters = {
    ...blankFilters(),
    kind: "good",
    stage: "sprout",
    active: "no",
    stackedAfter: "has",
    startFrom: "2026-01-01",
    startTo: "2026-02-01",
  };

  const params = new URLSearchParams(
    "kind=good&stage=sprout&active=no&stackedAfter=has&startFrom=2026-01-01&startTo=2026-02-01",
  );

  assert.deepEqual(filtersFromParams(params), filters);
});

test.each([
  ["kind", "bad"],
  ["active", "yes"],
  ["stage", "tree"],
  ["priority", "low"],
  ["targetType", "days"],
  ["record", "count"],
  ["stackedAfter", "none"],
  ["stackedAfter", "has"],
] as const)("filtersFromParams reads %s=%s", (key, value) => {
  const params = new URLSearchParams({ [key]: value });

  assert.deepEqual(filtersFromParams(params), { ...blankFilters(), [key]: value });
});

test("filtersFromParams drops unknown values and bad dates", () => {
  const params = new URLSearchParams("kind=weeds&stage=oak&startFrom=soon&text=x");

  assert.deepEqual(filtersFromParams(params), blankFilters());
});
