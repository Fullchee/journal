import { authorizedBody } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { proposeInteraction } from "@worker/lib/interaction-model";
import { json } from "@worker/lib/json";
import { Sentence } from "@worker/lib/log-thread";

export const INTERACTION_MODEL_DOWN =
  "Couldn't reach Workers AI. Try again, or use Reached out on their page.";

export const NOBODY_NAMED = "Who was it? Try again with their name.";

/** The model's guess becomes a review form in the app; nothing is written until the owner saves it to /api/interactions. */
export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, Sentence, "bad text");

  if (body instanceof Response) return body;
  const proposal = await proposeInteraction(env, body.text);

  if (proposal === null) return json({ error: INTERACTION_MODEL_DOWN }, 502);

  return proposal.people.length === 0 ? json({ error: NOBODY_NAMED }, 422) : json(proposal);
}
