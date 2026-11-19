// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import type { AlarmSoundInfo } from "../../../modules/journal-android";

/** Alarms ring in the Android app only, so elsewhere there's no sound to show or pick. */
export const useAlarmSound = (): AlarmSoundInfo | null => null;

export async function pickAlarmSound() {
  // Nothing to pick off Android.
}
