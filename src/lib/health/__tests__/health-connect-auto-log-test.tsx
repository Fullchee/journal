import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { HEALTH_CONNECT_ORIGINS } from "@/core";
import storage from "expo-sqlite/kv-store";
import type { ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  SdkAvailabilityStatus,
  getGrantedPermissions,
  getSdkStatus,
  readRecords,
  requestPermission,
} from "react-native-health-connect";

import {
  healthConnectAutoLog,
  useHealthConnectAutoLog,
} from "@/lib/health/health-connect-auto-log.android";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../../../jest/fake-api";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

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

jest.mock("react-native-health-connect", () => ({
  SdkAvailabilityStatus: { SDK_UNAVAILABLE: 1, SDK_AVAILABLE: 3 },
  getSdkStatus: jest.fn(),
  initialize: jest.fn(() => Promise.resolve(true)),
  requestPermission: jest.fn(),
  getGrantedPermissions: jest.fn(),
  readRecords: jest.fn(),
}));

const LINK_KEY = "calm-auto-log";

const CALM_PACKAGE = HEALTH_CONNECT_ORIGINS.calm.package;
const HEVY_KEY = "hevy-auto-log";

const MINDFULNESS = [{ accessType: "read", recordType: "MindfulnessSession" }] as const;
const EXERCISE = { accessType: "read", recordType: "ExerciseSession" } as const;

// 12:00 UTC is 07:00 in Toronto.
const NOW = new Date("2026-11-11T12:00:00Z");

const session = (startTime: string, endTime: string) => ({
  recordType: "MindfulnessSession",
  startTime,
  endTime,
  mindfulnessSessionType: 1,
  metadata: { dataOrigin: CALM_PACKAGE },
});

const MORNING = session("2026-11-10T12:30:00Z", "2026-11-10T12:40:00Z");

function serve(added = 1, fail = false) {
  return fakeApi({
    "POST /api/habits": () => {
      if (fail) throw new Error("offline");

      return { added };
    },
  });
}

const linkText = (readAt: string | null) => JSON.stringify({ habit: "meditate", readAt });

const storedLink = () => storage.getItem(LINK_KEY);

const importDurations = jest.fn(() => Promise.resolve(1));

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  // Lets the last test's read finish, so each test starts a fresh one.
  await new Promise((resolve) => setImmediate(resolve));
  await storage.removeItem(LINK_KEY);
  await storage.removeItem(HEVY_KEY);
  jest.clearAllMocks();
  jest.mocked(readRecords).mockReset();
  jest.mocked(getSdkStatus).mockResolvedValue(SdkAvailabilityStatus.SDK_AVAILABLE);
  jest.mocked(requestPermission).mockResolvedValue([...MINDFULNESS]);
  jest.mocked(getGrantedPermissions).mockResolvedValue([...MINDFULNESS]);
  jest.mocked(readRecords).mockResolvedValue({ records: [MORNING] });
});

afterEach(() => jest.useRealTimers());

