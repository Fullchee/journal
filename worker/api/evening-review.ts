import { ReviewAnswer } from "@/core";
import { authorize, authorizedBody } from "@worker/lib/auth";
import { Day } from "@worker/lib/day";
import { confirmReview, readReview } from "@worker/lib/evening-review";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

const Confirm = z.object({ day: Day, answers: z.array(ReviewAnswer) });

/** "not-connected" and "unreachable" pass through so the page can say why. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const day = Day.safeParse(new URL(request.url).searchParams.get("day"));

  if (!day.success) return json({ error: "invalid day" }, 400);

  return json(await readReview(env, day.data));
}

export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, Confirm, "invalid review");

  if (body instanceof Response) return body;
  const result = await confirmReview(env, body.day, body.answers);

  if (result.status === "reviewed") return json({ error: "already reviewed" }, 409);

  return result.status === "ok" ? new Response(null, { status: 204 }) : json(result, 503);
}
