import type { Part } from "@/core";
import type { Env, SqlValue } from "./env";

const COLUMNS =
  "id, name, role, wants, fears, felt_in AS feltIn, description, retired, created_at AS createdAt";

/** Oldest first, so the defaults the migration seeded lead; `where` narrows the rows, with its `?` values in `args`. */
export async function readParts(env: Env, where = "", ...args: SqlValue[]): Promise<Part[]> {
  // SQLite stores `retired` as 0 or 1.
  type PartRow = Omit<Part, "retired"> & { retired: number };

  const { results } = await env.DB.prepare(`SELECT ${COLUMNS} FROM parts ${where} ORDER BY id`)
    .bind(...args)
    .all<PartRow>();

  return results.map((row) => ({ ...row, retired: row.retired === 1 }));
}
