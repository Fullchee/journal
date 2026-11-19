import notifee from "react-native-notify-kit";

import { registerAlarmActions, useAlarmActions } from "@/lib/alarms/alarm-actions";

test("off Android, no notification button handler is registered", () => {
  registerAlarmActions();

  expect(notifee.onBackgroundEvent).not.toHaveBeenCalled();
});

test("off Android, the app listens for no notification buttons", () => {
  useAlarmActions();

  expect(notifee.onForegroundEvent).not.toHaveBeenCalled();
});