describe("healthConnectAutoLog.link", () => {
  it("reads Calm's last 30 days, logs them on the Habit and remembers when it read", async () => {
    const result = await healthConnectAutoLog.link("calm", "meditate", importDurations);

    expect(result).toEqual({ status: "linked", added: 1 });
    expect(readRecords).toHaveBeenCalledWith("MindfulnessSession", {
      timeRangeFilter: { operator: "after", startTime: "2026-10-12T12:00:00.000Z" },
      dataOriginFilter: [CALM_PACKAGE],
    });
    expect(importDurations).toHaveBeenCalledWith({
      habit: "meditate",
      entries: [{ date: "2026-11-10", startTime: "07:30", minutes: 10 }],
    });
    expect(await storedLink()).toBe(linkText(NOW.toISOString()));
    expect(await healthConnectAutoLog.linkedHabit("calm")).toBe("meditate");
  });

  it("reads every page Health Connect returns, skipping records it can't read", async () => {
    const evening = session("2026-11-10T23:00:00Z", "2026-11-10T23:20:00Z");
    const broken = session("yesterday", "2026-11-10T23:20:00Z");

    jest
      .mocked(readRecords)
      .mockResolvedValueOnce({ records: [MORNING, broken], pageToken: "next" })
      .mockResolvedValueOnce({ records: [evening], pageToken: "" });

    await healthConnectAutoLog.link("calm", "meditate", importDurations);

    expect(jest.mocked(readRecords).mock.calls[1]?.[1]).toMatchObject({ pageToken: "next" });
    expect(importDurations).toHaveBeenCalledWith({
      habit: "meditate",
      entries: [
        { date: "2026-11-10", startTime: "07:30", minutes: 10 },
        { date: "2026-11-10", startTime: "18:00", minutes: 20 },
      ],
    });
  });

  it("posts nothing when Calm has no sessions yet", async () => {
    jest.mocked(readRecords).mockResolvedValue({ records: [] });

    expect(await healthConnectAutoLog.link("calm", "meditate", importDurations)).toEqual({
      status: "linked",
      added: 0,
    });
    expect(importDurations).not.toHaveBeenCalled();
  });

  it("reads Hevy's workouts from Exercise on its own link, leaving Calm's alone", async () => {
    const workout = {
      ...session("2026-11-10T22:48:00Z", "2026-11-11T01:09:00Z"),
      recordType: "ExerciseSession",
      metadata: { dataOrigin: HEALTH_CONNECT_ORIGINS.hevy.package },
    };

    jest.mocked(requestPermission).mockResolvedValue([EXERCISE]);
    jest.mocked(readRecords).mockResolvedValue({ records: [workout] });

    expect(await healthConnectAutoLog.link("hevy", "lift", importDurations)).toEqual({
      status: "linked",
      added: 1,
    });
    expect(readRecords).toHaveBeenCalledWith("ExerciseSession", {
      timeRangeFilter: { operator: "after", startTime: "2026-10-12T12:00:00.000Z" },
      dataOriginFilter: [HEALTH_CONNECT_ORIGINS.hevy.package],
    });
    expect(importDurations).toHaveBeenCalledWith({
      habit: "lift",
      entries: [{ date: "2026-11-10", startTime: "17:48", minutes: 141 }],
    });
    expect(await healthConnectAutoLog.linkedHabit("hevy")).toBe("lift");
    expect(await healthConnectAutoLog.linkedHabit("calm")).toBeNull();
  });

  it("stops when Health Connect is missing or outdated", async () => {
    jest.mocked(getSdkStatus).mockResolvedValue(SdkAvailabilityStatus.SDK_UNAVAILABLE);

    expect(await healthConnectAutoLog.link("calm", "meditate", importDurations)).toEqual({
      status: "unavailable",
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(await healthConnectAutoLog.linkedHabit("calm")).toBeNull();
  });

  it("stops when the owner doesn't allow reading Mindfulness", async () => {
    jest.mocked(requestPermission).mockResolvedValue([{ accessType: "read", recordType: "Steps" }]);

    expect(await healthConnectAutoLog.link("calm", "meditate", importDurations)).toEqual({
      status: "denied",
    });
    expect(await healthConnectAutoLog.linkedHabit("calm")).toBeNull();
  });
});

describe("healthConnectAutoLog.unlink", () => {
  it("forgets the linked Habit", async () => {
    await healthConnectAutoLog.link("calm", "meditate", importDurations);
    await healthConnectAutoLog.unlink("calm");

    expect(await healthConnectAutoLog.linkedHabit("calm")).toBeNull();
  });

  it.each([
    ["not_json", "{"],
    ["wrong_shape", '{"habit":3}'],
  ])("treats an unreadable stored link as none: %s", async (_id, text) => {
    await storage.setItem(LINK_KEY, text);

    expect(await healthConnectAutoLog.linkedHabit("calm")).toBeNull();
  });
});

const link = (readAt: string | null) => storage.setItem(LINK_KEY, linkText(readAt));

async function mountAutoLog() {
  const client = createQueryClient();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return renderHook(useHealthConnectAutoLog, { wrapper });
}

describe("useHealthConnectAutoLog", () => {
  it("logs new sessions on the linked Habit when the app opens, from a day before the last read", async () => {
    await link("2026-11-10T08:00:00.000Z");
    const { writes } = serve();

    await mountAutoLog();

    await waitFor(async () => expect(await storedLink()).toBe(linkText(NOW.toISOString())));
    expect(jest.mocked(readRecords).mock.calls[0]?.[1].timeRangeFilter).toEqual({
      operator: "after",
      startTime: "2026-11-09T08:00:00.000Z",
    });
    expect(writes.map(({ body }) => body)).toEqual([
      {
        type: "import-durations",
        habit: "meditate",
        entries: [{ date: "2026-11-10", startTime: "07:30", minutes: 10 }],
      },
    ]);
  });

  it("reads each linked source with the access the owner granted it", async () => {
    await link(null);
    await storage.setItem(HEVY_KEY, JSON.stringify({ habit: "lift", readAt: null }));
    jest.mocked(getGrantedPermissions).mockResolvedValue([...MINDFULNESS, EXERCISE]);
    jest.mocked(readRecords).mockResolvedValue({ records: [] });

    await mountAutoLog();

    await waitFor(async () =>
      expect(await storage.getItem(HEVY_KEY)).toBe(
        JSON.stringify({ habit: "lift", readAt: NOW.toISOString() }),
      ),
    );
    expect(jest.mocked(readRecords).mock.calls.map(([type]) => type)).toEqual([
      "MindfulnessSession",
      "ExerciseSession",
    ]);
  });

  it("reads nothing until a Habit is linked", async () => {
    const { writes } = serve();

    await mountAutoLog();
    await act(() => Promise.resolve());

    expect(getSdkStatus).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("reads nothing once the owner revokes Mindfulness access", async () => {
    await link(null);
    jest.mocked(getGrantedPermissions).mockResolvedValue([]);

    await mountAutoLog();

    await waitFor(() => expect(getGrantedPermissions).toHaveBeenCalled());
    expect(readRecords).not.toHaveBeenCalled();
  });

  it("keeps the last read time when the import fails, so the next open retries", async () => {
    await link("2026-11-10T08:00:00.000Z");
    const { writes } = serve(0, true);

    await mountAutoLog();

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(await storedLink()).toBe(linkText("2026-11-10T08:00:00.000Z"));
  });

  it("reads again when the app comes back to the front", async () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];

    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      listeners.push(listener);

      return { remove: jest.fn() };
    });
    await link(null);
    serve();

    await mountAutoLog();
    await waitFor(() => expect(readRecords).toHaveBeenCalledTimes(1));
    await act(() => {
      for (const listener of listeners) listener("background");

      for (const listener of listeners) listener("active");
    });

    await waitFor(() => expect(readRecords).toHaveBeenCalledTimes(2));
  });
});
