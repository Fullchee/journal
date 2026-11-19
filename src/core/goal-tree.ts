/** A Goal as the notes list sends it: `parentId` is the Goal it serves, absent or null at the top. */
export interface GoalTreeRow {
  id: number;
  title: string;
  parentId?: number | null | undefined;
}

export interface GoalNode<Row extends GoalTreeRow> {
  goal: Row;
  children: GoalNode<Row>[];
}

const byTitle = <Row extends GoalTreeRow>(a: GoalNode<Row>, b: GoalNode<Row>) =>
  a.goal.title.localeCompare(b.goal.title);

// True when walking up from `id` comes back to it; the API rejects cycles, but old rows may hold one.
function isOnCycle(id: number, parentOf: Map<number, number | null>) {
  const seen = new Set<number>();

  for (let at = parentOf.get(id); at !== undefined && at !== null; at = parentOf.get(at)) {
    if (at === id) return true;

    if (seen.has(at)) return false;
    seen.add(at);
  }

  return false;
}

/**
 * Nests each Goal under the Goal it serves, siblings by title. A Goal whose parent is missing, or which
 * sits on a cycle, is a root, so every row shows exactly once.
 */
export function buildGoalTree<Row extends GoalTreeRow>(rows: Row[]): GoalNode<Row>[] {
  const nodes = new Map<number, GoalNode<Row>>(
    rows.map((goal) => [goal.id, { goal, children: [] }]),
  );

  const parentOf = new Map(rows.map(({ id, parentId = null }) => [id, parentId]));
  const roots: GoalNode<Row>[] = [];

  for (const node of nodes.values()) {
    const { parentId } = node.goal;
    const parent = parentId === null || parentId === undefined ? undefined : nodes.get(parentId);

    if (parent === undefined || isOnCycle(node.goal.id, parentOf)) roots.push(node);
    else parent.children.push(node);
  }

  for (const node of nodes.values()) node.children.sort(byTitle);

  return roots.toSorted(byTitle);
}

/** The tree in display order, each Goal with how deep it sits (0 at the top). */
export function flattenGoalTree<Row extends GoalTreeRow>(
  nodes: GoalNode<Row>[],
  depth = 0,
): { goal: Row; depth: number }[] {
  return nodes.flatMap(({ goal, children }) => [
    { goal, depth },
    ...flattenGoalTree(children, depth + 1),
  ]);
}

/** The Goal and every Goal below it: none of them can be its parent. */
export function goalSubtreeIds<Row extends GoalTreeRow>(
  nodes: GoalNode<Row>[],
  id: number,
): Set<number> {
  const flat = flattenGoalTree(nodes);
  const start = flat.findIndex(({ goal }) => goal.id === id);
  const top = flat[start];

  if (top === undefined) return new Set();

  const end = flat.findIndex((item, index) => index > start && item.depth <= top.depth);

  return new Set(flat.slice(start, end === -1 ? flat.length : end).map(({ goal }) => goal.id));
}
