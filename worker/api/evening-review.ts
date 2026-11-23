import { DeleteEvent, ReviewAnswer } from "@/core";
import { authorizedBody } from "@worker/lib/auth";
import { authorizedDay, Day } from "@worker/lib/day";
import { deleteEvent } from "@worker/lib/calendar";
import {
  confirmReview,
  readDayNotes,
  readOtherEvents,
  readReview,
} from "@worker/lib/evening-review";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

const Confirm = z.object({ day: Day, answers: z.array(ReviewAnswer) });

/** "not-connected" and "unreachable" pass through so the page can say why. */
export async function onRequestGet({ request, env }: PagesContext) {
  const day = await authorizedDay(request, env);

  if (day instanceof Response) return day;
  const [review, notes] = await Promise.all([readReview(env, day), readDayNotes(env, day)]);

  if (review.status !== "ok") return json({ ...review, notes });

  const others = await readOtherEvents(env, day, new Set(review.events.map((e) => e.eventId)));

  return json(
    others.status === "ok" ? { ...review, others: others.value, notes } : { ...others, notes },
  );
}

export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, Confirm, "invalid review");

  if (body instanceof Response) return body;
  const result = await confirmReview(env, body.day, body.answers);

  if (result.status === "reviewed") return json({ error: "already reviewed" }, 409);

  return result.status === "ok" ? new Response(null, { status: 204 }) : json(result, 503);
}

/** "Didn't" on an unlinked event deletes it from Google Calendar at once, with no confirm. */
export async function onRequestDelete({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, DeleteEvent, "invalid event");

  if (body instanceof Response) return body;
  const result = await deleteEvent(env, body.eventId);

  return result.status === "ok" ? new Response(null, { status: 204 }) : json(result, 503);
}
