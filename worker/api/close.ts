import {
  assembleCloseBody,
  CloseSave,
  goalMoveLine,
  nextYearStart,
  periodRange,
  savedMoveLines,
  type CloseGoal,
  type CloseKind,
  type SavedMove,
} from "@/core";
import type * as z from "zod/mini";
import { authorizedBody, authorizeWriter } from "@worker/lib/auth";
import { closePeriodOf, readCloseSources } from "@worker/lib/close-sources";
import type { D1Statement, Env, PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import { readActiveGoals } from "@worker/lib/period-reads";
import { unlessDuplicate } from "@worker/lib/unique";

type CloseContext = PagesContext<"kind" | "period">;

/** The period's sources, signals and active Goals; nothing is drafted or written here. */
export async function onRequestGet({ request, env, params }: CloseContext) {
  const viewer = await authorizeWriter(request, env);

  if (viewer instanceof Response) return viewer;
  const close = closePeriodOf(params);

  return close === null
    ? json({ error: "invalid period" }, 400)
    : json(await readCloseSources(env, close.kind, close.period));
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const STATE: Record<"retire" | "achieve", string> = { retire: "retired", achieve: "achieved" };

function moveWrite(env: Env, move: SavedMove): D1Statement | null {
  switch (move.move) {
    case "carry": {
      return null;
    }

    case "revise": {
      return env.DB.prepare(`UPDATE goals SET title = ?, updated_at = ${NOW} WHERE id = ?`).bind(
        move.revision,
        move.goalId,
      );
    }

    case "retire":
    case "achieve": {
      return env.DB.prepare(`UPDATE goals SET state = ?, updated_at = ${NOW} WHERE id = ?`).bind(
        STATE[move.move],
        move.goalId,
      );
    }
  }
}

interface GoalMoved {
  goal: CloseGoal;
  move: SavedMove;
}

/** Each active Goal paired with its one move; null unless every active Goal has exactly one. */
function pairMoves(goals: CloseGoal[], moves: SavedMove[]): GoalMoved[] | null {
  if (moves.length !== goals.length) return null;
  const paired: GoalMoved[] = [];

  for (const goal of goals) {
    const [move, ...more] = moves.filter((m) => m.goalId === goal.id);

    if (move === undefined || more.length > 0) return null;
    paired.push({ goal, move });
  }

  return paired;
}

type Save = z.infer<typeof CloseSave>;

function closeBody(
  { kind, period }: { kind: CloseKind; period: string },
  paired: GoalMoved[],
  save: Save,
  kept: string[],
) {
  const { to } = periodRange(kind, period);
  const lines = paired.map(({ goal, move }) => goalMoveLine(to, goal.title, move, move.words));

  return assembleCloseBody(kind, {
    arc: save.arc,
    answer: save.answer,
    goalLines: [...new Set([...kept, ...lines])],
    newGoals: save.newGoals.map((goal) => goal.title),
  });
}

/** Saves the close in one batch: the reflection row, each Goal's move and, for a year, the picked Goals. */
export async function onRequestPut(context: CloseContext) {
  const save = await authorizedBody(context, CloseSave, "invalid close");

  if (save instanceof Response) return save;
  const close = closePeriodOf(context.params);

  if (close === null) return json({ error: "invalid period" }, 400);
  const { env } = context;
  const { kind, period } = close;

  if (kind === "quarter" && save.newGoals.length > 0)
    return json({ error: "only a year picks new Goals" }, 400);

  const [goals, saved] = await Promise.all([
    readActiveGoals(env, periodRange(kind, period).to),
    env.DB.prepare("SELECT id, body FROM reflections WHERE track = 'growth' AND period = ?")
      .bind(period)
      .all<{ id: number; body: string }>(),
  ]);

  const paired = pairMoves(goals, save.moves);

  if (paired === null) return json({ error: "one move per active Goal" }, 400);
  const existing = saved.results[0];

  // Never overwrite a close the owner wrote unless they said so.
  if (existing !== undefined && !save.replace)
    return json({ error: "this period is closed already" }, 409);

  const body = closeBody(
    close,
    paired,
    save,
    existing === undefined ? [] : savedMoveLines(existing.body),
  );

  const reflection =
    existing === undefined
      ? env.DB.prepare("INSERT INTO reflections (period_kind, period, body) VALUES (?, ?, ?)").bind(
          kind,
          period,
          body,
        )
      : env.DB.prepare(`UPDATE reflections SET body = ?, updated_at = ${NOW} WHERE id = ?`).bind(
          body,
          existing.id,
        );

  const since = nextYearStart(period);

  const created = save.newGoals.map(({ title }) =>
    env.DB.prepare("INSERT INTO goals (title, state, since) VALUES (?, 'active', ?)").bind(
      title,
      since,
    ),
  );

  const writes = [
    reflection,
    ...save.moves.flatMap((move) => moveWrite(env, move) ?? []),
    ...created,
  ];

  // A revised or picked title can clash with a Goal's, and a parallel save can create the row first.
  const runs = await unlessDuplicate(env.DB.batch(writes));

  return runs === null
    ? json({ error: "a Goal or close with that name exists" }, 409)
    : json({ id: existing?.id ?? runs[0]?.meta.last_row_id, body });
}
