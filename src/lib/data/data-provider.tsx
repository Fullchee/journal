import { onlineManager, type Mutation, type Query } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { AuthProvider } from "@/lib/auth/auth-provider";
import { cacheStorage } from "@/lib/data/cache-storage";
import { cacheVersion, createCachePersister } from "@/lib/data/cache-persister";
import { isFailedCapture, isRestorableCapture } from "@/lib/data/captures";
import { watchConnectivity } from "@/lib/data/connectivity";
import {
  CACHE_MAX_AGE_MS,
  createQueryClient,
  isUnsent,
  resumeQueuedMutations,
} from "@/lib/data/query-client";

const persister = createCachePersister(cacheStorage, {
  version: cacheVersion(Constants.expoConfig?.version, Updates.updateId),
  maxAgeMs: CACHE_MAX_AGE_MS,
  isRestorable: isRestorableCapture,
});

/** Only queries a screen opts into are stored, so the cache stays small. */
export const shouldPersistQuery = (query: Query) =>
  query.state.status === "success" && query.meta?.["persist"] === true;

/** A failed capture is kept too, so it still shows after a restart until retried or dismissed. */
export const shouldPersistMutation = (mutation: Mutation) =>
  isUnsent(mutation) || isFailedCapture(mutation);

/** Also restores and saves the cache when a notification button runs with the app closed. */
export const persistOptions = {
  persister,
  maxAge: CACHE_MAX_AGE_MS,
  dehydrateOptions: {
    shouldDehydrateQuery: shouldPersistQuery,
    shouldDehydrateMutation: shouldPersistMutation,
  },
};

/**
 * Wrap the root layout in this: it gives every screen the query client, the persisted cache, the capture queue and auth.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);

  useEffect(watchConnectivity, []);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={persistOptions}
      onSuccess={() => resumeQueuedMutations(client)}
    >
      <AuthProvider>{children}</AuthProvider>
    </PersistQueryClientProvider>
  );
}

/**
 * Online-only forms (Habit, Goal and Connection edits, notes, the log box) show disabled while this is false.
 */
export const useIsOnline = () =>
  useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () => onlineManager.isOnline());
