import * as z from "zod/mini";
import type { Env } from "./env";
import { json, readJson } from "./json";

/** D1 rejects a statement over 100 KB, so a body stays under that in UTF-8 bytes. */
export const MAX_BODY_BYTES = 90_000;

const NoteBody = z.object({ body: z.string() });

type ParsedNote = { body: string; error?: never } | { error: Response; body?: never };

/** Returns { body } or { error: Response }. */
export async function readNoteBody(request: Request): Promise<ParsedNote> {
  const payload = await readJson(request, NoteBody);

  if (payload === null) return { error: json({ error: "invalid body" }, 400) };

  if (new TextEncoder().encode(payload.body).length > MAX_BODY_BYTES)
    return { error: json({ error: "body too long" }, 413) };

  return { body: payload.body };
}

/** Saves the request's body over row `id` of `table`; returns the Response to send on failure, or null once saved. */
export async function replaceNoteBody(request: Request, env: Env, table: string, id: number) {
  const parsed = await readNoteBody(request);

  if (parsed.error !== undefined) return parsed.error;

  const { meta } = await env.DB.prepare(
    `UPDATE ${table} SET body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  )
    .bind(parsed.body, id)
    .run();

  return meta.changes > 0 ? null : json({ error: "not found" }, 404);
}
