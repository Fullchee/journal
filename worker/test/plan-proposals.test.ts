import assert from "node:assert/strict";
import type { Ai } from "@worker/lib/env";
import { proposeForTasks } from "@worker/lib/plan-proposals";
import type { PlanTask } from "@/core";

const task = (id: string): PlanTask => ({
  id,
  content: `Task ${id}`,
  projectId: "p",
  sectionId: null,
  priority: 1,
  dueDate: "2026-11-05",
  labels: [],
});

const replying = (response?: string): Ai => ({
  run: () => Promise.resolve(response === undefined ? {} : { response }),
});

const failing: Ai = {
  run: () => Promise.reject(new Error("model down")),
};

test("proposals come from the model's JSON, keyed by task id", async () => {
  const reply = JSON.stringify({
    tasks: [
      { id: "a", disposition: "postpone", reason: "Not urgent", minutes: 45 },
      { id: "b", disposition: "drop", reason: "Stale", minutes: 15 },
    ],
  });

  assert.deepEqual(await proposeForTasks(replying(`Here: ${reply}`), [task("a"), task("b")]), {
    a: { disposition: "postpone", reason: "Not urgent", minutes: 45 },
    b: { disposition: "drop", reason: "Stale", minutes: 15 },
  });
});

test("a task the model skipped, or answered badly, defaults to keep for 30 minutes", async () => {
  const reply = JSON.stringify({
    tasks: [{ id: "a", disposition: "explode", reason: 3, minutes: -5 }],
  });

  assert.deepEqual(await proposeForTasks(replying(reply), [task("a"), task("b")]), {
    a: { disposition: "keep", reason: "", minutes: 30 },
    b: { disposition: "keep", reason: "", minutes: 30 },
  });
});

test("no proposals when the reply is not JSON", async () => {
  assert.equal(await proposeForTasks(replying("sorry"), [task("a")]), null);
  assert.equal(await proposeForTasks(replying(), [task("a")]), null);
});

test("no proposals when the model call fails", async () => {
  assert.equal(await proposeForTasks(failing, [task("a")]), null);
});

test("no model call for an empty task list", async () => {
  assert.deepEqual(await proposeForTasks(failing, []), {});
});
