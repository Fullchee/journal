import assert from "node:assert/strict";
import {
  busySpans,
  fitBlocks,
  freeWindows,
  packBlocks,
  poolOf,
  targetDay,
  type SizedTask,
} from "@/core/plan-day";

const task = (id: string, minutes: number, over: Partial<SizedTask> = {}): SizedTask => ({
  id,
  content: id,
  projectId: "home",
  sectionId: null,
  priority: 1,
  dueDate: "2026-11-06",
  minutes,
  ...over,
});

test("targetDay is today before 17:00 Toronto and tomorrow from 17:00", () => {
  assert.equal(targetDay(new Date("2026-11-06T20:59:00Z")), "2026-11-06");
  assert.equal(targetDay(new Date("2026-11-06T22:00:00Z")), "2026-11-07");
});

test("targetDay uses the Toronto date, not the UTC date", () => {
  assert.equal(targetDay(new Date("2026-11-07T03:00:00Z")), "2026-11-07");
});

test("poolOf sends only the Job project to the job pool", () => {
  assert.equal(poolOf(task("a", 30, { projectId: "6h9ggGQqPMhPGGJJ" })), "job");
  assert.equal(poolOf(task("a", 30)), "personal");
});

test("busySpans converts instants to Toronto minutes and clips to the day", () => {
  // 2026-11-06 is EST (UTC-5).
  const spans = busySpans(
    [
      { start: "2026-11-06T15:00:00Z", end: "2026-11-06T16:30:00Z" },
      { start: "2026-11-06T03:00:00Z", end: "2026-11-06T06:00:00Z" },
      { start: "2026-11-07T03:00:00Z", end: "2026-11-07T10:00:00Z" },
    ],
    "2026-11-06",
  );

  assert.deepEqual(spans, [
    { start: 0, end: 60 },
    { start: 600, end: 690 },
    { start: 1320, end: 1440 },
  ]);
});

test("busySpans drops an event that falls outside the day", () => {
  assert.deepEqual(
    busySpans([{ start: "2026-11-08T15:00:00Z", end: "2026-11-08T16:00:00Z" }], "2026-11-06"),
    [],
  );
});

test("personal free time is 07:00-22:00 minus lunch and busy time", () => {
  assert.deepEqual(freeWindows("personal", "2026-11-06", [{ start: 840, end: 900 }]), [
    { start: 420, end: 720 },
    { start: 780, end: 840 },
    { start: 900, end: 1320 },
  ]);
});

test("job free time is 09:00-17:00 on a weekday", () => {
  assert.deepEqual(freeWindows("job", "2026-11-06", []), [
    { start: 540, end: 720 },
    { start: 780, end: 1020 },
  ]);
});

test("job free time is empty on a weekend", () => {
  assert.deepEqual(freeWindows("job", "2026-11-07", []), []);
});

test("an all-day busy event empties the pool", () => {
  assert.deepEqual(freeWindows("personal", "2026-11-06", [{ start: 0, end: 1440 }]), []);
});

test("packBlocks caps a block at 90 minutes and starts a new one rather than exceed it", () => {
  const blocks = packBlocks([task("a", 60), task("b", 45), task("c", 30)]);

  assert.deepEqual(
    blocks.map((b) => [b.tasks.map((t) => t.id), b.minutes]),
    [
      [["a"], 60],
      [["b", "c"], 75],
    ],
  );
});

test("packBlocks never mixes sections, even when a block stays short", () => {
  const blocks = packBlocks([
    task("a", 20, { sectionId: "s1" }),
    task("b", 20, { sectionId: "s2" }),
  ]);

  assert.equal(blocks.length, 2);
});

test("packBlocks orders by due date then priority, and sections by their earliest task", () => {
  const blocks = packBlocks([
    task("late", 30, { sectionId: "s1", dueDate: "2026-11-08" }),
    task("low", 30, { dueDate: "2026-11-06", priority: 1 }),
    task("high", 30, { dueDate: "2026-11-06", priority: 4 }),
  ]);

  assert.deepEqual(
    blocks.map((b) => b.tasks.map((t) => t.id)),
    [["high", "low"], ["late"]],
  );
});

test("packBlocks puts a task with no due date after the dated ones", () => {
  const blocks = packBlocks([
    task("undated-a", 30, { dueDate: null, sectionId: "s1" }),
    task("undated-b", 30, { dueDate: null, sectionId: "s1" }),
    task("dated", 30, { sectionId: "s2" }),
  ]);

  assert.deepEqual(
    blocks.map((b) => b.tasks.map((t) => t.id)),
    [["dated"], ["undated-a", "undated-b"]],
  );
});

test("a task longer than the cap gets its own block", () => {
  assert.deepEqual(
    packBlocks([task("big", 120)]).map((b) => b.minutes),
    [120],
  );
});

test("fitBlocks places blocks in order into the first window with room", () => {
  const blocks = packBlocks([task("a", 60, { sectionId: "1" }), task("b", 30, { sectionId: "2" })]);

  const { placed, over } = fitBlocks(blocks, [
    { start: 540, end: 600 },
    { start: 660, end: 760 },
  ]);

  assert.deepEqual(
    placed.map((p) => [p.start, p.end]),
    [
      [540, 600],
      [660, 690],
    ],
  );
  assert.equal(over, 0);
});

test("fitBlocks reports the minutes of blocks that fit nowhere", () => {
  const blocks = packBlocks([task("a", 90), task("b", 40, { sectionId: "2" })]);
  const { placed, unplaced, over } = fitBlocks(blocks, [{ start: 540, end: 640 }]);

  assert.equal(placed.length, 1);
  assert.deepEqual(
    unplaced.map((b) => b.tasks[0]!.id),
    ["b"],
  );
  assert.equal(over, 40);
});
