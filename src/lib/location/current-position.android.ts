import {
  Accuracy,
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
  requestForegroundPermissionsAsync,
  type LocationObject,
} from "expo-location";

import type { Position } from "@/core";

const LAST_KNOWN_MAX_AGE_MS = 10 * 60_000;

const FIX_TIMEOUT_MS = 5000;

// The Worker matches a Place within 150 m, so a looser fix can name the wrong Place.
const MAX_ERROR_M = 150;

// Android asks again after a plain denial, so one denial holds until the app restarts.
const permission = { denied: false };

const asPosition = ({ coords: { latitude, longitude } }: LocationObject): Position => ({
  latitude,
  longitude,
});

const isPrecise = (fix: LocationObject | null): fix is LocationObject =>
  fix !== null && fix.coords.accuracy !== null && fix.coords.accuracy <= MAX_ERROR_M;

// A Check-in never waits on a fix: a slow one counts as none.
async function freshFix() {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(resolve, FIX_TIMEOUT_MS, null);
  });

  try {
    return await Promise.race([
      getCurrentPositionAsync({ accuracy: Accuracy.Balanced, mayShowUserSettingsDialog: false }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Where the phone is now, asking for foreground location on first use; null when unknown. Never throws. */
export async function currentPosition(): Promise<Position | null> {
  if (permission.denied) return null;

  try {
    const { granted, android } = await requestForegroundPermissionsAsync();

    if (!granted) {
      permission.denied = true;

      return null;
    }

    // An Approximate grant snaps the point to a grid about 2 km wide.
    if (android?.accuracy !== "fine") return null;

    const lastKnown = await getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: MAX_ERROR_M,
    });

    if (isPrecise(lastKnown)) return asPosition(lastKnown);

    const fix = await freshFix();

    return isPrecise(fix) ? asPosition(fix) : null;
  } catch {
    return null;
  }
}
