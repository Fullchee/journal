import * as z from "zod/mini";

/** Where the device was when a Check-in was saved, in decimal degrees. */
export const Position = z.object({ latitude: z.number(), longitude: z.number() });

export type Position = z.infer<typeof Position>;

// A fix says where the owner was only within this long of when it was taken.
const FIX_HOLDS_MS = 60 * 60_000;

/** Whether a fix taken at `fixedAt` still says where the owner was at `at`. */
export const fixHolds = (at: string, fixedAt: string) =>
  Math.abs(Date.parse(at) - Date.parse(fixedAt)) <= FIX_HOLDS_MS;
