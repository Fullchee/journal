import type { PagesContext } from "@worker/lib/env";
import { listDays } from "@worker/lib/signal-days";
import { postWorkRows } from "@worker/lib/work-store";
import * as z from "zod/mini";

const Field = z.optional(z.nullable(z.string()));

/** A work retro's /close-week fields, keyed by its reflection's period; the body stays in `reflections`. */
const WorkRetro = z.object({
  period: z.string().check(z.minLength(1)),
  shipped: Field,
  learning: Field,
  values_in_action: Field,
  goals: Field,
});

export async function onRequestGet({ request, env }: PagesContext) {
  const columns = Object.keys(WorkRetro.shape).join(", ");

  return listDays(request, env, "retros", `SELECT ${columns} FROM work_retros ORDER BY period`);
}

export async function onRequestPost(context: PagesContext) {
  return postWorkRows(context, WorkRetro, "work_retros", ["period"]);
}
