import { isoAt } from "@/core";
import { authorize } from "@worker/lib/auth";
import { listBusy } from "@worker/lib/calendar";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "not-connected" and "unreachable" pass through so the page can say why, never "busy times unknown". */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const day = new URL(request.url).searchParams.get("day") ?? "";

  if (!DAY.test(day) || Number.isNaN(Date.parse(day))) return json({ error: "invalid day" }, 400);

  const result = await listBusy(env, { start: isoAt(day, 0), end: isoAt(day, 1440) });

  return json(result.status === "ok" ? { status: "ok", busy: result.value } : result);
}
