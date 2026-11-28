import { useSettingAccess } from "@/hooks/use-setting-access";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../modules/journal-android";

const canUseFullScreenIntent = () => JournalAndroid.canUseFullScreenIntent();
const openFullScreenIntentSettings = () => JournalAndroid.openFullScreenIntentSettings();

/** Whether a ringing alarm may open its screen over the lock screen, read again on return from Settings. */
export const useFullScreenAlarms = () =>
  useSettingAccess(canUseFullScreenIntent, openFullScreenIntentSettings);
