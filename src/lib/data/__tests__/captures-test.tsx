import {
  QueryClientProvider,
  dehydrate,
  hydrate,
  onlineManager,
  type DehydratedState,
  type QueryClient,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { clockLabel, torontoTime, type CheckIn, type ConnectionsBody } from "@/core";
import type { ReactNode } from "react";
import * as z from "zod/mini";

import { CelebrationProvider } from "@/components/celebration";
import { ApiError, NetworkError } from "@/lib/api/errors";
import {
  dismissCapture,
  retryCapture,
  unsentVariables,
  useFailedCaptures,
  type CaptureKind,
} from "@/lib/data/captures";
import {
  checkInsQuery,
  useCreateCheckIn,
  useUpdateCheckIn,
  type CheckInsBody,
  type NewCheckIn,
} from "@/lib/data/check-ins";
import { connectionsQuery, useLogInteraction } from "@/lib/data/connections";
import { shouldPersistMutation } from "@/lib/data/data-provider";
import { useCheckHabit, useTodayHabits } from "@/lib/data/habits";
import { createQueryClient, isUnsent, resumeQueuedMutations } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn } from "../../../../jest/fixtures";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

jest.mock("expo-crypto", () => {
  let next = 0;

  return { randomUUID: () => `uuid-${++next}` };
});

// A stand-in for journal's API: it records each write and answers like the real endpoints.
function fakeServer() {
  let checkIns: CheckIn[] = [];
  let nextId = 100;
  const failures: Error[] = [];

  // Other writes answer 204, which apiFetch returns as undefined.
  const { writes } = fakeApi({
    "/api/check-ins": () => ({ checkIns }),
    "POST /api/check-ins": ({ body }) => {
      const failure = failures.shift();

      if (failure !== undefined) throw failure;

      // SAFETY: create() POSTs a NewCheckIn to /api/check-ins.
      const { score, note } = body as NewCheckIn;
      const row = checkIn({ id: nextId++, checkedInAt: server.now, score, note });

      checkIns = [row, ...checkIns];

      return row;
    },
    "PATCH /api/check-ins": ({ body }) => {
      const failure = failures.shift();

      if (failure !== undefined) throw failure;

      // SAFETY: once a Check-in is saved, update() and a late create() PATCH it by id with CheckIn fields.
      const { id, ...patch } = body as Partial<CheckIn> & { id: number };
      checkIns = checkIns.map((row) => (row.id === id ? { ...row, ...patch } : row));

      return checkIns.find((row) => row.id === id);
    },
    "/api/habits": () => ({ habits: [], counts: {} }),
    "/api/connections": () => ({ connections: [{ id: 3, name: "Sam", lastContactedOn: null }] }),
  });

  const server = {
    writes,
    now: new Date().toISOString(),
    failNext: (error: Error) => {
      failures.push(error);
    },
  };

  return server;
}

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <CelebrationProvider>{children}</CelebrationProvider>
      </QueryClientProvider>
    );
  };

const clients: QueryClient[] = [];

function testClient() {
  const client = createQueryClient();
  // Retries wait no time, and no garbage-collection timer outlives a test.
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    mutations: { ...client.getDefaultOptions().mutations, retryDelay: 0, gcTime: Infinity },
  });
  client.mount();
  clients.push(client);

  return client;
}

const checkInsOf = (client: QueryClient) =>
  client.getQueryData<CheckInsBody>(checkInsQuery.queryKey)?.checkIns ?? [];

beforeEach(() => {
  onlineManager.setOnline(true);
});

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.unmount();
    client.clear();
  }
});

