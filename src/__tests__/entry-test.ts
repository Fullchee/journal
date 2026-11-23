import "@/entry";

import { registerAlarmActions } from "@/lib/alarms/alarm-actions";
import { defineScreenTimeTask } from "@/lib/screen-time/screen-time";

jest.mock("expo-router/entry", () => ({}));

jest.mock("@/lib/alarms/alarm-actions", () => ({ registerAlarmActions: jest.fn() }));

jest.mock("@/lib/screen-time/screen-time", () => ({ defineScreenTimeTask: jest.fn() }));

test("the app entry registers the notification buttons' background handler", () => {
  expect(registerAlarmActions).toHaveBeenCalled();
});

test("the app entry defines the daily screen time job", () => {
  expect(defineScreenTimeTask).toHaveBeenCalled();
});
