import assert from "node:assert/strict";
import type { PlanTask } from "@/core/plan-day";
import {
  blocksBody,
  calendarMessage,
  formatDuration,
  initialChoices,
  planPools,
  plainTaskName,
  sizeTasks,
  survivors,
  triageBody,
} from "@/core/plan-day-view";

const task = (id: string, over: Partial<PlanTask> = {}): PlanTask => ({
  id,
  content: `Task ${id}`,
  projectId: "home",
  sectionId: null,
  priority: 1,
  dueDate: "2026-11-06",
  labels: [],
  source: "todoist",
  ...over,
});

test("initialChoices follow the proposals, and keep when there are none", () => {
  const tasks = [task("a"), task("b")];

  assert.deepEqual(initialChoices(tasks, { a: { disposition: "drop", reason: "", minutes: 30 } }), {
    a: "drop",
    b: "keep",
  });
  assert.deepEqual(initialChoices(tasks, null), { a: "keep", b: "keep" });
});

test("triageBody lists postponed and dropped ids and the day after the target", () => {
  assert.deepEqual(triageBody({ a: "postpone", b: "drop", c: "keep" }, "2026-11-30"), {
    postpone: ["a"],
    drop: ["b"],
    postponeTo: "2026-12-01",
  });
});

test("survivors are the kept tasks", () => {
  assert.deepEqual(
    survivors([task("a"), task("b")], { a: "keep", b: "postpone" }).map((t) => t.id),
    ["a"],
  );
});

test("formatDuration writes hours and minutes", () => {
  assert.equal(formatDuration(80), "1h20m");
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(120), "2h");
});

test("calendarMessage tells the user to reconnect, never that busy times are unknown", () => {
  assert.match(calendarMessage("not-connected"), /reconnect/i);
  assert.doesNotMatch(calendarMessage("not-connected"), /unknown/i);
  assert.match(calendarMessage("unreachable"), /try again/i);
});

test("planPools splits Job from personal and reports overflow per pool", () => {
  // 2026-11-06 is a Friday: Job has 09:00-12:00 and 13:00-17:00 free.
  const pools = planPools(
    [
      { ...task("home"), minutes: 60 },
      { ...task("work", { projectId: "6h9ggGQqPMhPGGJJ" }), minutes: 90 },
    ],
    [{ start: 540, end: 1020 }],
    "2026-11-06",
  );

  assert.deepEqual(
    pools.map((p) => [p.pool, p.placed.length, p.over]),
    [
      ["personal", 1, 0],
      ["job", 0, 90],
    ],
  );
});

test("blocksBody labels each placed block with its time and lists its tasks", () => {
  const [personal] = planPools([{ ...task("home"), minutes: 60 }], [], "2026-11-06");

  assert.deepEqual(blocksBody("2026-11-06", [personal!]), {
    day: "2026-11-06",
    blocks: [
      {
        label: "7:00 AM–8:00 AM block",
        start: 420,
        end: 480,
        taskIds: ["home"],
        description: "- Task home",
      },
    ],
  });
});

test("blocksBody lists task names without their Markdown", () => {
  const [personal] = planPools(
    [{ ...task("home", { content: "**Call** the [GP](https://example.com)" }), minutes: 60 }],
    [],
    "2026-11-06",
  );

  assert.equal(blocksBody("2026-11-06", [personal!]).blocks[0]?.description, "- Call the GP");
});

test("sizeTasks uses each estimate and defaults a blank one to 30 minutes", () => {
  assert.deepEqual(
    sizeTasks([task("a"), task("b")], { a: 45, b: undefined }).map((t) => t.minutes),
    [45, 30],
  );
});

test("plainTaskName drops inline Markdown and keeps the words", () => {
  assert.equal(
    plainTaskName("**Call** the *GP* about ~~meds~~ `refill`"),
    "Call the GP about meds refill",
  );
  assert.equal(
    plainTaskName("Read [the docs](https://example.com) __today__ and _soon_"),
    "Read the docs today and soon",
  );
  assert.equal(
    plainTaskName("snake_case_name stays, 2 * 3 * 4 stays"),
    "snake_case_name stays, 2 * 3 * 4 stays",
  );
});

test("blocksBody gives times only to Todoist tasks, though a Plan action still shares the block", () => {
  const sized = sizeTasks(
    [
      task("t", { projectId: "6h9ggGQqPMhPGGJJ" }),
      task("merge:web#1", { projectId: "6h9ggGQqPMhPGGJJ", source: "work-plan" }),
    ],
    {},
  );

  const pools = planPools(sized, [], "2026-11-09");

  assert.deepEqual(
    blocksBody("2026-11-09", pools).blocks.map((b) => [b.taskIds, b.description]),
    [[["t"], "- Task t\n- Task merge:web#1"]],
  );
});
