/** Alarms ring in the Android app only, so elsewhere no ring can be silenced. */
export const canSilence = () => false;

const NONE: string[] = [];

export const useSilencedAlarms = () => NONE;

export function toggleSilenced(_habitId: string) {
  // Nothing rings off Android.
}

export function silenceToday(_habitId: string) {
  // Nothing rings off Android.
}
