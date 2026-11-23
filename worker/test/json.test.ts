import assert from "node:assert/strict";
import { readJsonIn } from "@worker/lib/json";
import * as z from "zod/mini";

const Reply = z.object({ action: z.string() });

test("readJsonIn finds the object inside prose", () => {
  assert.deepEqual(readJsonIn('Sure: {"action":"ask"} done', Reply), { action: "ask" });
});

test("readJsonIn gives null for no object, broken JSON or the wrong shape", () => {
  assert.equal(readJsonIn("no json", Reply), null);
  assert.equal(readJsonIn("{ not json }", Reply), null);
  assert.equal(readJsonIn('{"action":1}', Reply), null);
});
