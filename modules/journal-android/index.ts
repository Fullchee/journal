import { requireNativeModule } from "expo";

/** What the alarm sound picker shows for the phone's chosen sound. */
export interface AlarmSoundInfo {
  title: string;
}

/** Android only: import it from `.android.ts` files, so web and iOS never load it. */
export default requireNativeModule<{
  /** Stores the ringing Habits (`WidgetAlarm[]` as JSON) for the alarms widget and redraws it. */
  setAlarms: (json: string) => void;
  /** Stores today's open Habits and the tile's timed Habit (`HabitWidgets` as JSON), then redraws the widget and tile. */
  setHabits: (json: string) => void;
  /** Ends the Quick Settings tile's stopped session once its minutes save; a newer session keeps running. */
  clearTileSession: (startedAtMs: number) => void;
  /** The sound every `alarm` kind Habit rings with: the phone's alarm sound until the owner picks another. */
  alarmSound: () => AlarmSoundInfo;
  /** Opens Android's alarm sound picker; `null` when the owner backs out. */
  pickAlarmSound: () => Promise<AlarmSoundInfo | null>;
  /** Creates the alarm channel for the chosen sound, at alarm volume, and returns its id. */
  createAlarmChannel: () => string;
  /** Whether a ringing alarm may open its screen over the lock screen; Android 14+ lets the owner turn it off. */
  canUseFullScreenIntent: () => boolean;
  /** Opens the full-screen alarms setting for this app; does nothing below Android 14, where it is always on. */
  openFullScreenIntentSettings: () => void;
  /** Opens the ringing alarm's screen; Android allows it only while the app is on screen. */
  showAlarmScreen: () => void;
  /** Whether the owner switched on Usage access, which screen time reads. */
  hasUsageAccess: () => boolean;
  /** Opens the Usage access setting for this app. */
  openUsageAccessSettings: () => void;
  /** The screen's on and off events between two instants in epoch ms, oldest first. */
  screenEvents: (fromMs: number, toMs: number) => { at: number; on: boolean }[];
  /** The phone's name from Settings, or its model. */
  deviceName: () => string;
}>("JournalAndroid");