describe("queued Check-ins", () => {
  it("shows a Check-in at once while offline and saves it, with its clientId, once online", async () => {
    const client = testClient();
    const server = fakeServer();
    await client.query(checkInsQuery);
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useCreateCheckIn(), { wrapper: wrapperFor(client) });

    let clientId = "";
    await act(() => {
      clientId = result.current(6, server.now);
    });

    await waitFor(() => expect(checkInsOf(client)[0]).toMatchObject({ clientId, score: 6 }));
    expect(server.writes).toEqual([]);

    await act(() => onlineManager.setOnline(true));

    await waitFor(() =>
      expect(server.writes).toMatchObject([
        {
          path: "/api/check-ins",
          method: "POST",
          body: { clientId, score: 6, checkedInAt: server.now },
        },
      ]),
    );
    await waitFor(() => expect(checkInsOf(client)[0]).toMatchObject({ id: 100, clientId }));
  });

  it("sends details for a queued Check-in to the id it was saved under", async () => {
    const client = testClient();
    const server = fakeServer();
    await client.query(checkInsQuery);
    onlineManager.setOnline(false);

    const { result } = await renderHook(
      () => ({ create: useCreateCheckIn(), update: useUpdateCheckIn() }),
      {
        wrapper: wrapperFor(client),
      },
    );

    await act(() => {
      const clientId = result.current.create(4, server.now);
      result.current.update(clientId, { place: "Home" });
    });

    await waitFor(() => expect(checkInsOf(client)[0]).toMatchObject({ score: 4, place: "Home" }));
    await act(() => onlineManager.setOnline(true));

    await waitFor(() => expect(server.writes).toHaveLength(2));
    expect(server.writes[1]).toMatchObject({ method: "PATCH", body: { id: 100, place: "Home" } });
  });

  it("saves a Check-in set to yesterday with yesterday's time, offline too", async () => {
    const client = testClient();
    const server = fakeServer();
    await client.query(checkInsQuery);
    onlineManager.setOnline(false);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const checkedInAt = yesterday.toISOString();
    const { result } = await renderHook(() => useCreateCheckIn(), { wrapper: wrapperFor(client) });

    await act(() => {
      result.current(5, checkedInAt);
    });

    await waitFor(() => expect(checkInsOf(client)[0]).toMatchObject({ score: 5, checkedInAt }));
    await act(() => onlineManager.setOnline(true));

    await waitFor(() => expect(server.writes).toHaveLength(2));
    expect(server.writes[0]).toMatchObject({ method: "POST", body: { score: 5, checkedInAt } });
    expect(server.writes[1]).toMatchObject({ method: "PATCH", body: { id: 100, checkedInAt } });
  });

  it("puts back the time of a Check-in replayed long after it was made", async () => {
    const client = testClient();
    const server = fakeServer();
    server.now = "2026-11-07T12:00:00.000Z";
    const checkedInAt = "2026-11-07T09:00:00.000Z";

    await client
      .getMutationCache()
      .build(client, { mutationKey: ["check-ins", "create"] })
      .execute({
        clientId: "late",
        score: 5,
        note: "",
        checkedInAt,
      });

    expect(server.writes[1]).toMatchObject({ method: "PATCH", body: { id: 100, checkedInAt } });
  });

  it("retries a network error and keeps the capture", async () => {
    const client = testClient();
    const server = fakeServer();
    server.failNext(new NetworkError(null));
    const { result } = await renderHook(() => useCreateCheckIn(), { wrapper: wrapperFor(client) });

    await act(() => {
      result.current(7, server.now);
    });

    await waitFor(() => expect(server.writes).toHaveLength(2));
    expect(client.getMutationCache().getAll()[0]?.state.status).toBe("success");
  });

  it("drops a capture the server refuses, rolls it back and says what wasn't saved", async () => {
    const client = testClient();
    const server = fakeServer();
    await client.query(checkInsQuery);
    server.failNext(new ApiError(400, { error: "invalid check-in" }));

    const { result } = await renderHook(
      () => ({ create: useCreateCheckIn(), failed: useFailedCaptures() }),
      {
        wrapper: wrapperFor(client),
      },
    );

    await act(() => {
      result.current.create(3, server.now);
    });

    const time = clockLabel(torontoTime(server.now));

    await waitFor(() =>
      expect(result.current.failed).toEqual([
        expect.objectContaining({ message: `Couldn't save the ${time} Rain Check-in` }),
      ]),
    );
    expect(server.writes).toHaveLength(1);
    await waitFor(() => expect(checkInsOf(client)).toEqual([]));
  });
});

