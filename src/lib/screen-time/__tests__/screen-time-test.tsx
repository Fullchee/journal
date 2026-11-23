import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as BackgroundTask from "expo-background-task";
import storage from "expo-sqlite/kv-store";
import * as TaskManager from "expo-task-manager";
import type { ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  defineScreenTimeTask,
  deviceSlug,
  sendScreenTime,
  useScreenTimeSync,
  useUsageAccess,
} from "@/lib/screen-time/screen-time.android";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../../modules/journal-android";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../../../jest/fake-api";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));

jest.mock("expo-sqlite/kv-store", () => {
  const items = new Map<string, string>();

  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(items.get(key) ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        items.set(key, value);

        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        items.delete(key);

        return Promise.resolve();
      }),
    },
  };
});

// 15:00 UTC is 10:00 in Toronto; the window opens at midnight five Days before.
const NOW = new Date("2026-11-12T15:00:00Z");
const FROM = Date.parse("2026-11-07T05:00:00Z");

const DEVICE_KEY = "screen-time:device";

const serve = (fail = false) =>
  fakeApi({
    "POST /api/screen-time": () => {
      if (fail) throw new Error("offline");

      return { stored: 6 };
    },
  });

const native = jest.mocked(JournalAndroid);

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  // Lets the last test's send finish, so each test starts a fresh one.
  await new Promise((resolve) => setImmediate(resolve));
  await storage.removeItem(DEVICE_KEY);
  jest.clearAllMocks();
  native.hasUsageAccess.mockReturnValue(true);
  // Half an hour on the evening of 11 Nov, Toronto time.
  native.screenEvents.mockReturnValue([
    { at: Date.parse("2026-11-12T03:00:00Z"), on: true },
    { at: Date.parse("2026-11-12T03:30:00Z"), on: false },
  ]);
});

afterEach(() => jest.useRealTimers());

const WEEK = [
  { day: "2026-11-07", minutes: 0 },
  { day: "2026-11-08", minutes: 0 },
  { day: "2026-11-09", minutes: 0 },
  { day: "2026-11-10", minutes: 0 },
  { day: "2026-11-11", minutes: 30 },
  { day: "2026-11-12", minutes: 0 },
];

describe("deviceSlug", () => {
  it.each([
    ["Alex's Pixel 8", "alex-s-pixel-8"],
    ["  Pixel  ", "pixel"],
    ["!!!", "phone"],
  ])("turns %s into %s", (name, slug) => {
    expect(deviceSlug(name)).toBe(slug);
  });
});

describe("sendScreenTime", () => {
  it("posts the last six Days under the phone's name, and keeps that name", async () => {
    const { writes } = serve();

    expect(await sendScreenTime()).toBe(true);
    expect(native.screenEvents).toHaveBeenCalledWith(FROM, NOW.getTime());
    expect(writes).toEqual([
      {
        path: "/api/screen-time",
        method: "POST",
        body: { device: "example-phone", days: WEEK },
      },
    ]);

    native.deviceName.mockReturnValueOnce("Renamed");
    await sendScreenTime();

    expect(writes[1]?.body).toMatchObject({ device: "example-phone" });
  });

  it("sends nothing without Usage access", async () => {
    const { writes } = serve();
    native.hasUsageAccess.mockReturnValue(false);

    expect(await sendScreenTime()).toBe(false);
    expect(writes).toEqual([]);
  });
});

const runTask = () => {
  defineScreenTimeTask();
  const [[, task] = []] = jest.mocked(TaskManager.defineTask).mock.calls;

  return task?.({ data: null, error: null, executionInfo: { eventId: "", taskName: "" } });
};

describe("defineScreenTimeTask", () => {
  it("reports success once the Days are sent", async () => {
    serve();

    expect(await runTask()).toBe(BackgroundTask.BackgroundTaskResult.Success);
  });

  it("reports a failed send so WorkManager retries", async () => {
    serve(true);

    expect(await runTask()).toBe(BackgroundTask.BackgroundTaskResult.Failed);
  });
});

async function renderSync() {
  const client = createQueryClient();
  const invalidate = jest.spyOn(client, "invalidateQueries");

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const { unmount } = await renderHook(() => useScreenTimeSync(), { wrapper });

  return { unmount, invalidate };
}

const listeners: ((state: AppStateStatus) => void)[] = [];

const emit = (state: AppStateStatus) => {
  for (const listener of listeners) listener(state);
};

const captureListeners = () => {
  listeners.length = 0;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    listeners.push(listener);

    return { remove: jest.fn() };
  });
};

describe("useScreenTimeSync", () => {
  beforeEach(captureListeners);

  it("sends on open, schedules the daily job and refreshes the totals", async () => {
    const { writes } = serve();
    const { invalidate, unmount } = await renderSync();

    await waitFor(() => expect(writes).toHaveLength(1));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["targets"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["screen-time"] });
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith("screen-time", {
      minimumInterval: 1440,
    });
    await unmount();
  });

  it("sends again on return to the front, but not on leaving", async () => {
    const { writes } = serve();
    const { unmount } = await renderSync();
    await waitFor(() => expect(writes).toHaveLength(1));

    await act(async () => {
      emit("background");
      emit("active");
      await new Promise((resolve) => setImmediate(resolve));
    });

    await waitFor(() => expect(writes).toHaveLength(2));
    await unmount();
  });

  it("refreshes nothing when the send fails", async () => {
    serve(true);
    const { invalidate, unmount } = await renderSync();

    await act(() => new Promise((resolve) => setImmediate(resolve)));

    expect(invalidate).not.toHaveBeenCalled();
    await unmount();
  });
});

describe("useUsageAccess", () => {
  beforeEach(captureListeners);

  it("reads the switch again on return from Settings, and opens it", async () => {
    native.hasUsageAccess.mockReturnValue(false);
    const { result, unmount } = await renderHook(() => useUsageAccess());

    expect(result.current.granted).toBe(false);
    result.current.open();
    expect(native.openUsageAccessSettings).toHaveBeenCalled();

    native.hasUsageAccess.mockReturnValue(true);
    await act(() => emit("background"));
    expect(result.current.granted).toBe(false);
    await act(() => emit("active"));
    expect(result.current.granted).toBe(true);
    await unmount();
  });
});
