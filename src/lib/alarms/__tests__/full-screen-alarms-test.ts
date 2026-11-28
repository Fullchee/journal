import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { useFullScreenAlarms } from "@/lib/alarms/full-screen-alarms.android";
import { useFullScreenAlarms as useFullScreenAlarmsOffAndroid } from "@/lib/alarms/full-screen-alarms";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../../modules/journal-android";

const native = jest.mocked(JournalAndroid);
const listeners: ((state: AppStateStatus) => void)[] = [];

beforeEach(() => {
  listeners.length = 0;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    listeners.push(listener);

    return { remove: jest.fn() };
  });
});

const emit = (state: AppStateStatus) => {
  for (const listener of listeners) listener(state);
};

test("reads the setting again on return from Settings, and opens it", async () => {
  native.canUseFullScreenIntent.mockReturnValue(false);
  const { result, unmount } = await renderHook(() => useFullScreenAlarms());

  expect(result.current.granted).toBe(false);
  result.current.open();
  expect(native.openFullScreenIntentSettings).toHaveBeenCalledTimes(1);

  native.canUseFullScreenIntent.mockReturnValue(true);
  await act(() => emit("background"));
  expect(result.current.granted).toBe(false);
  await act(() => emit("active"));
  expect(result.current.granted).toBe(true);
  await unmount();
});

test("off Android, there is no setting to ask for", () => {
  expect(useFullScreenAlarmsOffAndroid()).toBeNull();
});
