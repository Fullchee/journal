import * as z from "zod/mini";

export const PlanActionStatus = z.enum(["pending", "done", "missed", "blocked"]);

export type PlanActionStatus = z.infer<typeof PlanActionStatus>;

/**
 * Done Plan actions over planned ones, leaving out Blocked actions. Pass only the planned actions: If time ones never count.
 * Null while any action is pending (the Plan is unscored) or when nothing is left to score.
 */
export function hitRate(planned: readonly PlanActionStatus[]): number | null {
  if (planned.includes("pending")) return null;
  const scored = planned.filter((status) => status !== "blocked");

  return scored.length === 0
    ? null
    : scored.filter((status) => status === "done").length / scored.length;
}
