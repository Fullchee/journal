import { MAX_REST_DAYS, shiftDay, torontoDay, type RestPeriod } from "@/core";
import { authorize, authorizedBody } from "@worker/lib/auth";
import type { Env, PagesContext } from "@worker/lib/env";
import { readNotes, readRecords } from "@worker/lib/habit-records";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

// Streaks replay every Habit's full history.
const ALL_HISTORY = "0000-01-01";

const RestDays = z.int().check(z.gte(1), z.lte(MAX_REST_DAYS));

const Change = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start-rest"), days: RestDays }),
  z.object({ type: z.literal("end-rest") }),
]);

async function readRestPeriods(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT id, start_date AS start, end_date AS end FROM rest_periods ORDER BY start_date",
  )
    .bind()
    .all<RestPeriod & { id: number }>();

  return results;
}

/** Starts Rest mode today for `days` days; refused while one is running. */
async function startRest(env: Env, days: number, today: string) {
  const periods = await readRestPeriods(env);

  if (periods.some(({ end }) => end >= today)) return false;

  await env.DB.prepare("INSERT INTO rest_periods (start_date, end_date) VALUES (?, ?)")
    .bind(today, shiftDay(today, days - 1))
    .run();

  return true;
}

/** Ends Rest mode early: it covered up to yesterday, and a period started today never happened. */
async function endRest(env: Env, today: string) {
  const periods = await readRestPeriods(env);
  const running = periods.find(({ start, end }) => start <= today && today <= end);

  if (running === undefined) return false;

  await (
    running.start === today
      ? env.DB.prepare("DELETE FROM rest_periods WHERE id = ?").bind(running.id)
      : env.DB.prepare("UPDATE rest_periods SET end_date = ? WHERE id = ?").bind(
          shiftDay(today, -1),
          running.id,
        )
  ).run();

  return true;
}

/** Every Habit's counts, Duration entries and Skip causes, plus every Rest period: what Streaks replay. History shows the notes. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const records = await readRecords(env, ALL_HISTORY, new Date());

  return json({ ...records, notes: await readNotes(env, ALL_HISTORY) });
}

export async function onRequestPost({ request, env }: PagesContext) {
  const change = await authorizedBody({ request, env }, Change, "invalid change");

  if (change instanceof Response) return change;
  const today = torontoDay(new Date());

  const applied =
    change.type === "start-rest"
      ? await startRest(env, change.days, today)
      : await endRest(env, today);

  return applied ? new Response(null, { status: 204 }) : json({ error: "invalid change" }, 400);
}
