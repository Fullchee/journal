import { authorizeWriter } from "./auth";
import type { Env } from "./env";
import { json } from "./json";

/** Lists a Signal or Work table under `key`, in `query`'s order; a service token can read it as well as write it. */
export async function listDays(request: Request, env: Env, key: string, query: string) {
  const viewer = await authorizeWriter(request, env);

  if (viewer instanceof Response) return viewer;
  const { results } = await env.DB.prepare(query).bind().all();

  return json({ [key]: results });
}
