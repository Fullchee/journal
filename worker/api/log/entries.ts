import { MAX_TEXT, ModelItem } from "@worker/lib/log-thread";
import type { Logged } from "@/core";
import { authorizedBody } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import { resolveItems } from "@worker/lib/log-plan";
import { applyLog, readLogContext } from "@worker/lib/log-store";

import * as z from "zod/mini";

// Each entry is re-checked like model output, so a malformed one is asked about, not refused here.
const EntryItem = z.catch(z.nullable(ModelItem), null);

const Entries = z.object({
  text: z.string().check(z.maxLength(MAX_TEXT)),
  log: z.array(EntryItem).check(z.minLength(1)),
});

/** Saves a draft the owner checked in the form, so overlaps are not asked about; every field is still re-checked. */
export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, Entries, "bad entries");

  if (body instanceof Response) return body;
  const ctx = await readLogContext(env);
  const plan = resolveItems(body.log, ctx);

  if (plan.type === "ask") return json({ error: plan.text }, 400);

  const { action, lines } = await applyLog(env, {
    text: body.text,
    writes: plan.writes,
    created: null,
    today: ctx.today,
  });

  return json({ type: "logged", text: lines.join("\n"), action } satisfies Logged);
}