it("names a refused Check-in change by its values, each Part by name", async () => {
  const client = testClient();
  const server = fakeServer();
  await client.query(checkInsQuery);
  server.failNext(new ApiError(400, { error: "invalid details" }));

  const { result } = await renderHook(
    () => ({ update: useUpdateCheckIn(), failed: useFailedCaptures() }),
    {
      wrapper: wrapperFor(client),
    },
  );

  await act(() => {
    result.current.update(5, {
      inControl: "Self",
      parts: [{ id: 2, name: "Doer" }],
      note: "",
      tense: null,
      low: 2,
    });
  });

  await waitFor(() =>
    expect(result.current.failed).toEqual([
      expect.objectContaining({ message: "Couldn't save Check-in details: 2, Self, Doer" }),
    ]),
  );
});

it("names a refused change's Part in control by its name", async () => {
  const client = testClient();
  const server = fakeServer();
  await client.query(checkInsQuery);
  server.failNext(new ApiError(400, { error: "invalid details" }));

  const { result } = await renderHook(
    () => ({ update: useUpdateCheckIn(), failed: useFailedCaptures() }),
    {
      wrapper: wrapperFor(client),
    },
  );

  await act(() => {
    result.current.update(5, { inControl: { id: 1, name: "Worry wolf" } });
  });

  await waitFor(() =>
    expect(result.current.failed).toEqual([
      expect.objectContaining({ message: "Couldn't save Check-in details: Worry wolf" }),
    ]),
  );
});

// A Check-in the server refused, shown as failed.
async function refusedCheckIn() {
  const client = testClient();
  const server = fakeServer();
  await client.query(checkInsQuery);
  server.failNext(new ApiError(400, { error: "invalid check-in" }));

  const { result } = await renderHook(
    () => ({ create: useCreateCheckIn(), failed: useFailedCaptures() }),
    { wrapper: wrapperFor(client) },
  );

  await act(() => {
    result.current.create(3, server.now);
  });
  await waitFor(() => expect(result.current.failed).toHaveLength(1));

  return { client, server, result };
}

