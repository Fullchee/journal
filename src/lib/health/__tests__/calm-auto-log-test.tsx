import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { CALM_PACKAGE } from "@/core";
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

import { calmAutoLog, useCalmAutoLog } from "@/lib/health/calm-auto-log.android";
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

const MINDFULNESS = [{ accessType: "read", recordType: "MindfulnessSession" }] as const;

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
  await storage.removeItem(LINK_KEY);
  jest.clearAllMocks();
  jest.mocked(readRecords).mockReset();
  jest.mocked(getSdkStatus).mockResolvedValue(SdkAvailabilityStatus.SDK_AVAILABLE);
  jest.mocked(requestPermission).mockResolvedValue([...MINDFULNESS]);
  jest.mocked(getGrantedPermissions).mockResolvedValue([...MINDFULNESS]);
  jest.mocked(readRecords).mockResolvedValue({ records: [MORNING] });
});

afterEach(() => jest.useRealTimers());

describe("calmAutoLog.link", () => {
  it("reads Calm's last 30 days, logs them on the Habit and remembers when it read", async () => {
    const result = await calmAutoLog.link("meditate", importDurations);

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
    expect(await calmAutoLog.linkedHabit()).toBe("meditate");
  });

  it("reads every page Health Connect returns, skipping records it can't read", async () => {
    const evening = session("2026-11-10T23:00:00Z", "2026-11-10T23:20:00Z");
    const broken = session("yesterday", "2026-11-10T23:20:00Z");

    jest
      .mocked(readRecords)
      .mockResolvedValueOnce({ records: [MORNING, broken], pageToken: "next" })
      .mockResolvedValueOnce({ records: [evening], pageToken: "" });

    await calmAutoLog.link("meditate", importDurations);

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

    expect(await calmAutoLog.link("meditate", importDurations)).toEqual({
      status: "linked",
      added: 0,
    });
    expect(importDurations).not.toHaveBeenCalled();
  });

  it("stops when Health Connect is missing or outdated", async () => {
    jest.mocked(getSdkStatus).mockResolvedValue(SdkAvailabilityStatus.SDK_UNAVAILABLE);

    expect(await calmAutoLog.link("meditate", importDurations)).toEqual({ status: "unavailable" });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(await calmAutoLog.linkedHabit()).toBeNull();
  });

  it("stops when the owner doesn't allow reading Mindfulness", async () => {
    jest.mocked(requestPermission).mockResolvedValue([{ accessType: "read", recordType: "Steps" }]);

    expect(await calmAutoLog.link("meditate", importDurations)).toEqual({ status: "denied" });
    expect(await calmAutoLog.linkedHabit()).toBeNull();
  });
});

describe("calmAutoLog.unlink", () => {
  it("forgets the linked Habit", async () => {
    await calmAutoLog.link("meditate", importDurations);
    await calmAutoLog.unlink();

    expect(await calmAutoLog.linkedHabit()).toBeNull();
  });

  it.each([
    ["not_json", "{"],
    ["wrong_shape", '{"habit":3}'],
  ])("treats an unreadable stored link as none: %s", async (_id, text) => {
    await storage.setItem(LINK_KEY, text);

    expect(await calmAutoLog.linkedHabit()).toBeNull();
  });
});

const link = (readAt: string | null) => storage.setItem(LINK_KEY, linkText(readAt));

async function mountAutoLog() {
  const client = createQueryClient();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return renderHook(useCalmAutoLog, { wrapper });
}

describe("useCalmAutoLog", () => {
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
