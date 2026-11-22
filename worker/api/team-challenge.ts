import {
  CARDIO_RULE,
  CHALLENGE_START,
  PULL_UP_RULE,
  TEAM_CHALLENGE_KINDS,
  cardioRows,
  dedupeSheet,
  fitbitCardio,
  hevyCardio,
  hevyPullUps,
  hevySets,
  skippedByDate,
  torontoDay,
  type ChallengeRange,
  type FitbitSessionRow,
  type HevySet,
  type TeamChallengeKind,
} from "@/core";
import { authorizedBody } from "@worker/lib/auth";
import { Day } from "@worker/lib/day";
import type { Env, PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

/** `sheet` is the `values` of a `get_values` read of the tab (A:D for cardio, A:G for pull-ups); `hevy_csv` is Hevy's workout CSV export. */
const SheetCell = z.union([z.string(), z.number()]);

const TeamChallengeRequest = z.object({
  kind: z.enum(TEAM_CHALLENGE_KINDS),
  since: z.optional(z.string()),
  until: z.optional(z.string()),
  sheet: z.array(z.array(SheetCell)),
  hevy_csv: z.optional(z.string()),
});

type TeamChallengeRequest = z.infer<typeof TeamChallengeRequest>;

/** The Days to read, or the one-line reason they can't be read. */
function challengeRange(
  since = CHALLENGE_START,
  until = torontoDay(new Date()),
): { range: ChallengeRange } | { error: string } {
  for (const [label, day] of [
    ["since", since],
    ["until", until],
  ])
    if (!Day.safeParse(day).success) return { error: `${label} must be YYYY-MM-DD, got ${day}` };

  return since > until
    ? { error: `since ${since} is after until ${until}` }
    : { range: { since, until } };
}

async function fitbitSessions(env: Env, { since, until }: ChallengeRange) {
  const { results } = await env.DB.prepare(
    `SELECT exercise_type, title, start_date, duration_s, distance_m FROM fitbit_sessions
      WHERE start_date BETWEEN ?1 AND ?2 ORDER BY start_time`,
  )
    .bind(since, until)
    .all<FitbitSessionRow>();

  return results;
}

type Report = (
  body: TeamChallengeRequest,
  range: ChallengeRange,
  hevy: HevySet[],
  env: Env,
) => Response | Promise<Response>;

// Hevy's free tier has no API and Health Connect carries no sets, so its rows come from the CSV export the caller sends.
const REPORTS: Record<TeamChallengeKind, Report> = {
  cardio: async (body, range, hevy, env) => {
    const fitbit = fitbitCardio(await fitbitSessions(env, range));
    const { rows, skipped } = cardioRows([...fitbit.sessions, ...hevyCardio(hevy, range)]);

    return json({
      ...dedupeSheet(CARDIO_RULE, body.sheet, rows),
      skipped: skippedByDate([...skipped, ...fitbit.skipped]),
    });
  },
  pullups: (body, range, hevy) => {
    if (body.hevy_csv === undefined)
      return json({ error: "pull-ups need hevy_csv, Hevy's workout export" }, 400);
    const { rows, skipped } = hevyPullUps(hevy, range);

    return json({
      ...dedupeSheet(PULL_UP_RULE, body.sheet, rows),
      skipped: skippedByDate(skipped),
    });
  },
};

/** Splits the range's Fitbit and Hevy workouts into team-sheet rows to log, ones the sheet has, ones to ask about, and ones it won't score. */
export async function onRequestPost(context: PagesContext) {
  const body = await authorizedBody(
    context,
    TeamChallengeRequest,
    "invalid team challenge request",
  );

  if (body instanceof Response) return body;
  const checked = challengeRange(body.since, body.until);

  if ("error" in checked) return json(checked, 400);
  const { range } = checked;
  const hevy = body.hevy_csv === undefined ? [] : hevySets(body.hevy_csv);

  if (hevy === null) return json({ error: "hevy_csv is not Hevy's workout export" }, 400);

  return REPORTS[body.kind](body, range, hevy, context.env);
}
