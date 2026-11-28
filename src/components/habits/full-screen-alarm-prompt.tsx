import { SettingPrompt } from "@/components/setting-prompt";
import { useFullScreenAlarms } from "@/lib/alarms/full-screen-alarms";

/** Asks for full-screen alarms on an Android phone that denies them; quiet everywhere else. */
export const FullScreenAlarmPrompt = () => (
  <SettingPrompt
    access={useFullScreenAlarms()}
    reason="Alarms ring as a plain notification: Android blocks their screen over the lock screen."
    action="Allow full-screen alarms"
  />
);
