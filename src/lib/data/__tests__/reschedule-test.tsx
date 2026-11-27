import type { Habit, HabitRecords } from "@/core";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { CelebrationProvider } from "@/components/celebration";
import { apiFetch } from "@/lib/api/api-fetch";
import { useCheckHabit, useHabitTracker, useReschedule } from "@/lib/data/habits";
import { createQueryClient } from "@/lib/data/query-client";
import { useHabitRecords } from "@/lib/data/streaks";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../../../jest/fixtures";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const ONCE: Habit["target"] = { type: "once", count: 1, days: [] };

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <CelebrationProvider>{children}</CelebrationProvider>
      </QueryClientProvider>
    );
  };

// The owner's API: the Streak history and the Habits; a POST answers with `post()`.
function serveWithStreaks(habits: Habit[], history: HabitRecords, post: () => Promise<undefined>) {
  jest.mocked(apiFetch).mockImplementation((path, init) => {
    if (init.method === "POST") return post();

    return Promise.resolve(path === "/api/streaks" ? history : { habits, counts: {} });
  });
}

describe("useReschedule", () => {
  const portage = habit({ id: "portage", startDate: "2026-11-02", target: ONCE });

  const setup = async () => {
    const wrapper = wrapperFor(createQueryClient());

    const tracker = { habits: [portage], counts: {} };
    // The refetch after the save never lands, so only the cache move can change the date.
    let fetches = 0;
    jest.mocked(apiFetch).mockImplementation((_path, init) => {
      if (init.method === "POST") return Promise.resolve(undefined);

      fetches += 1;

      return fetches === 1 ? Promise.resolve(tracker) : new Promise(jest.fn());
    });

    const hooks = await renderHook(
      () => ({ tracker: useHabitTracker(), reschedule: useReschedule() }),
      { wrapper },
    );

    await waitFor(() => expect(hooks.result.current.tracker.data).toBeDefined());

    return hooks;
  };

  it("posts the Reschedule and moves the One-off's date in the cache", async () => {
    const { result } = await setup();

    await act(() =>
      result.current.reschedule.mutate({
        habit: "portage",
        to: "2026-11-09",
        cause: "avoidance",
        note: "Tired",
      }),
    );

    await waitFor(() =>
      expect(result.current.tracker.data?.habits[0]?.startDate).toBe("2026-11-09"),
    );

    expect(apiFetch).toHaveBeenCalledWith("/api/habits", {
      method: "POST",
      body: {
        type: "reschedule",
        habit: "portage",
        to: "2026-11-09",
        cause: "avoidance",
        note: "Tired",
      },
    });
  });

  it("saves a Reschedule for a Habit the cache doesn't hold, with no Undo toast", async () => {
    jest.mocked(apiFetch).mockResolvedValue(undefined);

    const { result } = await renderHook(() => useReschedule(), {
      wrapper: wrapperFor(createQueryClient()),
    });

    await act(() =>
      result.current.mutate({ habit: "ghost", to: "2026-11-09", cause: "outside", note: "" }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("leaves an empty note out", async () => {
    const { result } = await setup();

    await act(() =>
      result.current.reschedule.mutate({
        habit: "portage",
        to: "2026-11-09",
        cause: "outside",
        note: "",
      }),
    );

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/habits", {
        method: "POST",
        body: { type: "reschedule", habit: "portage", to: "2026-11-09", cause: "outside" },
      }),
    );
  });

  it("leaves the cached Streaks alone and still refetches them", async () => {
    const wrapper = wrapperFor(createQueryClient());
    const restPeriods = [{ start: "2026-11-01", end: "2026-11-03" }];

    serveWithStreaks([portage], { counts: {}, durations: {}, skips: {}, restPeriods }, () =>
      Promise.resolve(undefined),
    );

    const { result } = await renderHook(
      () => ({
        tracker: useHabitTracker(),
        reschedule: useReschedule(),
        restPeriods: useHabitRecords().records.restPeriods,
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.restPeriods).toEqual(restPeriods));
    await waitFor(() => expect(result.current.tracker.data).toBeDefined());
    jest.mocked(apiFetch).mockClear();

    await act(() =>
      result.current.reschedule.mutate({
        habit: "portage",
        to: "2026-11-09",
        cause: "outside",
        note: "",
      }),
    );

    await waitFor(() => expect(result.current.reschedule.isSuccess).toBe(true));
    expect(result.current.restPeriods).toEqual(restPeriods);
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/streaks", expect.anything(), expect.anything()),
    );
  });
});

describe("a queued Habit check", () => {
  it("lays the unsent check over the Habit lists and the Streak history", async () => {
    const client = createQueryClient();
    const wrapper = wrapperFor(client);
    const history: HabitRecords = { counts: {}, durations: {}, skips: {}, restPeriods: [] };

    serveWithStreaks([habit()], history, () => new Promise(jest.fn()));

    const { result } = await renderHook(
      () => ({ tracker: useHabitTracker(), check: useCheckHabit(), records: useHabitRecords() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.tracker.data).toBeDefined());
    await waitFor(() => expect(client.getQueryData(["habits", "streaks"])).toBeDefined());

    await act(() => result.current.check({ date: "2026-11-10", habit: "walk", count: 1 }));

    await waitFor(() =>
      expect(result.current.tracker.data?.counts).toEqual({ "2026-11-10": { walk: 1 } }),
    );
    expect(client.getQueryData(["habits", "streaks"])).toEqual({
      ...history,
      counts: { "2026-11-10": { walk: 1 } },
      skips: { "2026-11-10": {} },
    });
  });
});
