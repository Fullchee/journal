import assert from "node:assert/strict";
import { clampMinutes, csvRows, oncePerStart } from "@/core/csv-import";

test("csvRows splits rows and cells, keeping a trailing cell without a newline", () => {
  assert.deepEqual(csvRows("a,b\nc,"), [
    ["a", "b"],
    ["c", ""],
  ]);
});

test("csvRows reads an unclosed quote to the end of the text", () => {
  assert.deepEqual(csvRows('"a,b'), [["a,b"]]);
});

test("csvRows reads a doubled quote inside a quoted cell as one quote", () => {
  assert.deepEqual(csvRows('"say ""hi""",x'), [['say "hi"', "x"]]);
});

test.each([
  [0.2, 1],
  [12.4, 12],
  [2000, 1440],
])("clampMinutes(%d) is %d", (minutes, clamped) => {
  assert.equal(clampMinutes(minutes), clamped);
});

test("oncePerStart keeps the last entry for each start, earliest first", () => {
  assert.deepEqual(
    oncePerStart([
      { date: "2026-11-05", startTime: "08:00", minutes: 10 },
      { date: "2026-11-04", startTime: "08:00", minutes: 5 },
      { date: "2026-11-05", startTime: "08:00", minutes: 12 },
    ]),
    [
      { date: "2026-11-04", startTime: "08:00", minutes: 5 },
      { date: "2026-11-05", startTime: "08:00", minutes: 12 },
    ],
  );
});
