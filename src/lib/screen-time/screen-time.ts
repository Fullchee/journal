/** Screen time is read on Android only; see `screen-time.android.ts`. A Mac sends its own with scripts/screen-time.ts. */
export function defineScreenTimeTask() {
  // No background job off Android.
}

export function useScreenTimeSync() {
  // Nothing to send off Android.
}

/** Off Android there is no Usage access to ask for. */
export const useUsageAccess = (): { granted: boolean; open: () => void } | null => null;
