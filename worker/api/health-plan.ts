import { authorize } from "@worker/lib/auth";
import type { Env, PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import { readNoteBody } from "@worker/lib/note-body";

async function readPlan(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT body, updated_at AS updatedAt FROM health_plan WHERE id = 1",
  )
    .bind()
    .all<{ body: string; updatedAt: string | null }>();

  return json({ item: results[0] ?? { body: "", updatedAt: null } });
}

export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  return viewer instanceof Response ? viewer : readPlan(env);
}

export async function onRequestPut({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const parsed = await readNoteBody(request);

  if (parsed.error) return parsed.error;
  await env.DB.prepare(
    `INSERT INTO health_plan (id, body) VALUES (1, ?)
  ON CONFLICT (id) DO UPDATE SET body = excluded.body, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(parsed.body)
    .run();

  return readPlan(env);
}
