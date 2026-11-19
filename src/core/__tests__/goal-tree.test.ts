import assert from "node:assert/strict";
import {
  buildGoalTree,
  flattenGoalTree,
  goalSubtreeIds,
  type GoalNode,
  type GoalTreeRow,
} from "@/core/goal-tree";

const goal = (id: number, title: string, parentId: number | null = null) => ({
  id,
  title,
  parentId,
});

// Each node as its title, or [title, children], so a test reads the whole tree at once.
const titles = (nodes: GoalNode<GoalTreeRow>[]): unknown[] =>
  nodes.map(({ goal: { title }, children }) =>
    children.length === 0 ? title : [title, titles(children)],
  );

test("nests each goal under the goal it serves, at any depth", () => {
  const tree = buildGoalTree([
    goal(3, "Wind down", 2),
    goal(1, "Be healthy"),
    goal(2, "Sleep well", 1),
  ]);

  assert.deepEqual(titles(tree), [["Be healthy", [["Sleep well", ["Wind down"]]]]]);
});

test("orders roots and siblings by title", () => {
  const tree = buildGoalTree([
    goal(1, "Work"),
    goal(2, "Rest"),
    goal(3, "Walk", 2),
    goal(4, "Read", 2),
  ]);

  assert.deepEqual(titles(tree), [["Rest", ["Read", "Walk"]], "Work"]);
});

test("a goal without a parentId field is a root", () => {
  const tree = buildGoalTree([{ id: 1, title: "Rest" }]);

  assert.deepEqual(titles(tree), ["Rest"]);
});

test("a goal whose parent is missing is a root", () => {
  const tree = buildGoalTree([goal(2, "Sleep well", 99)]);

  assert.deepEqual(titles(tree), ["Sleep well"]);
});

test("goals on a cycle become roots and keep the goals below them", () => {
  const tree = buildGoalTree([goal(1, "A", 2), goal(2, "B", 1), goal(3, "C", 1)]);

  assert.deepEqual(titles(tree), [["A", ["C"]], "B"]);
});

test("flattening walks the tree in display order with each depth", () => {
  const flat = flattenGoalTree(
    buildGoalTree([goal(1, "Be healthy"), goal(2, "Sleep well", 1), goal(3, "Work")]),
  );

  assert.deepEqual(
    flat.map(({ goal: { title }, depth }) => [title, depth]),
    [
      ["Be healthy", 0],
      ["Sleep well", 1],
      ["Work", 0],
    ],
  );
});

test("a goal's subtree holds it and every goal below it", () => {
  const tree = buildGoalTree([
    goal(1, "Be healthy"),
    goal(2, "Sleep well", 1),
    goal(3, "Wind down", 2),
    goal(4, "Work"),
  ]);

  assert.deepEqual(
    [...goalSubtreeIds(tree, 2)].toSorted((a, b) => a - b),
    [2, 3],
  );
  assert.deepEqual([...goalSubtreeIds(tree, 4)], [4]);
});

test("a missing goal has an empty subtree", () => {
  const tree = buildGoalTree([goal(1, "Rest")]);

  assert.deepEqual([...goalSubtreeIds(tree, 9)], []);
});
