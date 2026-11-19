import * as z from "zod/mini";

import { cacheStorage } from "@/lib/data/cache-storage";

const TICKS_KEY = "habit-widget-ticks";

// Each Habit's newest widget tick taken, keyed by Habit id: when the widget drew that tick's link.
const Ticks = z.record(z.string(), z.number());

/**
 * True once per Habits widget tick link, which carries when the widget drew it. Android replays a launch link when
 * the owner reopens the app from Recents, and that replay must not re-check a Habit the owner has since unchecked.
 */
export async function claimTick(habit: string, drawnAtMs: number) {
  const ticks = Ticks.parse(JSON.parse((await cacheStorage.getItem(TICKS_KEY)) ?? "{}"));

  // A link with no `at` reads as NaN, which is never newer.
  const isNewer = drawnAtMs > (ticks[habit] ?? 0);

  if (!isNewer) return false;

  await cacheStorage.setItem(TICKS_KEY, JSON.stringify({ ...ticks, [habit]: drawnAtMs }));

  return true;
}
