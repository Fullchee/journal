/** Alarms ring in the Android app only, so elsewhere there's no full-screen setting to ask for. */
export const useFullScreenAlarms = (): { granted: boolean; open: () => void } | null => null;
