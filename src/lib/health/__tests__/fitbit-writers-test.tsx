import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { apiFetch } from "@/lib/api/api-fetch";
import { STREAKS_KEY } from "@/lib/data/habits";
import { createQueryClient } from "@/lib/data/query-client";
import type { FitbitWriters } from "@/lib/health/fitbit-auto-log";
import { useFitbitWriters } from "@/lib/health/fitbit-writers";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, reply, type Respond } from "../../../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../../../jest/fixtures";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const history = (counts: Record<string, Record<string, number>>) => ({
  counts,
  durations: {},
  skips: {},
  restPeriods: [],
});

const HISTORY = history({ "2026-11-01": { walk: 1 } });

const TRACKER = {
  habits: [habit(), habit({ id: "lift", record: "duration" })],
  counts: { "2026-11-10": { walk: -1 } },
};

function serve({ tracker = reply(TRACKER), streaks = reply(HISTORY) } = {}) {
  return fakeApi({
    "/api/habits": tracker,
    "/api/streaks": streaks,
    "POST /api/habits": () => ({ added: 2 }),
  });
}

// Every value the hook returned, render by render.
const rendered: (FitbitWriters | null)[] = [];

function useRecordedWriters() {
  const writers = useFitbitWriters();

  rendered.push(writers);

  return writers;
}

async function mount(client: QueryClient = createQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  rendered.length = 0;

  return renderHook(useRecordedWriters, { wrapper });
}

const failing = jest.fn<ReturnType<Respond>, Parameters<Respond>>(() => {
  throw new Error("offline");
});

describe("useFitbitWriters", () => {
  it("waits for the Habits and history, then reads their answers and styles and writes checks and minutes", async () => {
    const { writes } = serve();

    const { result } = await mount();

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.counts["2026-11-10"]).toEqual({ walk: -1 }));
    expect(result.current?.counts["2026-11-01"]).toEqual({ walk: 1 });
    expect(result.current?.recordStyles).toEqual({ walk: "check", lift: "duration" });

    await act(() => result.current?.check([{ date: "2026-11-12", habit: "walk", count: 1 }]));
    const entries = [{ date: "2026-11-12", startTime: "07:00", minutes: 30 }];

    expect(await act(() => result.current?.importDurations({ habit: "lift", entries }))).toBe(2);
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes.map(({ body }) => body)).toEqual(
      expect.arrayContaining([
        { type: "check", date: "2026-11-12", habit: "walk", on: true, count: 1 },
        { type: "import-durations", habit: "lift", entries },
      ]),
    );
  });

  it.each([
    ["the Habits", { tracker: failing }],
    ["the history", { streaks: failing }],
  ])("stays null while %s can't load", async (_what, routes) => {
    serve(routes);

    const { result } = await mount();

    await waitFor(() => expect(failing).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(result.current).toBeNull();
  });

  it("waits for a refetch instead of trusting the cached answers", async () => {
    const client = createQueryClient();

    serve();
    const first = await mount(client);

    await waitFor(() => expect(first.result.current).not.toBeNull());
    await first.unmount();

    // Answered Not done on web since the cache was saved.
    serve({ streaks: reply(history({ "2026-11-01": { walk: -1 } })) });
    const { result } = await mount(client);

    await waitFor(() => expect(result.current?.counts["2026-11-01"]).toEqual({ walk: -1 }));
    // No render handed out the cached Done.
    expect(rendered[0]).toBeNull();
    expect(rendered.map((writers) => writers?.counts["2026-11-01"])).not.toContainEqual({
      walk: 1,
    });
  });

  it("hides the writers while the history refetches", async () => {
    const client = createQueryClient();

    serve();
    const { result } = await mount(client);

    await waitFor(() => expect(result.current).not.toBeNull());

    const pending = Promise.withResolvers<typeof HISTORY>();

    jest.mocked(apiFetch).mockImplementationOnce(() => pending.promise);
    await act(() => {
      void client.invalidateQueries({ queryKey: STREAKS_KEY });
    });

    await waitFor(() => expect(result.current).toBeNull());

    await act(async () => {
      pending.resolve(HISTORY);
      await pending.promise;
    });

    await waitFor(() => expect(result.current).not.toBeNull());
  });
});
