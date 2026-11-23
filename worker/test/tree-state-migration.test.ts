import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DIR = path.join(__dirname, "../migrations");
const MIGRATION = "0012_tree_state.sql";

// Copied into the test realm: node:sqlite builds rows in the outer one, which fail strict deepEqual.
const rows = (db: DatabaseSync, sql: string) =>
  Array.from(db.prepare(sql).all(), (row) => ({ ...row }));

test("a Habit stored as a tree stays one from the migration day; every other Stage is dropped", () => {
  const db = new DatabaseSync(":memory:");

  const earlier = readdirSync(DIR)
    .filter((name) => name < MIGRATION)
    .toSorted((a, b) => a.localeCompare(b));

  for (const file of earlier) db.exec(readFileSync(path.join(DIR, file), "utf8"));

  db.exec(
    `INSERT INTO habits (id, name, stage) VALUES ('tea', 'Make tea', 'tree'), ('walk', 'Walk', 'plant');`,
  );
  db.exec(readFileSync(path.join(DIR, MIGRATION), "utf8"));

  const today = rows(db, "SELECT date('now', '-5 hours') AS day")[0]?.["day"];

  assert.deepEqual(rows(db, "SELECT id, trees, tree_ask_from FROM habits ORDER BY id"), [
    { id: "tea", trees: JSON.stringify([{ start: today, end: null }]), tree_ask_from: null },
    { id: "walk", trees: "[]", tree_ask_from: null },
  ]);
  assert.equal(
    rows(db, "PRAGMA table_info(habits)").some(({ name }) => name === "stage"),
    false,
  );
});
