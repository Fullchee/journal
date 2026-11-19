import type { DehydratedState } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import * as z from "zod/mini";

/** AsyncStorage's shape, which both cacheStorage twins have. */
export interface CacheStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

const QUERIES_KEY = "journal.queries";
const MUTATIONS_KEY = "journal.mutations";

/** Persisting on every cache change would write the whole cache many times a second. */
export const WRITE_DELAY_MS = 500;

type DehydratedQuery = DehydratedState["queries"][number];

export type DehydratedMutation = DehydratedState["mutations"][number];

// TanStack hydrates from these fields; the rest of each entry is TanStack's own and isn't checked.
const Key = z.array(z.unknown());

const QueryFields = z.looseObject({
  queryKey: Key,
  queryHash: z.string(),
  state: z.looseObject({}),
});

const MutationFields = z.looseObject({ mutationKey: z.optional(Key), state: z.looseObject({}) });

const StoredQueries = z.object({
  version: z.string(),
  savedAt: z.number(),
  queries: z.array(z.custom<DehydratedQuery>((value) => QueryFields.safeParse(value).success)),
});

const StoredMutation = z.custom<DehydratedMutation>(
  (value) => MutationFields.safeParse(value).success,
);

// Checked one by one, so one unreadable capture can't take the owner's other words with it.
const StoredMutations = z.array(z.unknown());

// A capture this app version can't replay shows in "Couldn't save …", like one the server refused, instead of vanishing.
const asFailed = (mutation: DehydratedMutation): DehydratedMutation => ({
  ...mutation,
  state: { ...mutation.state, status: "error", isPaused: false },
});

async function read<S extends z.ZodMiniType>(
  storage: CacheStorage,
  key: string,
  schema: S,
): Promise<z.infer<S> | null> {
  try {
    const text = await storage.getItem(key);

    return text === null ? null : schema.parse(JSON.parse(text));
  } catch {
    // A cache that can't load is dropped and refetched, never a crash.
    return null;
  }
}

/** An app update, over the air too, can change what the API returns, so each one starts from a fresh cache. */
export const cacheVersion = (appVersion: string | undefined, updateId: string | null) =>
  `${appVersion ?? "dev"}+${updateId ?? "embedded"}`;

/**
 * Queries and unsent captures are stored apart: an app update or a stale cache drops the queries
 * but never the captures, which hold the owner's words.
 */
export function createCachePersister(
  storage: CacheStorage,
  {
    version,
    maxAgeMs,
    isRestorable,
  }: { version: string; maxAgeMs: number; isRestorable: (mutation: DehydratedMutation) => boolean },
): Persister {
  // Written only after persistClient replaces it, so the empty client never reaches storage.
  let latest: PersistedClient = {
    timestamp: 0,
    buster: "",
    clientState: { queries: [], mutations: [] },
  };

  let timer: ReturnType<typeof setTimeout> | null = null;

  async function write() {
    timer = null;
    const { queries, mutations } = latest.clientState;
    const stored: z.input<typeof StoredQueries> = { version, savedAt: Date.now(), queries };

    try {
      await Promise.all([
        storage.setItem(QUERIES_KEY, JSON.stringify(stored)),
        storage.setItem(MUTATIONS_KEY, JSON.stringify(mutations)),
      ]);
    } catch {
      // A failed write keeps the last save; the next cache change writes again.
    }
  }

  return {
    persistClient: (client) => {
      latest = client;
      timer ??= setTimeout(() => void write(), WRITE_DELAY_MS);
    },
    restoreClient: async () => {
      const [stored, mutations] = await Promise.all([
        read(storage, QUERIES_KEY, StoredQueries),
        read(storage, MUTATIONS_KEY, StoredMutations),
      ]);

      const usable = stored?.version === version && Date.now() - stored.savedAt < maxAgeMs;

      return {
        buster: "",
        timestamp: Date.now(),
        clientState: {
          // A query's data matches the app version that stored it, which `usable` checks.
          queries: usable ? stored.queries : [],
          mutations: (mutations ?? []).flatMap((stored) => {
            const mutation = StoredMutation.safeParse(stored);

            if (!mutation.success) return [];

            return [isRestorable(mutation.data) ? mutation.data : asFailed(mutation.data)];
          }),
        },
      };
    },
    // TanStack calls this when a restore fails; the captures stay for the next start.
    removeClient: () => storage.removeItem(QUERIES_KEY),
  };
}
