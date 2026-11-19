import assert from "node:assert/strict";
import { OBSTACLES } from "@/core/habit-obstacles";

test("each built-in obstacle appears once, so every suggestion chip shows", () => {
  assert.equal(new Set(OBSTACLES).size, OBSTACLES.length);
});
