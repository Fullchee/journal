import { torontoDay } from "@/core";
import storage from "expo-sqlite/kv-store";
import { useSyncExternalStore } from "react";
import * as z from "zod/mini";

const SILENCED_KEY = "alarms.silenced";

export const canSilence = () => true;

/** Only one Day's silences are kept: a ring silenced yesterday rings again today. */
const Silenced = z.object({ day: z.string(), habits: z.array(z.string()) });

type Silenced = z.infer<typeof Silenced>;

const NONE: string[] = [];

const listeners = new Set<() => void>();

// Read from the phone on first use, then replaced by each toggle.
interface SilencedStore {
  silenced: Silenced | null;
}

const store: SilencedStore = { silenced: null };

function stored(): Silenced {
  const text = storage.getItemSync(SILENCED_KEY);

  return text === null ? { day: "", habits: [] } : Silenced.parse(JSON.parse(text));
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

function silencedToday() {
  const { day, habits } = (store.silenced ??= stored());

  return day === torontoDay(new Date()) ? habits : NONE;
}

/** The Habits whose ring the owner silenced today; it survives a relaunch, since only the phone rings. */
export const useSilencedAlarms = () => useSyncExternalStore(subscribe, silencedToday);

function save(habits: string[]) {
  const silenced = { day: torontoDay(new Date()), habits };

  storage.setItemSync(SILENCED_KEY, JSON.stringify(silenced));
  store.silenced = silenced;

  for (const listener of listeners) listener();
}

/** Silences today's ring for one Habit, or brings it back. */
export function toggleSilenced(habitId: string) {
  const was = silencedToday();

  save(was.includes(habitId) ? was.filter((id) => id !== habitId) : [...was, habitId]);
}

/** Silences today's ring for one Habit; the upcoming-alarm notice's Dismiss can't bring it back. */
export function silenceToday(habitId: string) {
  const was = silencedToday();

  if (!was.includes(habitId)) save([...was, habitId]);
}
