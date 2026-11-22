import { ReviewAnswer } from "@/core";
import { authorizedBody } from "@worker/lib/auth";
import { authorizedDay, Day } from "@worker/lib/day";
import { confirmReview, readReview } from "@worker/lib/evening-review";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

const Confirm = z.object({ day: Day, answers: z.array(ReviewAnswer) });

/** "not-connected" and "unreachable" pass through so the page can say why. */
export async function onRequestGet({ request, env }: PagesContext) {
  const day = await authorizedDay(request, env);

  return day instanceof Response ? day : json(await readReview(env, day));
}

export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, Confirm, "invalid review");

  if (body instanceof Response) return body;
  const result = await confirmReview(env, body.day, body.answers);

  if (result.status === "reviewed") return json({ error: "already reviewed" }, 409);

  return result.status === "ok" ? new Response(null, { status: 204 }) : json(result, 503);
}
