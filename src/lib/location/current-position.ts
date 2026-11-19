import type { Position } from "@/core";

/** Positions are read in the Android app only (current-position.android.ts). */
export const currentPosition = (): Promise<Position | null> => Promise.resolve(null);
