import assert from "node:assert/strict";
import { MISSED } from "@/core/habit-day";
import { skipChange } from "@/core/skip";

test("a cause on a Not done day sets the Skip", () => {
  assert.deepEqual(skipChange(MISSED, "outside"), { kind: "set", cause: "outside" });
});

test("a Not done day with no cause keeps the Skip already given", () => {
  assert.deepEqual(skipChange(MISSED, undefined), { kind: "keep" });
});

test("any other answer or a clear drops the Skip", () => {
  assert.deepEqual(
    [skipChange(0, undefined), skipChange(0, "outside"), skipChange(1, undefined)],
    [{ kind: "clear" }, { kind: "clear" }, { kind: "clear" }],
  );
});
