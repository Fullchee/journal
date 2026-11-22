import * as z from "zod/mini";

import { authorize } from "./auth";
import type { Env } from "./env";
import { json } from "./json";

const isDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** A real calendar day as YYYY-MM-DD; Feb 30 fails. */
export const Day = z.string().check(z.refine(isDay));

/** Authorizes the viewer, then reads the `?day=` a GET is for; either failure is the Response to send. */
export async function authorizedDay(request: Request, env: Env): Promise<Response | string> {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const day = Day.safeParse(new URL(request.url).searchParams.get("day"));

  return day.success ? day.data : json({ error: "invalid day" }, 400);
}
