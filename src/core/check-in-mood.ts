// Tense, Low and Tired: three rows on each Check-in, each None, Some or A lot (issue #108).
import * as z from "zod/mini";

import type { BriefRow } from "./session-brief";

/** Stored as the index: 0 None, 1 Some, 2 A lot (matches the check_ins CHECK). */
export const AMOUNTS = ["None", "Some", "A lot"] as const;

const A_LOT = 2;

/** A row as the brief reads it; "" is a row left untouched, which is not None. */
export const AmountLabel = z.enum(["", ...AMOUNTS]);

export type AmountLabel = z.infer<typeof AmountLabel>;

export const amountLabel = (amount: number | null): AmountLabel =>
  amount === null ? "" : (AMOUNTS[amount] ?? "");

/** Tired but wired is tense arousal and low energy at once; the Tense row stores in `tense`. */
export const isTiredButWired = ({ tense, tired }: { tense: number | null; tired: number | null }) =>
  tense === A_LOT && tired === A_LOT;

const ROWS = [
  { key: "tense", label: "Tense" },
  { key: "low", label: "Low" },
  { key: "tired", label: "Tired" },
] as const;

const checkIns = (count: number) => `${count} ${count === 1 ? "Check-in" : "Check-ins"}`;

// Counts, never an average: a None, Some or A lot is not a score.
function rowLine(rows: BriefRow[], { key, label }: (typeof ROWS)[number]) {
  const answered = rows.filter((row) => row[key] !== "");

  if (answered.length === 0) return [];

  const counts: string[] = [];

  for (const amount of AMOUNTS.toReversed()) {
    const count = answered.filter((row) => row[key] === amount).length;

    if (count > 0) counts.push(`${amount} on ${count}`);
  }

  const [first, ...rest] = counts;

  // A row answered at least once has a first amount.
  return [[`${label}: ${String(first)} of ${checkIns(answered.length)}`, ...rest].join(", ")];
}

/** The Session brief's and the Weekly retro's lines for the three rows, then the tired-but-wired count. */
export function moodLines(rows: BriefRow[]) {
  const wired = rows.filter((row) => row.tiredButWired).length;

  return [
    ...ROWS.flatMap((row) => rowLine(rows, row)),
    ...(wired > 0 ? [`Tired but wired (Tense and Tired both A lot): ${checkIns(wired)}`] : []),
  ];
}
