import { authorizedBody } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import { draftOf } from "@worker/lib/log-draft";
import { MODEL_DOWN, readModelReply } from "@worker/lib/log-model";
import { readLogContext } from "@worker/lib/log-store";
import { Sentence } from "@worker/lib/log-thread";

/** The model's guess becomes a form in the app; nothing is written until the owner saves it to /api/log/entries. */
export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, Sentence, "bad text");

  if (body instanceof Response) return body;
  const ctx = await readLogContext(env);
  const draft = await readModelReply(env, ctx, body.text, draftOf);

  return draft ? json(draft) : json({ error: MODEL_DOWN }, 502);
}
