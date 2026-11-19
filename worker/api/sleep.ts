import { authorizedBody, authorizeWriter } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { listDays } from "@worker/lib/signal-days";
import { IsoDate, writeCheck } from "@worker/lib/habit-records";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

const UPSERT = `INSERT INTO sleep (date, sleep_start, sleep_end, duration_min, sleep_score) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (date) DO UPDATE SET sleep_start = excluded.sleep_start, sleep_end = excluded.sleep_end,
    duration_min = excluded.duration_min, sleep_score = excluded.sleep_score`;

// The "Asleep by 10 PM" Habit (id `sleep`); a bedtime from noon to 22:00 checks it for that evening.
const ASLEEP_BY = { habit: "sleep", noon: "12:00", latest: "22:00" };

/** The evening's date when the bedtime meets ASLEEP_BY; null for a later bedtime, which falls after midnight or before noon. */
function asleepByDate(sleepStart: string) {
  const [day, time = ""] = sleepStart.split("T", 2);
  const clock = time.slice(0, 5);

  return clock >= ASLEEP_BY.noon && clock <= ASLEEP_BY.latest ? day : null;
}

const Score = z.int().check(z.gte(0), z.lte(100));

const MaybeScore = z.union([z.literal(""), z.null(), Score]);

/** A night as the push sends it; `sleep_score` is "" when the watch gave no score. */
const Night = z.object({
  date: IsoDate,
  sleep_start: z.string().check(z.minLength(1)),
  sleep_end: z.optional(z.string()),
  duration_min: z.int().check(z.gte(0)),
  sleep_score: z.optional(MaybeScore),
});

const Nights = z.object({ rows: z.array(Night).check(z.minLength(1)) });

export async function onRequestGet({ request, env }: PagesContext) {
  return listDays(
    request,
    env,
    "sleep",
    "SELECT date, sleep_start AS sleepStart, sleep_end AS sleepEnd, duration_min AS durationMin, sleep_score AS sleepScore FROM sleep ORDER BY date DESC",
  );
}

export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody(
    { request, env },
    Nights,
    "invalid sleep rows",
    authorizeWriter,
  );

  if (body instanceof Response) return body;

  const checkDates = body.rows.flatMap(({ sleep_start }) => asleepByDate(sleep_start) ?? []);

  await env.DB.batch([
    ...body.rows.map(({ date, sleep_start, sleep_end = "", duration_min, sleep_score = null }) =>
      env.DB.prepare(UPSERT).bind(
        date,
        sleep_start,
        sleep_end,
        duration_min,
        sleep_score === "" ? null : sleep_score,
      ),
    ),
    // An automatic check: it never overrides a Day the owner answered, and a missing Habit takes none.
    ...checkDates.flatMap((date) =>
      writeCheck(env.DB, { habit: ASLEEP_BY.habit, date, count: 1, mode: "fill" }),
    ),
  ]);

  return json({ upserted: body.rows.length });
}
