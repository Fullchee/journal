import assert from "node:assert/strict";
import { hitRate, type PlanActionStatus } from "@/core/work/hit-rate";

// The planned actions of the four rows in work-log's data/plan-log.jsonl, and the hit_rate each stored.
const PLAN_LOG: [day: string, planned: PlanActionStatus[], stored: number | null][] = [
  ["2026-11-06", ["missed", "missed", "missed"], 0],
  ["2026-11-09", ["missed", "missed", "missed"], 0],
  ["2026-11-10", ["missed", "missed", "blocked"], 0],
  ["2026-11-11", ["pending", "pending", "pending"], null],
];

test.each(PLAN_LOG)(
  "the %s Plan scores the hit_rate plan-log.jsonl stored",
  (_, planned, stored) => {
    assert.equal(hitRate(planned), stored);
  },
);

test("a Blocked action leaves the Hit rate instead of counting as a miss", () => {
  assert.equal(hitRate(["done", "missed", "blocked"]), 0.5);
});

test("a Plan with every action done scores 1", () => {
  assert.equal(hitRate(["done", "done"]), 1);
});

test("a Plan whose every action was blocked has no Hit rate", () => {
  assert.equal(hitRate(["blocked", "blocked"]), null);
});

test("an empty Plan has no Hit rate", () => {
  assert.equal(hitRate([]), null);
});

test("a Plan still pending any action is unscored", () => {
  assert.equal(hitRate(["done", "pending"]), null);
});
