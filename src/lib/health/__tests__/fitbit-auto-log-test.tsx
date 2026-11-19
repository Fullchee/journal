import { act, renderHook, waitFor } from "@testing-library/react-native";
import { FITBIT_PACKAGE } from "@/core";
import storage from "expo-sqlite/kv-store";
import {
  SdkAvailabilityStatus,
  getGrantedPermissions,
  getSdkStatus,
  readRecords,
  requestPermission,
} from "react-native-health-connect";

import { fitbitAutoLog, useFitbitAutoLog } from "@/lib/health/fitbit-auto-log.android";
import type { FitbitWriters } from "@/lib/health/fitbit-auto-log";

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

interface WritersState {
  current: FitbitWriters | null;
}

const mockWriters: WritersState = { current: null };

jest.mock("@/lib/health/fitbit-writers", () => ({
  useFitbitWriters: () => mockWriters.current,
}));

const ALL_READS = [
  { accessType: "read", recordType: "Steps" },
  { accessType: "read", recordType: "SleepSession" },
  { accessType: "read", recordType: "ExerciseSession" },
] as const;

// 17:00 UTC is noon in Toronto.
const NOW = new Date("2026-11-12T17:00:00Z");

const fitbit = { dataOrigin: FITBIT_PACKAGE };

// A Day over the 8000-step threshold.
const steps = (startTime: string) => ({
  recordType: "Steps",
  startTime,
  endTime: startTime,
  count: 9000,
  metadata: fitbit,
});

const WORKOUT = {
  recordType: "ExerciseSession",
  startTime: "2026-11-12T07:00:00-05:00",
  endTime: "2026-11-12T07:40:00-05:00",
  exerciseType: 56,
  metadata: fitbit,
};

const check = jest.fn();

const importDurations = jest.fn(() => Promise.resolve(1));

const STYLES: FitbitWriters["recordStyles"] = { walk: "check", rest: "check", lift: "duration" };

const writers = (counts: FitbitWriters["counts"] = {}, recordStyles = STYLES): FitbitWriters => ({
  counts,
  recordStyles,
  check,
  importDurations,
});

const stored = (rule: string) => storage.getItem(`fitbit-auto-log:${rule}`);

interface Stored {
  habit: string;
  threshold: number;
  since: string;
  readAt: string | null;
}

const store = (rule: string, link: Stored) =>
  storage.setItem(`fitbit-auto-log:${rule}`, JSON.stringify(link));

const WALK: Stored = {
  habit: "walk",
  threshold: 8000,
  since: "2026-11-05",
  readAt: "2026-11-11T17:00:00.000Z",
};

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });

  for (const rule of ["steps", "sleep", "exercise"])
    await storage.removeItem(`fitbit-auto-log:${rule}`);
  jest.clearAllMocks();
  jest.mocked(readRecords).mockReset();
  mockWriters.current = writers();
  jest.mocked(getSdkStatus).mockResolvedValue(SdkAvailabilityStatus.SDK_AVAILABLE);
  jest.mocked(requestPermission).mockResolvedValue([...ALL_READS]);
  jest.mocked(getGrantedPermissions).mockResolvedValue([...ALL_READS]);
  jest.mocked(readRecords).mockResolvedValue({ records: [steps("2026-11-12T08:00:00-05:00")] });
});

afterEach(() => jest.useRealTimers());

