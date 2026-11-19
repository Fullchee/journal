import assert from "node:assert/strict";
import { fixHolds } from "@/core/check-in-location";

const SAVED = "2026-11-02T14:00:00.000Z";

test("fixHolds keeps a fix for an hour either side of when it was taken", () => {
  assert.equal(fixHolds("2026-11-02T15:00:00.000Z", SAVED), true);
  assert.equal(fixHolds("2026-11-02T13:00:00.000Z", SAVED), true);
  assert.equal(fixHolds("2026-11-02T15:01:00.000Z", SAVED), false);
  assert.equal(fixHolds("2026-11-01T14:00:00.000Z", SAVED), false);
});
