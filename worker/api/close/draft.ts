import { authorizeWriter } from "@worker/lib/auth";
import { closePeriodOf, readCloseSources } from "@worker/lib/close-sources";
import { writeCloseDraft } from "@worker/lib/close-prose";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";

/** Asks the model for the arc and one review per active Goal; a 503 tells the app to let the owner write by hand. */
export async function onRequestPost({ request, env, params }: PagesContext<"kind" | "period">) {
  const viewer = await authorizeWriter(request, env);

  if (viewer instanceof Response) return viewer;
  const close = closePeriodOf(params);

  if (close === null) return json({ error: "invalid period" }, 400);

  const draft = await writeCloseDraft(
    env.AI,
    await readCloseSources(env, close.kind, close.period),
  );

  return draft === null ? json({ error: "draft unavailable" }, 503) : json(draft);
}
