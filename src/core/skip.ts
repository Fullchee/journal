import { MISSED } from "./habit-day";
import type { Skip } from "./habits-view";

export type SkipCause = Skip["cause"];

/**
 * What a check does to its Day's Skip cause. A `set` always carries the cause, so no caller can store
 * a Skip without one.
 */
export type SkipChange = { kind: "keep" } | { kind: "set"; cause: SkipCause } | { kind: "clear" };

/**
 * A cause lands only on a Not done Day; a Not done without one keeps any cause already given;
 * any other answer or a clear drops it.
 */
export const skipChange = (count: number, cause: SkipCause | undefined): SkipChange => {
  if (count !== MISSED) return { kind: "clear" };

  return cause === undefined ? { kind: "keep" } : { kind: "set", cause };
};
