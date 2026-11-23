import { DEVICE_NAME } from "@/core";
import { authorize, authorizedBody, authorizeWriter } from "@worker/lib/auth";
import { Day } from "@worker/lib/day";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

// A fall-back Day lasts 25 hours.
const MAX_MINUTES = 25 * 60;

const Device = z.string().check(z.regex(DEVICE_NAME));

/** One device's screen-on minutes for each Day it covers; a resent Day replaces its row. */
const Minutes = z.int().check(z.gte(0), z.lte(MAX_MINUTES));

const UploadDay = z.object({ day: Day, minutes: Minutes });

const Upload = z.object({ device: Device, days: z.array(UploadDay).check(z.minLength(1)) });

const UPSERT = `INSERT INTO screen_time (device, day, minutes) VALUES (?, ?, ?)
  ON CONFLICT (device, day) DO UPDATE SET minutes = excluded.minutes`;

/** Each Day's screen-on minutes from `?from=` on, summed across devices. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const from = Day.safeParse(new URL(request.url).searchParams.get("from"));

  if (!from.success) return json({ error: "invalid from" }, 400);

  const { results } = await env.DB.prepare(
    "SELECT day, SUM(minutes) AS minutes FROM screen_time WHERE day >= ? GROUP BY day ORDER BY day",
  )
    .bind(from.data)
    .all();

  return json({ days: results });
}

/**
 * Stores a device's Days. The phones post here as the owner; the Macs post to `/api/screen-time/mac` with an Access
 * service token, which Access admits to that path only.
 */
export async function onRequestPost(context: PagesContext) {
  const body = await authorizedBody(context, Upload, "invalid screen time", authorizeWriter);

  if (body instanceof Response) return body;
  const { DB } = context.env;

  await DB.batch(
    body.days.map(({ day, minutes }) => DB.prepare(UPSERT).bind(body.device, day, minutes)),
  );

  return json({ stored: body.days.length });
}
