import { useSyncExternalStore } from "react";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid, { type AlarmSoundInfo } from "../../../modules/journal-android";

const listeners = new Set<() => void>();

// Read from the phone on first use, then replaced by each pick.
interface SoundStore {
  sound: AlarmSoundInfo | null;
}

const store: SoundStore = { sound: null };

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

const current = () => (store.sound ??= JournalAndroid.alarmSound());

/** A new object after each pick, even of a song with the same title, so the alarm schedule re-creates its channel. */
export const useAlarmSound = () => useSyncExternalStore(subscribe, current);

export async function pickAlarmSound() {
  const picked = await JournalAndroid.pickAlarmSound();

  if (!picked) return;

  store.sound = picked;

  for (const listener of listeners) listener();
}
