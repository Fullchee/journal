import { act, renderHook } from "@testing-library/react-native";

import * as offAndroid from "@/lib/alarms/silenced-alarms";
import * as onAndroid from "@/lib/alarms/silenced-alarms.android";

const mockItems = new Map<string, string>();

jest.mock("expo-sqlite/kv-store", () => ({
  __esModule: true,
  default: {
    getItemSync: (key: string) => mockItems.get(key) ?? null,
    setItemSync: (key: string, value: string) => mockItems.set(key, value),
  },
}));

// A fresh copy of the module is a relaunch: it reads the phone's storage again.
const afterRelaunch = (run: (app: typeof onAndroid) => void) =>
  jest.isolateModules(() => {
    run(jest.requireActual<typeof onAndroid>("@/lib/alarms/silenced-alarms.android"));
  });

const stored = () => mockItems.get("alarms.silenced");

// Local noon is the same Day in Toronto and in UTC, where CI runs.
beforeEach(() => jest.setSystemTime(new Date(2026, 10, 6, 12, 0)));

describe("silenced alarms on Android", () => {
  test("one tap silences a Habit's ring today, and another brings it back", async () => {
    const { result } = await renderHook(onAndroid.useSilencedAlarms);

    expect([onAndroid.canSilence(), result.current]).toEqual([true, []]);

    await act(() => onAndroid.toggleSilenced("out-of-bed"));
    expect(result.current).toEqual(["out-of-bed"]);

    await act(() => onAndroid.toggleSilenced("out-of-bed"));
    expect(result.current).toEqual([]);
  });

  test("a silence survives a relaunch the same Day", () => {
    mockItems.clear();
    afterRelaunch((app) => app.toggleSilenced("out-of-bed"));
    afterRelaunch((app) => app.toggleSilenced("stretch"));

    expect(stored()).toBe(JSON.stringify({ day: "2026-11-06", habits: ["out-of-bed", "stretch"] }));
  });

  test("yesterday's silence no longer holds", () => {
    afterRelaunch((app) => app.toggleSilenced("out-of-bed"));
    jest.setSystemTime(new Date(2026, 10, 7, 12, 0));
    afterRelaunch((app) => app.toggleSilenced("stretch"));

    expect(stored()).toBe(JSON.stringify({ day: "2026-11-07", habits: ["stretch"] }));
  });
});

describe("silenced alarms off Android", () => {
  test("nothing rings, so nothing can be silenced", async () => {
    offAndroid.toggleSilenced("out-of-bed");
    const { result } = await renderHook(offAndroid.useSilencedAlarms);

    expect([offAndroid.canSilence(), result.current]).toEqual([false, []]);
  });
});
