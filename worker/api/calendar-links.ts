import { CalendarLink, shiftDay, isoAt, torontoDay } from "@/core";
import { authorize, authorizedBody } from "@worker/lib/auth";
import { listRecurringSeries } from "@worker/lib/calendar";
import { deleteLink, readLinks, saveLink } from "@worker/lib/evening-review";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

/** The picker offers series seen in the last 30 days. */
const LOOKBACK_DAYS = 30;

const Change = z.discriminatedUnion("type", [
  z.extend(CalendarLink, { type: z.literal("link") }),
  z.object({ type: z.literal("unlink"), calendarId: z.string(), seriesId: z.string() }),
]);

/** Every link; `?series=1` adds the recurring series on my calendars for the picker, which reads Google. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const links = await readLinks(env);

  if (new URL(request.url).searchParams.get("series") !== "1") return json({ links });

  const today = torontoDay(new Date());

  const series = await listRecurringSeries(env, {
    start: isoAt(shiftDay(today, -LOOKBACK_DAYS)),
    end: isoAt(shiftDay(today, 1)),
  });

  return json({ links, series });
}

export async function onRequestPost({ request, env }: PagesContext) {
  const change = await authorizedBody({ request, env }, Change, "invalid link");

  if (change instanceof Response) return change;

  if (change.type === "unlink") {
    await deleteLink(env, change.calendarId, change.seriesId);

    return new Response(null, { status: 204 });
  }

  return (await saveLink(env, change))
    ? new Response(null, { status: 204 })
    : json({ error: "no such habit" }, 400);
}
