import {
  CloseKind,
  closeSignals,
  closeSources,
  isClosePeriod,
  periodRange,
  type CloseSourcesBody,
} from "@/core";
import * as z from "zod/mini";

import type { Env } from "@worker/lib/env";
import { readActiveGoals, readSignals } from "@worker/lib/period-reads";

/** What a close reads: its source reflections as written, signals read fresh, the active Goals and any saved close. */
export async function readCloseSources(
  env: Env,
  kind: CloseKind,
  period: string,
): Promise<CloseSourcesBody> {
  const { from, to } = periodRange(kind, period);
  const keys = closeSources(kind, period);

  const [rows, signals, goals, saved] = await Promise.all([
    env.DB.prepare(
      `SELECT period, body FROM reflections WHERE track = 'growth' AND period IN (${keys.map(() => "?").join(", ")})`,
    )
      .bind(...keys.map((key) => key.period))
      .all<{ period: string; body: string }>(),
    readSignals(env, from, to),
    readActiveGoals(env, to),
    env.DB.prepare("SELECT id, body FROM reflections WHERE track = 'growth' AND period = ?")
      .bind(period)
      .all<{ id: number; body: string }>(),
  ]);

  // Periods are unique across kinds (2026-W40, 2026-10, 2026-Q4), so within a track the period alone finds a source.
  const written = new Map(rows.results.map((row) => [row.period, row.body]));

  return {
    kind,
    period,
    sources: keys.map((key) => ({ ...key, body: written.get(key.period) ?? null })),
    signals: closeSignals(signals, from, to),
    goals,
    existing: saved.results[0] ?? null,
  };
}

/** The route's rung and period, or null when either is not one a close takes. */
export function closePeriodOf(params: { kind?: string | string[]; period?: string | string[] }) {
  const kind = CloseKind.safeParse(params.kind).data;
  const period = z.string().safeParse(params.period).data;

  return kind !== undefined && period !== undefined && isClosePeriod(kind, period)
    ? { kind, period }
    : null;
}