describe("fitbitAutoLog.link", () => {
  it("reads Fitbit's steps from the Day before today and marks today done", async () => {
    const result = await fitbitAutoLog.link("steps", { habit: "walk", threshold: 8000 }, writers());

    expect(result).toEqual({ status: "linked", added: 1 });
    expect(requestPermission).toHaveBeenCalledWith([{ accessType: "read", recordType: "Steps" }]);
    expect(readRecords).toHaveBeenCalledWith("Steps", {
      timeRangeFilter: { operator: "after", startTime: "2026-11-11T05:00:00.000Z" },
      dataOriginFilter: [FITBIT_PACKAGE],
    });
    expect(check).toHaveBeenCalledWith([{ date: "2026-11-12", habit: "walk", count: 1 }]);
    expect(JSON.parse((await stored("steps")) ?? "")).toEqual({
      habit: "walk",
      threshold: 8000,
      since: "2026-11-12",
      readAt: NOW.toISOString(),
    });
    expect(await fitbitAutoLog.links()).toEqual({
      steps: { habit: "walk", threshold: 8000 },
    });
  });

  it("leaves a Day the owner already answered alone", async () => {
    const result = await fitbitAutoLog.link(
      "steps",
      { habit: "walk", threshold: 8000 },
      writers({ "2026-11-12": { walk: -1 } }),
    );

    expect(result).toEqual({ status: "linked", added: 0 });
    expect(check).toHaveBeenCalledWith([]);
  });

  it("imports Fitbit's exercise minutes on a Duration Habit, reading every page", async () => {
    jest
      .mocked(readRecords)
      .mockResolvedValueOnce({
        records: [WORKOUT],
        pageToken: "next",
      })
      .mockResolvedValueOnce({ records: [], pageToken: "" });

    const result = await fitbitAutoLog.link(
      "exercise",
      { habit: "lift", threshold: 20 },
      writers(),
    );

    expect(result).toEqual({ status: "linked", added: 1 });
    expect(jest.mocked(readRecords).mock.calls[1]?.[1]).toMatchObject({ pageToken: "next" });
    expect(importDurations).toHaveBeenCalledWith({
      habit: "lift",
      entries: [{ date: "2026-11-12", startTime: "07:00", minutes: 40 }],
    });
  });

  it("posts nothing when Fitbit has no exercise yet", async () => {
    jest.mocked(readRecords).mockResolvedValue({ records: [] });

    expect(
      await fitbitAutoLog.link("exercise", { habit: "lift", threshold: 20 }, writers()),
    ).toEqual({ status: "linked", added: 0 });
    expect(importDurations).not.toHaveBeenCalled();
  });

  it("stops when Health Connect is missing or outdated", async () => {
    jest.mocked(getSdkStatus).mockResolvedValue(SdkAvailabilityStatus.SDK_UNAVAILABLE);

    expect(await fitbitAutoLog.link("sleep", { habit: "rest", threshold: 7 }, writers())).toEqual({
      status: "unavailable",
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(await fitbitAutoLog.links()).toEqual({});
  });

  it("stops when the owner doesn't allow reading the rule's records", async () => {
    jest.mocked(requestPermission).mockResolvedValue([{ accessType: "read", recordType: "Steps" }]);

    expect(await fitbitAutoLog.link("sleep", { habit: "rest", threshold: 7 }, writers())).toEqual({
      status: "denied",
    });
    expect(await fitbitAutoLog.links()).toEqual({});
  });
});

describe("fitbitAutoLog.setThreshold and unlink", () => {
  it("changes a linked rule's threshold and keeps the rest", async () => {
    await store("steps", WALK);

    await fitbitAutoLog.setThreshold("steps", 10_000);

    expect(JSON.parse((await stored("steps")) ?? "")).toEqual({ ...WALK, threshold: 10_000 });
  });

  it("stores nothing for a rule with no link", async () => {
    await fitbitAutoLog.setThreshold("sleep", 8);

    expect(await stored("sleep")).toBeNull();
  });

  it("forgets the rule's Habit", async () => {
    await store("steps", WALK);
    await fitbitAutoLog.unlink("steps");

    expect(await fitbitAutoLog.links()).toEqual({});
  });

  it.each([
    ["not_json", "{"],
    ["wrong_shape", '{"habit":3}'],
  ])("treats an unreadable stored link as none: %s", async (_id, text) => {
    await storage.setItem("fitbit-auto-log:steps", text);

    expect(await fitbitAutoLog.links()).toEqual({});
  });
});

const mountAutoLog = () => renderHook(useFitbitAutoLog);

describe("useFitbitAutoLog", () => {
  it("completes each linked Habit from a Day before the last read when the app opens", async () => {
    await store("steps", WALK);
    await store("sleep", { ...WALK, habit: "rest", threshold: 7 });
    jest.mocked(readRecords).mockImplementation((type) =>
      Promise.resolve({
        records:
          type === "Steps"
            ? [
                steps("2026-11-09T08:00:00-05:00"),
                steps("2026-11-10T08:00:00-05:00"),
                steps("2026-11-11T08:00:00-05:00"),
              ]
            : [],
      }),
    );

    await mountAutoLog();

    await waitFor(async () =>
      expect(JSON.parse((await stored("sleep")) ?? "")).toMatchObject({
        readAt: NOW.toISOString(),
      }),
    );
    expect(readRecords).toHaveBeenCalledWith("Steps", {
      timeRangeFilter: { operator: "after", startTime: "2026-11-09T05:00:00.000Z" },
      dataOriginFilter: [FITBIT_PACKAGE],
    });
    // The 9th sits before the first Day, which is the Day before the last read.
    expect(check).toHaveBeenCalledWith([
      { date: "2026-11-10", habit: "walk", count: 1 },
      { date: "2026-11-11", habit: "walk", count: 1 },
    ]);
    expect(check).toHaveBeenCalledWith([]);
  });

  it("reads nothing until a Habit is linked", async () => {
    await mountAutoLog();
    await act(() => Promise.resolve());

    expect(getSdkStatus).not.toHaveBeenCalled();
  });

  it("reads nothing before the history loads, then reads once it does", async () => {
    await store("steps", WALK);
    mockWriters.current = null;

    const { rerender } = await mountAutoLog();
    await act(() => Promise.resolve());

    expect(getSdkStatus).not.toHaveBeenCalled();

    mockWriters.current = writers();
    await rerender({});

    await waitFor(() => expect(readRecords).toHaveBeenCalled());
  });

  it("skips a rule once the owner revokes its access", async () => {
    await store("steps", WALK);
    jest.mocked(getGrantedPermissions).mockResolvedValue([]);

    await mountAutoLog();

    await waitFor(() => expect(getGrantedPermissions).toHaveBeenCalled());
    expect(readRecords).not.toHaveBeenCalled();
  });

  it("keeps the last read time when the import fails, so the next open retries", async () => {
    await store("exercise", { ...WALK, habit: "lift" });
    jest.mocked(readRecords).mockResolvedValue({
      records: [WORKOUT],
    });
    importDurations.mockRejectedValueOnce(new Error("offline"));

    await mountAutoLog();

    await waitFor(() => expect(importDurations).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(JSON.parse((await stored("exercise")) ?? "")).toMatchObject({ readAt: WALK.readAt });
  });

  it("reads again once the Habits refetch, as they do when the app comes back to the front", async () => {
    await store("steps", WALK);

    const { rerender } = await mountAutoLog();

    await waitFor(async () =>
      expect(JSON.parse((await stored("steps")) ?? "")).toMatchObject({
        readAt: NOW.toISOString(),
      }),
    );
    expect(readRecords).toHaveBeenCalledTimes(1);

    mockWriters.current = null;
    await rerender({});
    await act(() => Promise.resolve());

    expect(readRecords).toHaveBeenCalledTimes(1);

    mockWriters.current = writers();
    await rerender({});

    await waitFor(() => expect(readRecords).toHaveBeenCalledTimes(2));
  });

  it("waits while the Habit's Record style no longer takes the rule", async () => {
    await store("steps", WALK);
    await store("sleep", { ...WALK, habit: "gone" });
    mockWriters.current = writers({}, { walk: "duration" });

    await mountAutoLog();

    await waitFor(() => expect(getGrantedPermissions).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(readRecords).not.toHaveBeenCalled();
    expect(JSON.parse((await stored("steps")) ?? "")).toMatchObject({ readAt: WALK.readAt });
  });

  it("completes Days from exercise once a Duration Habit becomes a check Habit", async () => {
    await store("exercise", { ...WALK, habit: "lift", threshold: 20 });
    mockWriters.current = writers({}, { lift: "check" });
    jest.mocked(readRecords).mockResolvedValue({ records: [WORKOUT] });

    await mountAutoLog();

    await waitFor(() =>
      expect(check).toHaveBeenCalledWith([{ date: "2026-11-12", habit: "lift", count: 1 }]),
    );
    expect(importDurations).not.toHaveBeenCalled();
  });

  it.each([
    ["unlinks", () => fitbitAutoLog.unlink("steps"), null],
    ["changes the threshold", () => fitbitAutoLog.setThreshold("steps", 12_000), 12_000],
  ] as const)(
    "keeps the owner's change when they %s during a read",
    async (_change, change, threshold) => {
      await store("steps", WALK);
      jest.mocked(readRecords).mockImplementation(async () => {
        await change();

        return { records: [] };
      });

      await mountAutoLog();

      await waitFor(() => expect(check).toHaveBeenCalled());
      await act(() => Promise.resolve());
      const after = await stored("steps");

      expect(after === null ? null : JSON.parse(after)).toEqual(
        threshold === null ? null : { ...WALK, threshold, readAt: NOW.toISOString() },
      );
    },
  );
});
