import "@/entry";

import { registerAlarmActions } from "@/lib/alarms/alarm-actions";

jest.mock("expo-router/entry", () => ({}));

jest.mock("@/lib/alarms/alarm-actions", () => ({ registerAlarmActions: jest.fn() }));

test("the app entry registers the notification buttons' background handler", () => {
  expect(registerAlarmActions).toHaveBeenCalled();
});
