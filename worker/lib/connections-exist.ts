import type { Env } from "@worker/lib/env";

/** True when every id names a saved Connection; no ids is true. */
export async function connectionsExist(env: Env, connectionIds: number[]) {
  const unique = [...new Set(connectionIds)];

  if (unique.length === 0) return true;

  const { results } = await env.DB.prepare(
    `SELECT id FROM connections WHERE id IN (${unique.map(() => "?").join(", ")})`,
  )
    .bind(...unique)
    .all();

  return results.length === unique.length;
}
