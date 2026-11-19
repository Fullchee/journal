import assert from "node:assert/strict";
import { pickCelebration, type Moment } from "@/core/celebration";

// A linear congruential generator (Numerical Recipes constants), so the odds are checked on the same draws every run.
function seeded(seed: number) {
  let state = seed;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
}

const DRAWS = 30_000;

const bigShare = (moment: Moment) => {
  const random = seeded(106);
  let big = 0;

  for (let i = 0; i < DRAWS; i++) if (pickCelebration(moment, random)?.size === "big") big++;

  return big / DRAWS;
};

test("a new Check-in plays the big celebration about 1 time in 3", () => {
  assert.ok(Math.abs(bigShare("check-in") - 1 / 3) < 0.01);
});

test("a Done plays the big celebration about 1 time in 5", () => {
  assert.ok(Math.abs(bigShare("done") - 1 / 5) < 0.01);
});

test("a Streak milestone always plays the big celebration", () => {
  assert.equal(bigShare("milestone"), 1);
});

test.each(["skip", "not-done", "reschedule"] as const)("a %s plays no celebration", (moment) => {
  const random = seeded(7);

  for (let i = 0; i < 1000; i++) assert.equal(pickCelebration(moment, random), null);
});

// Answers each value in turn, so a test names every draw.
const draws =
  (...values: number[]) =>
  () =>
    values.shift() ?? 0;

test("the draw defaults to Math.random, and a milestone is always big", () => {
  assert.equal(pickCelebration("milestone").size, "big");
});

test("a draw under the odds is big, and the next draw picks the drawing", () => {
  assert.deepEqual(pickCelebration("done", draws(0.1, 0.2)), { size: "big", drawing: "sprout" });
  assert.deepEqual(pickCelebration("done", draws(0.1, 0.7)), { size: "big", drawing: "leaf" });
});

test("a draw at or over the odds plays the mini celebration", () => {
  assert.deepEqual(
    pickCelebration("done", () => 0.2),
    { size: "mini" },
  );
  assert.deepEqual(
    pickCelebration("check-in", () => 0.9),
    { size: "mini" },
  );
});

test("both drawings come up about equally often", () => {
  const random = seeded(3);
  let leaves = 0;

  for (let i = 0; i < DRAWS; i++) {
    const celebration = pickCelebration("milestone", random);

    if (celebration.size === "big" && celebration.drawing === "leaf") leaves++;
  }

  assert.ok(Math.abs(leaves / DRAWS - 1 / 2) < 0.01);
});
