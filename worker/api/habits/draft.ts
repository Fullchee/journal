import { MODEL_DOWN } from "@worker/lib/log-model";
import { authorizedBody } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { DetailsRequest, readHabitDetails } from "@worker/lib/habit-details-model";
import { json } from "@worker/lib/json";

/** The model's habit-loop guesses fill the new-Habit form; nothing is written until the owner taps Create. */
export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, DetailsRequest, "invalid habit details");

  if (body instanceof Response) return body;
  const details = await readHabitDetails(env, body);

  return details ? json(details) : json({ error: MODEL_DOWN }, 502);
}