describe("a failed capture", () => {
  it("saves on Retry and leaves the list", async () => {
    const { client, server, result } = await refusedCheckIn();
    const [failed] = result.current.failed;

    await act(() => retryCapture(client, failed?.id ?? 0));

    await waitFor(() => expect(result.current.failed).toEqual([]));
    expect(server.writes).toHaveLength(2);
    await waitFor(() =>
      expect(checkInsOf(client)).toEqual([expect.objectContaining({ score: 3 })]),
    );
  });

  it("shows again when Retry fails too", async () => {
    const { client, server, result } = await refusedCheckIn();
    const [failed] = result.current.failed;
    server.failNext(new ApiError(400, { error: "invalid check-in" }));

    await act(() => retryCapture(client, failed?.id ?? 0));

    await waitFor(() => expect(server.writes).toHaveLength(2));
    await waitFor(() => expect(result.current.failed).toHaveLength(1));
  });

  it("goes for good on Dismiss", async () => {
    const { client, server, result } = await refusedCheckIn();
    const [failed] = result.current.failed;

    await act(() => dismissCapture(client, failed?.id ?? 0));

    await waitFor(() => expect(result.current.failed).toEqual([]));
    expect(client.getMutationCache().getAll()).toEqual([]);
    expect(server.writes).toHaveLength(1);
  });

  it("ignores Retry and Dismiss for one already gone", async () => {
    const { client, result } = await refusedCheckIn();

    await act(() => {
      retryCapture(client, -1);

      dismissCapture(client, -1);
    });

    expect(result.current.failed).toHaveLength(1);
  });

  it("is stored, so it still shows after a restart", async () => {
    const { client } = await refusedCheckIn();

    const stored = JSON.stringify(
      dehydrate(client, { shouldDehydrateMutation: shouldPersistMutation }),
    );

    client.unmount();
    client.clear();

    const restarted = testClient();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- the persister stores this as JSON, so the test reads it back the same way
    const saved: DehydratedState = JSON.parse(stored);
    hydrate(restarted, saved);

    const { result } = await renderHook(() => useFailedCaptures(), {
      wrapper: wrapperFor(restarted),
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.message).toMatch(/Rain Check-in$/);
  });

  it("names a refused position as a location", async () => {
    const client = testClient();
    const server = fakeServer();
    await client.query(checkInsQuery);
    server.failNext(new ApiError(400, { error: "position is not from this Check-in's time" }));

    const { result } = await renderHook(
      () => ({ update: useUpdateCheckIn(), failed: useFailedCaptures() }),
      { wrapper: wrapperFor(client) },
    );

    await act(() => {
      result.current.update(5, { latitude: 43.65, longitude: -79.38, fixedAt: server.now });
    });

    await waitFor(() =>
      expect(result.current.failed).toEqual([
        expect.objectContaining({ message: "Couldn't save Check-in details: location" }),
      ]),
    );
  });
});

describe("unsentVariables", () => {
  it("returns only queued variables that match the kind's schema", () => {
    const client = testClient();
    const Count = z.object({ count: z.number() });
    const counts: CaptureKind<z.infer<typeof Count>> = { key: ["counts"], variables: Count };

    // What an older app version might have stored under the same key.
    interface StoredCount {
      count: number | string;
    }

    const queued = (variables: StoredCount) => ({
      mutationKey: counts.key,
      state: {
        context: undefined,
        data: undefined,
        error: null,
        failureCount: 0,
        failureReason: null,
        isPaused: true,
        status: "pending" as const,
        variables,
        submittedAt: 0,
      },
    });

    hydrate(client, { queries: [], mutations: [queued({ count: 1 }), queued({ count: "two" })] });

    expect(unsentVariables(client, counts)).toEqual([{ count: 1 }]);
  });
});

describe("Captures an app update can't replay", () => {
  it("say what wasn't saved", async () => {
    const client = testClient();

    const failed: DehydratedState = {
      queries: [],
      mutations: [
        {
          mutationKey: ["check-ins", "retired"],
          scope: { id: "capture" },
          state: {
            context: undefined,
            data: undefined,
            error: null,
            failureCount: 0,
            failureReason: null,
            isPaused: false,
            status: "error",
            variables: { score: 3 },
            submittedAt: 0,
          },
        },
      ],
    };

    hydrate(client, failed);

    const { result } = await renderHook(() => useFailedCaptures(), { wrapper: wrapperFor(client) });

    expect(result.current).toEqual([
      expect.objectContaining({ message: "Couldn't save a change" }),
    ]);
  });
});

describe("Habit checks and reach-outs", () => {
  it("show at once while offline and replay when online", async () => {
    const client = testClient();
    const server = fakeServer();
    await client.query(connectionsQuery);

    const { result } = await renderHook(
      () => ({ habits: useTodayHabits(), check: useCheckHabit(), reached: useLogInteraction() }),
      { wrapper: wrapperFor(client) },
    );

    await waitFor(() => expect(result.current.habits.data).toBeDefined());
    onlineManager.setOnline(false);

    await act(() => {
      result.current.check({ date: "2026-11-07", habit: "walk", count: 1 });
      result.current.reached([3], {
        kind: "message",
        note: "talked about her move",
        minutes: null,
      });
    });

    await waitFor(() => {
      const people = client.getQueryData<ConnectionsBody>(connectionsQuery.queryKey);
      expect(result.current.habits.data?.counts).toEqual({ "2026-11-07": { walk: 1 } });
      expect(people?.connections[0]?.lastContactedOn).toEqual(expect.any(String));
    });

    await act(() => onlineManager.setOnline(true));

    const reachedOut: unknown = expect.objectContaining({
      connectionIds: [3],
      kind: "message",
      note: "talked about her move",
    });

    await waitFor(() =>
      expect(server.writes).toEqual([
        {
          path: "/api/habits",
          method: "POST",
          body: { type: "check", date: "2026-11-07", habit: "walk", on: true, count: 1 },
        },
        {
          path: "/api/interactions",
          method: "POST",
          body: reachedOut,
        },
      ]),
    );
  });
});

describe("Skips", () => {
  it("queue offline with their cause, show the cause at once, and a clear drops it", async () => {
    const client = testClient();
    const server = fakeServer();

    const { result } = await renderHook(
      () => ({ habits: useTodayHabits(), check: useCheckHabit() }),
      {
        wrapper: wrapperFor(client),
      },
    );

    await waitFor(() => expect(result.current.habits.data).toBeDefined());
    onlineManager.setOnline(false);

    await act(() => {
      result.current.check({ date: "2026-11-07", habit: "walk", count: -1 });
      result.current.check({
        date: "2026-11-07",
        habit: "walk",
        count: -1,
        cause: "avoidance",
        note: "tired",
      });
    });

    await waitFor(() =>
      expect(result.current.habits.data?.skips).toEqual({
        "2026-11-07": { walk: { cause: "avoidance", note: "tired" } },
      }),
    );

    await act(() => result.current.check({ date: "2026-11-07", habit: "walk", count: 0 }));
    await waitFor(() => expect(result.current.habits.data?.skips).toEqual({ "2026-11-07": {} }));

    await act(() => onlineManager.setOnline(true));

    await waitFor(() =>
      expect(server.writes.map((write) => write.body)).toEqual([
        { type: "check", date: "2026-11-07", habit: "walk", on: true, count: -1 },
        {
          type: "check",
          date: "2026-11-07",
          habit: "walk",
          on: true,
          count: -1,
          cause: "avoidance",
          note: "tired",
        },
        { type: "check", date: "2026-11-07", habit: "walk", on: false, count: 1 },
      ]),
    );
  });
});

describe("after a restart", () => {
  it("replays one unsent capture of each type, in order", async () => {
    const client = testClient();
    const server = fakeServer();
    await client.query(checkInsQuery);
    onlineManager.setOnline(false);

    const { result } = await renderHook(
      () => ({
        create: useCreateCheckIn(),
        update: useUpdateCheckIn(),
        check: useCheckHabit(),
        reached: useLogInteraction(),
      }),
      { wrapper: wrapperFor(client) },
    );

    await act(() => {
      const clientId = result.current.create(6, server.now);
      result.current.update(clientId, { doing: "Reading" });
      result.current.check({ date: "2026-11-07", habit: "walk", count: 0 });
      result.current.reached([3], { kind: "call", note: "", minutes: null });
    });
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(4));

    // What the persister stores, sent through JSON like the real storage.
    const stored = JSON.stringify(dehydrate(client, { shouldDehydrateMutation: isUnsent }));
    client.unmount();
    client.clear();

    onlineManager.setOnline(true);
    const restarted = testClient();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- the persister stores this as JSON, so the test reads it back the same way
    const saved: DehydratedState = JSON.parse(stored);
    hydrate(restarted, saved);
    await resumeQueuedMutations(restarted);

    await waitFor(() => expect(server.writes).toHaveLength(4));
    expect(server.writes.map(({ path, method }) => `${method} ${path}`)).toEqual([
      "POST /api/check-ins",
      "PATCH /api/check-ins",
      "POST /api/habits",
      "POST /api/interactions",
    ]);
    expect(server.writes[1]?.body).toEqual({ id: 100, doing: "Reading" });
    expect(server.writes[2]?.body).toMatchObject({ on: false });
  });
});
