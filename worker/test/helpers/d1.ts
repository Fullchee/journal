import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1, D1Statement, SqlValue } from "@worker/lib/env";

const MIGRATIONS = path.join(__dirname, "../../migrations");
const SEED = path.join(__dirname, "../fixtures/seed.sql");

/** D1 reports a failed statement as a rejected promise, never a synchronous throw. */
/** One bound statement. D1 reports a failed one as a rejected promise, never a synchronous throw. */
function boundStatement(db: DatabaseSync, sql: string, args: SqlValue[]): D1Statement {
  const run = () => {
    const { changes, lastInsertRowid } = db.prepare(sql).run(...args);

    return {
      success: true,
      meta: { changes: Number(changes), last_row_id: Number(lastInsertRowid) },
    };
  };

  // Copied into the test realm: node:sqlite builds rows in the outer one, which fail strict deepEqual.
  const rows = () => Array.from(db.prepare(sql).all(...args), (row) => ({ ...row }));

  return {
    run: () => Promise.try(run),
    // SAFETY: SQLite rows are plain objects whose columns the caller names in `Row`.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- implements D1Statement's generic `all`
    all: <Row>() => Promise.try(() => ({ results: rows() as Row[] })),
  };
}

/** Wraps `db` so the `nth` (1-based) statement whose SQL matches `sql` reads no rows, as if another request deleted them in between. */
export function withVanishingRows(db: D1, sql: RegExp, nth = 1): D1 {
  let seen = 0;

  return {
    ...db,
    prepare: (text) => ({
      bind: (...args) => {
        const statement = db.prepare(text).bind(...args);

        if (!sql.test(text)) return statement;
        seen += 1;

        return seen === nth
          ? { ...statement, all: () => Promise.resolve({ results: [] }) }
          : statement;
      },
    }),
  };
}

/**
 * In-memory SQLite exposing the slice of the D1 API the handlers use, built from the real migrations plus the example rows in `fixtures/seed.sql`.
 * `seeded: false` starts goals empty.
 */
export function makeD1({ seeded = true } = {}): D1 & { exec: (sql: string) => Promise<void> } {
  const db = new DatabaseSync(":memory:");

  const migrations = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .toSorted((a, b) => a.localeCompare(b));

  for (const file of migrations) db.exec(readFileSync(path.join(MIGRATIONS, file), "utf8"));
  db.exec(readFileSync(SEED, "utf8"));

  if (!seeded) db.exec("DELETE FROM goals;");

  return {
    exec: (sql) =>
      Promise.try(() => {
        db.exec(sql);
      }),
    // Each bound statement runs synchronously underneath, so a transaction around them matches D1's batch.
    batch: async (statements) => {
      db.exec("BEGIN");

      try {
        const results = [];

        for (const statement of statements) results.push(await statement.run());
        db.exec("COMMIT");

        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    prepare: (sql) => ({ bind: (...args) => boundStatement(db, sql, args) }),
  };
}
