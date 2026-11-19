import notifee from "react-native-notify-kit";

import { useCheckInPrompt } from "@/lib/check-in-prompt/use-check-in-prompt";

test("off Android, no Check-in prompt is scheduled or listened for", () => {
  useCheckInPrompt();

  expect(notifee.createTriggerNotification).not.toHaveBeenCalled();
  expect(notifee.onForegroundEvent).not.toHaveBeenCalled();
});
