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
}>("JournalAndroid");
