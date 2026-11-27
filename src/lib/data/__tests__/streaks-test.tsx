import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { checksSince, shiftDay, torontoDay } from "@/core";
import type { ReactNode } from "react";

import { CelebrationProvider } from "@/components/celebration";
import { apiFetch } from "@/lib/api/api-fetch";
import { useCheckHabit, type HabitsBody } from "@/lib/data/habits";
import { createQueryClient } from "@/lib/data/query-client";
import { useHabitRecords } from "@/lib/data/streaks";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../../../jest/fixtures";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <CelebrationProvider>{children}</CelebrationProvider>
      </QueryClientProvider>
    );
  };

const TODAY = torontoDay(new Date());
const OLD_DAY = shiftDay(checksSince(), -3);
const REST = [{ start: OLD_DAY, end: OLD_DAY }];

const tracker: HabitsBody = {
  habits: [habit(), habit({ id: "read", name: "Read" })],
  counts: { [TODAY]: { walk: 1 } },
  durations: {},
  skips: {},
};

// The history's copy of today is older than the tracker's, and only the history reaches back to OLD_DAY.
const history = {
  counts: { [OLD_DAY]: { walk: 1 }, [TODAY]: { walk: 2, read: 1 } },
  durations: {},
  skips: {},
  restPeriods: REST,
  notes: {},
};

const pending = () => Promise.withResolvers<never>().promise;

// Saves never land, so every tap stays unsent.
function serve({ historyLoads }: { historyLoads: boolean }) {
  jest.mocked(apiFetch).mockImplementation((path, init) => {
    if (init.method === "POST") return pending();

    if (path === "/api/streaks") return historyLoads ? Promise.resolve(history) : pending();

    return Promise.resolve(tracker);
  });
}

describe("useHabitRecords", () => {
  it("lays the tracker's recent Days over the history, and knows the whole once it loads", async () => {
    serve({ historyLoads: true });

    const { result } = await renderHook(useHabitRecords, {
      wrapper: wrapperFor(createQueryClient()),
    });

    await waitFor(() => expect(result.current.whole).not.toBeNull());
    expect(result.current.records).toEqual({
      counts: { [OLD_DAY]: { walk: 1 }, [TODAY]: { walk: 1, read: 1 } },
      durations: {},
      skips: {},
      restPeriods: REST,
    });
    expect(result.current.whole).toBe(result.current.records);
    await waitFor(() => expect(result.current.fresh).toBe(true));
  });

  it("holds only the recent Days, and no whole, until the history loads", async () => {
    serve({ historyLoads: false });

    const { result } = await renderHook(useHabitRecords, {
      wrapper: wrapperFor(createQueryClient()),
    });

    await waitFor(() => expect(result.current.records.counts).toEqual(tracker.counts));
    expect(result.current).toMatchObject({
      whole: null,
      fresh: false,
      records: { restPeriods: [] },
    });
  });

  it("shows an unsent tap over both copies, even after a stale answer lands", async () => {
    const client = createQueryClient();

    serve({ historyLoads: true });

    const { result } = await renderHook(
      () => ({ known: useHabitRecords(), check: useCheckHabit() }),
      { wrapper: wrapperFor(client) },
    );

    await waitFor(() => expect(result.current.known.whole).not.toBeNull());
    await act(() => result.current.check({ date: TODAY, habit: "walk", count: -1 }));
    // A refetch that started before the tap answers with the server's copy, which lacks it.
    await act(() => client.setQueryData(["habits", "streaks"], history));
    await act(() => client.setQueriesData({ queryKey: ["habits", "list"] }, tracker));

    await waitFor(() =>
      expect(result.current.known.records.counts[TODAY]).toEqual({ walk: -1, read: 1 }),
    );
    // The caches hold the stale copies: only the read lays the tap back on.
    expect(client.getQueryData(["habits", "list", "tracker", checksSince()])).toEqual(tracker);
  });
});
