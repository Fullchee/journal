import { authorizedBody } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import { oneOffHabit, saveOneOff } from "@worker/lib/log-store";
import { MAX_TEXT, ModelOneOff } from "@worker/lib/log-thread";
import { torontoDay } from "@/core";
import * as z from "zod/mini";

// Each One-off field is re-checked like model output, so a wrong-typed one is refused by oneOffHabit.
const Body = z.object({
  text: z.string().check(z.maxLength(MAX_TEXT)),
  one_off: z.catch(z.nullable(ModelOneOff), null),
});

export const BAD_ONE_OFF = "Which day is it, and what is it called?";

/** Saves a One-off the owner checked in the log box's form; the answer's `action` is what Undo reverses. */
export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, Body, BAD_ONE_OFF);

  if (body instanceof Response) return body;
  const today = torontoDay(new Date());
  const habit = oneOffHabit(body.one_off, today);

  return habit === null
    ? json({ error: BAD_ONE_OFF }, 400)
    : json(await saveOneOff(env, { text: body.text, habit, today }));
}
