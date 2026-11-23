import { QueryClientProvider, dehydrate, type QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PoolPlan, SizedTask } from "@/core";
import type { ReactNode } from "react";

import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError, NetworkError } from "@/lib/api/errors";
import { shouldPersistQuery } from "@/lib/data/data-provider";
import {
  planNextOf,
  planTasksQuery,
  savedPlanOf,
  savedPlanQuery,
  BlocksResult,
  usePlanNext,
  useWriteBlocks,
  type SavedPlan,
} from "@/lib/data/plan";
import { createQueryClient } from "@/lib/data/query-client";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const task = (id: string, content: string): SizedTask => ({
  id,
  content,
  projectId: "p",
  sectionId: null,
  priority: 1,
  dueDate: null,
  minutes: 30,
  source: "todoist",
});

const POOLS: PoolPlan[] = [
  {
    pool: "personal",
    placed: [
      { start: 600, end: 630, block: { tasks: [task("2", "Laundry")], minutes: 30 } },
      {
        start: 420,
        end: 480,
        block: { tasks: [task("1", "Run"), task("3", "Stretch")], minutes: 60 },
      },
    ],
    unplaced: [],
    over: 0,
  },
  { pool: "job", placed: [], unplaced: [], over: 0 },
];

const SAVED: SavedPlan = {
  day: "2026-11-07",
  blocks: [
    { start: 420, end: 480, tasks: ["Run"] },
    { start: 600, end: 630, tasks: ["Laundry"] },
    { start: 700, end: 720, tasks: ["Read"] },
  ],
};

// 09:00 in Toronto on 2026-11-07 (EST, UTC-5).
const NINE_AM = new Date("2026-11-07T14:00:00Z");

describe("savedPlanOf", () => {
  it("keeps every placed block in time order with its task titles", () => {
    expect(savedPlanOf("2026-11-07", POOLS)).toEqual({
      day: "2026-11-07",
      blocks: [
        { start: 420, end: 480, tasks: ["Run", "Stretch"] },
        { start: 600, end: 630, tasks: ["Laundry"] },
      ],
    });
  });
});

describe("planNextOf", () => {
  it("shows the next two blocks that haven't ended", () => {
    expect(planNextOf(SAVED, NINE_AM)).toEqual({ day: null, blocks: SAVED.blocks.slice(1) });
  });

  it("shows nothing without a plan or for a past day", () => {
    expect(planNextOf(undefined, NINE_AM).blocks).toEqual([]);
    expect(planNextOf({ ...SAVED, day: "2026-11-06" }, NINE_AM).blocks).toEqual([]);
  });

  it("names the day of a plan made for tomorrow", () => {
    expect(planNextOf({ ...SAVED, day: "2026-11-08" }, NINE_AM)).toEqual({
      day: "2026-11-08",
      blocks: SAVED.blocks.slice(0, 2),
    });
  });
});

// Only the hook tests make a client.
const clients: QueryClient[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.unmount();
    client.clear();
  }
});

function setup() {
  const client = createQueryClient();
  clients.push(client);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return { client, wrapper };
}

describe("useWriteBlocks", () => {
  afterEach(() => jest.mocked(apiFetch).mockReset());

  it("stores the written plan so Today shows it offline", async () => {
    jest.mocked(apiFetch).mockResolvedValue({ status: "ok", events: 2, tasks: 3 });
    const { client, wrapper } = setup();

    const { result } = await renderHook(
      () => ({ write: useWriteBlocks(), next: usePlanNext(new Date("2026-11-07T11:00:00Z")) }),
      { wrapper },
    );

    await act(() => result.current.write.mutateAsync({ day: "2026-11-07", pools: POOLS }));

    expect(jest.mocked(apiFetch).mock.calls).toMatchObject([
      ["/api/plan/blocks", { method: "POST", body: { day: "2026-11-07" } }, BlocksResult],
    ]);
    await waitFor(() => expect(result.current.next.blocks).toHaveLength(2));
    const persisted = dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery });
    expect(persisted.queries.map((q) => q.queryKey)).toEqual([savedPlanQuery.queryKey]);
  });

  it("returns the calendar failure the server sends with a 502", async () => {
    jest.mocked(apiFetch).mockRejectedValue(new ApiError(502, { status: "unreachable" }));
    const { client, wrapper } = setup();
    const { result } = await renderHook(useWriteBlocks, { wrapper });

    const answer = await act(() => result.current.mutateAsync({ day: "2026-11-07", pools: POOLS }));

    expect(answer).toEqual({ status: "unreachable" });
    expect(client.getQueryData(savedPlanQuery.queryKey)).toBeUndefined();
  });

  it("fails at once when the request never arrives", async () => {
    jest.mocked(apiFetch).mockRejectedValue(new NetworkError(null));
    const { wrapper } = setup();
    const { result } = await renderHook(useWriteBlocks, { wrapper });

    await expect(
      act(() => result.current.mutateAsync({ day: "2026-11-07", pools: POOLS })),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

it("never persists the task list", async () => {
  jest
    .mocked(apiFetch)
    .mockResolvedValue({ zone: null, reminders: "", tasks: [], workPlan: [], proposals: null });
  const { client } = setup();

  await client.query(planTasksQuery("2026-11-07"));

  expect(dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery }).queries).toEqual([]);
});
