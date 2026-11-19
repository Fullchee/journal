import { QueryClient, type Mutation } from "@tanstack/react-query";

import { NetworkError, SignedOutError, isRetryable } from "@/lib/api/errors";
import { registerCheckInCaptures } from "@/lib/data/check-ins";
import { registerConnectionCaptures } from "@/lib/data/connections";
import { registerHabitCaptures } from "@/lib/data/habits";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Longer than any offline spell; the persisted cache is dropped after this. */
export const CACHE_MAX_AGE_MS = 30 * DAY_MS;

const QUERY_RETRIES = 3;
const SERVER_ERROR_RETRIES = 5;
const MAX_RETRY_DELAY_MS = 30_000;

/**
 * A capture survives anything but a 4xx: offline and signed-out spells wait, a failing server gets a few more tries.
 */
export function shouldRetryCapture(failureCount: number, error: Error) {
  return (
    error instanceof NetworkError ||
    error instanceof SignedOutError ||
    (isRetryable(error) && failureCount < SERVER_ERROR_RETRIES)
  );
}

const backoff = (attempt: number) => Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);

export function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // Show the cached data first, offline or not; refetch when the network allows.
        networkMode: "offlineFirst",
        // Kept in memory as long as it's persisted; a finite 30 days overflows setTimeout and collects at once.
        gcTime: Infinity,
        retry: (failureCount, error) => isRetryable(error) && failureCount < QUERY_RETRIES,
      },
      // A failed capture stays until the owner retries or dismisses it; the default 5 minutes would drop it unseen.
      mutations: { retry: shouldRetryCapture, retryDelay: backoff, gcTime: Infinity },
    },
  });

  // Registered on the client, not in hooks, so a capture restored after a restart still knows how to replay.
  registerCheckInCaptures(client);
  registerHabitCaptures(client);
  registerConnectionCaptures(client);

  return client;
}

/**
 * A capture that was mid-retry when the app closed is pending but not paused, so resumePausedMutations alone would skip it.
 */
export const isUnsent = (mutation: Mutation) => mutation.state.status === "pending";

export async function resumeQueuedMutations(client: QueryClient) {
  const unsent = client
    .getMutationCache()
    .getAll()
    .filter((mutation) => isUnsent(mutation));

  await Promise.allSettled(unsent.map((mutation) => mutation.continue()));
}

/** Settings' "Reload data": refetch everything, keeping unsent captures (they live in the mutation cache). */
export const reloadData = (client: QueryClient) => client.resetQueries();
