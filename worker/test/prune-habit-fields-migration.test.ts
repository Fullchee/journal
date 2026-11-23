import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DIR = path.join(__dirname, "../migrations");
const MIGRATION = "0010_prune_habit_fields.sql";
const DROPPED = ["why", "cue", "routine", "reward", "obstacles", "replaces", "usual_where"];

const HABITS = `
INSERT INTO habits (id, name, description, why, cue, routine, reward, obstacles, usual_where, stacked_after, cue_type)
VALUES
  ('tea', 'Make tea', '', '', '', '', '', '[]', '', NULL, ''),
  ('stretch', 'Stretch', 'On the mat.', 'Less back pain', 'After tea', 'Ten minutes', 'Feel loose',
    '["no time","too tired"]', 'Living room', 'tea', 'stacked'),
  ('snack', 'Late snack', '', '', 'I''m bored', '', '', '[]', '', NULL, 'emotion'),
  ('walk', 'Walk', 'Around the block.', '', '', '', '', '[]', '', NULL, 'time');
INSERT INTO goals (id, title) VALUES (1, 'Move more');
INSERT INTO goal_habits (goal_id, habit_id, note) VALUES (1, 'stretch', 'daily'), (1, 'walk', '');
INSERT INTO habit_checks (habit, date, count) VALUES ('stretch', '2026-11-01', 1);
`;

// Copied into the test realm: node:sqlite builds rows in the outer one, which fail strict deepEqual.
const rows = (db: DatabaseSync, sql: string) =>
  Array.from(db.prepare(sql).all(), (row) => ({ ...row }));

const nonEmpty = (db: DatabaseSync) =>
  rows(
    db,
    "SELECT sum(why != '') AS why, sum(cue != '') AS cue, sum(routine != '') AS routine, " +
      "sum(reward != '') AS reward, sum(obstacles != '[]') AS obstacles, sum(usual_where != '') AS spot FROM habits",
  );

const labelled = (db: DatabaseSync) =>
  rows(
    db,
    "SELECT sum(description LIKE '%- **Why:** %') AS why, sum(description LIKE '%- **Cue:** %') AS cue, " +
      "sum(description LIKE '%- **Routine:** %') AS routine, sum(description LIKE '%- **Reward:** %') AS reward, " +
      "sum(description LIKE '%- **Obstacles:** %') AS obstacles, sum(description LIKE '%- **Usual spot:** %') AS spot FROM habits",
  );

function migrated() {
  const db = new DatabaseSync(":memory:");

  const earlier = readdirSync(DIR)
    .filter((name) => name < MIGRATION)
    .toSorted((a, b) => a.localeCompare(b));

  for (const file of earlier) db.exec(readFileSync(path.join(DIR, file), "utf8"));

  db.exec(HABITS);
  const before = nonEmpty(db);

  // D1 runs a migration in one transaction, which is what lets its foreign key checks wait until commit.
  db.exec("BEGIN");
  db.exec(readFileSync(path.join(DIR, MIGRATION), "utf8"));
  db.exec("COMMIT");

  return { db, before };
}

test("the migration keeps every non-empty dropped value in the description", () => {
  const { db, before } = migrated();

  assert.deepEqual(labelled(db), before);

  assert.deepEqual(rows(db, "SELECT id, description FROM habits ORDER BY rowid"), [
    { id: "tea", description: "" },
    {
      id: "stretch",
      description: [
        "On the mat.",
        "",
        "- **Why:** Less back pain",
        "- **Cue:** After tea",
        "- **Routine:** Ten minutes",
        "- **Reward:** Feel loose",
        "- **Obstacles:** no time; too tired",
        "- **Usual spot:** Living room",
      ].join("\n"),
    },
    { id: "snack", description: "- **Cue:** I'm bored" },
    { id: "walk", description: "Around the block." },
  ]);
});

test("the migration drops the columns and keeps every link, order and record", () => {
  const { db } = migrated();

  const columns = new Set(
    rows(db, "SELECT name FROM pragma_table_info('habits')").map(({ name }) => name),
  );

  assert.deepEqual(
    DROPPED.filter((column) => columns.has(column)),
    [],
  );
  assert.deepEqual(rows(db, "SELECT id, stacked_after, cue_type FROM habits ORDER BY rowid"), [
    { id: "tea", stacked_after: null, cue_type: "" },
    { id: "stretch", stacked_after: "tea", cue_type: "stacked" },
    { id: "snack", stacked_after: null, cue_type: "emotion" },
    { id: "walk", stacked_after: null, cue_type: "time" },
  ]);
  assert.deepEqual(rows(db, "SELECT goal_id, habit_id, note FROM goal_habits ORDER BY habit_id"), [
    { goal_id: 1, habit_id: "stretch", note: "daily" },
    { goal_id: 1, habit_id: "walk", note: "" },
  ]);
  assert.deepEqual(rows(db, "SELECT count(*) AS n FROM habit_checks"), [{ n: 1 }]);
  assert.deepEqual(rows(db, "PRAGMA foreign_key_check"), []);
  assert.throws(() =>
    db.exec("INSERT INTO habits (id, name, stacked_after) VALUES ('x', 'X', 'gone')"),
  );
});
