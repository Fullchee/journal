import type { PersistedClient } from "@tanstack/react-query-persist-client";

import {
  cacheVersion,
  createCachePersister,
  type CacheStorage,
  type DehydratedMutation,
} from "@/lib/data/cache-persister";

const DAY_MS = 24 * 60 * 60 * 1000;

// Mutation "m" stands for a capture kind this app version still knows.
const OPTIONS = {
  version: "1.0.0",
  maxAgeMs: DAY_MS,
  isRestorable: ({ mutationKey }: DehydratedMutation) => mutationKey?.[0] === "m",
};

function memoryStorage(): CacheStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();

  return {
    items,
    getItem: (key) => Promise.resolve(items.get(key) ?? null),
    setItem: (key, value) => {
      items.set(key, value);

      return Promise.resolve();
    },
    removeItem: (key) => {
      items.delete(key);

      return Promise.resolve();
    },
  };
}

// The shape TanStack hands a persister; only the lengths matter here.
const persisted = (queries: number, mutations: number): PersistedClient => ({
  buster: "",
  timestamp: Date.now(),
  clientState: {
    queries: Array.from({ length: queries }, (_, i) => ({
      queryKey: ["q", i],
      queryHash: `q${i}`,
      dehydratedAt: 0,
      state: {
        data: i,
        dataUpdateCount: 1,
        dataUpdatedAt: 0,
        error: null,
        errorUpdateCount: 0,
        errorUpdatedAt: 0,
        fetchFailureCount: 0,
        fetchFailureReason: null,
        fetchMeta: null,
        isInvalidated: false,
        status: "success",
        fetchStatus: "idle",
      },
    })),
    mutations: Array.from({ length: mutations }, (_, i) => ({
      mutationKey: ["m", i],
      state: {
        context: undefined,
        data: undefined,
        error: null,
        failureCount: 0,
        failureReason: null,
        isPaused: true,
        status: "pending",
        variables: i,
        submittedAt: 0,
      },
    })),
  },
});

async function saved(storage: CacheStorage, client: PersistedClient) {
  jest.useFakeTimers();
  await createCachePersister(storage, OPTIONS).persistClient(client);
  await jest.runAllTimersAsync();
  jest.useRealTimers();
}

const restore = (storage: CacheStorage, version = "1.0.0") =>
  createCachePersister(storage, { ...OPTIONS, version }).restoreClient();

describe("createCachePersister", () => {
  it("restores queries and unsent captures", async () => {
    const storage = memoryStorage();
    await saved(storage, persisted(2, 1));

    const restored = await restore(storage);

    expect(restored?.clientState.queries).toHaveLength(2);
    expect(restored?.clientState.mutations).toHaveLength(1);
  });

  it("drops queries after an app update but keeps the captures", async () => {
    const storage = memoryStorage();
    await saved(storage, persisted(2, 1));

    const restored = await restore(storage, "1.1.0");

    expect(restored?.clientState.queries).toEqual([]);
    expect(restored?.clientState.mutations).toHaveLength(1);
  });

  it("drops queries older than maxAge but keeps the captures", async () => {
    const storage = memoryStorage();
    await saved(storage, persisted(2, 1));
    const twoDaysLater = Date.now() + 2 * DAY_MS;
    const now = jest.spyOn(Date, "now").mockReturnValue(twoDaysLater);

    const restored = await restore(storage);
    now.mockRestore();

    expect(restored?.clientState.queries).toEqual([]);
    expect(restored?.clientState.mutations).toHaveLength(1);
  });

  it("starts empty when the stored cache is unreadable", async () => {
    const storage = memoryStorage();
    storage.items.set("journal.queries", "{not json");
    storage.items.set("journal.mutations", "{not json");

    const restored = await restore(storage);

    expect(restored?.clientState).toEqual({ queries: [], mutations: [] });
  });

  it("restores a capture this app version can't replay as failed, so it still shows", async () => {
    const storage = memoryStorage();
    const client = persisted(0, 2);
    client.clientState.mutations[1]!.mutationKey = ["gone"];
    await saved(storage, client);

    const restored = await restore(storage);

    expect(
      restored?.clientState.mutations.map(({ mutationKey, state }) => [mutationKey, state.status]),
    ).toEqual([
      [["m", 0], "pending"],
      [["gone"], "error"],
    ]);
  });

  it("drops stored entries with the wrong shape and keeps the rest", async () => {
    const storage = memoryStorage();
    const [capture] = persisted(0, 1).clientState.mutations;
    storage.items.set(
      "journal.queries",
      JSON.stringify({ version: "1.0.0", savedAt: Date.now(), queries: [{}] }),
    );
    storage.items.set("journal.mutations", JSON.stringify([capture, { mutationKey: "m" }, 7]));

    const restored = await restore(storage);

    expect(restored?.clientState.queries).toEqual([]);
    expect(restored?.clientState.mutations).toHaveLength(1);
  });

  it("removes only the queries when TanStack discards a cache", async () => {
    const storage = memoryStorage();
    await saved(storage, persisted(1, 1));

    await createCachePersister(storage, OPTIONS).removeClient();

    expect(storage.items.keys().toArray()).toEqual(["journal.mutations"]);
  });

  it("writes once for a burst of changes", async () => {
    const storage = memoryStorage();
    const writes = jest.spyOn(storage, "setItem");
    jest.useFakeTimers();
    const persister = createCachePersister(storage, OPTIONS);

    await persister.persistClient(persisted(1, 0));
    await persister.persistClient(persisted(2, 0));
    await jest.runAllTimersAsync();
    jest.useRealTimers();

    expect(writes).toHaveBeenCalledTimes(2);
    const restored = await restore(storage);
    expect(restored?.clientState.queries).toHaveLength(2);
  });
});

describe("cacheVersion", () => {
  it("changes with each over-the-air update, not only the app version", () => {
    expect(cacheVersion("1.0.0", "update-a")).not.toBe(cacheVersion("1.0.0", "update-b"));
  });

  it("names a dev build without an update", () => {
    expect(cacheVersion(undefined, null)).toBe("dev+embedded");
  });
});
