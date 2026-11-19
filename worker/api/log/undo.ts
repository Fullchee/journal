import { authorize } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import { undoLog } from "@worker/lib/log-store";

/** Single use: a second Undo of the same log is refused. */
export async function onRequestPost({ request, env, params }: PagesContext<"id">) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const id = Number(params.id);

  if (!Number.isSafeInteger(id) || id < 1) return json({ error: "No such log." }, 404);
  const refused = await undoLog(env, id);

  return refused
    ? json({ error: refused.error }, refused.status)
    : new Response(null, { status: 204 });
}
