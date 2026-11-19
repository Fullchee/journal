import {
  useMutationState,
  type Mutation,
  type MutationKey,
  type QueryClient,
} from "@tanstack/react-query";
import type * as z from "zod/mini";

import type { DehydratedMutation } from "@/lib/data/cache-persister";

/** Every queued capture shares one scope, so replays run one at a time in the order they were made. */
export const CAPTURE_SCOPE = { id: "capture" };

/** One kind of capture: its mutation key and the shape of its variables, which outlive app updates. */
export interface CaptureKind<T> {
  key: MutationKey;
  variables: z.ZodMiniType<T>;
}

interface Registered {
  variables: z.ZodMiniType;
  /** What a capture shows in "Couldn't save …" when the server refuses it; undefined when its variables don't match. */
  describe: (mutation: Mutation) => string | undefined;
}

const kinds = new Map<string, Registered>();

const kindOf = (key: MutationKey | undefined) => (key ?? []).join("/");

/** Registers a kind of capture, so a stored one can be restored and a refused one named. */
export function describeCaptures<T>(
  { key, variables }: CaptureKind<T>,
  describe: (variables: T) => string,
) {
  kinds.set(kindOf(key), {
    variables,
    describe: (mutation) => {
      const parsed = variables.safeParse(mutation.state.variables);

      return parsed.success ? describe(parsed.data) : undefined;
    },
  });
}

/** A stored capture resumes only if this app version still knows its kind and the shape of its variables. */
export const isRestorableCapture = ({ mutationKey, state }: DehydratedMutation) =>
  kinds.get(kindOf(mutationKey))?.variables.safeParse(state.variables).success === true;

const isQueued = (mutation: Mutation, key: MutationKey) =>
  kindOf(mutation.options.mutationKey) === kindOf(key) && mutation.state.status === "pending";

/**
 * The variables of captures of one kind not yet saved, oldest first; queries lay them over fetched data.
 * `settled` leaves out a capture whose callbacks are running, before TanStack marks it done.
 */
export const unsentVariables = <T>(
  client: QueryClient,
  { key, variables }: CaptureKind<T>,
  settled?: T,
): T[] =>
  client
    .getMutationCache()
    .getAll()
    .flatMap((mutation) => {
      if (!isQueued(mutation, key) || mutation.state.variables === settled) return [];
      const parsed = variables.safeParse(mutation.state.variables);

      return parsed.success ? [parsed.data] : [];
    });

export interface FailedCapture {
  id: number;
  message: string;
}

/**
 * A capture the server refused, or that failed past its retries. By scope, not kind,
 * so a stored capture of a kind this app version dropped still counts.
 */
export const isFailedCapture = (mutation: Mutation) =>
  mutation.state.status === "error" && mutation.options.scope?.id === CAPTURE_SCOPE.id;

/** Failed captures; a screen shows each as "Couldn't save …" until it is retried or dismissed. */
export function useFailedCaptures(): FailedCapture[] {
  return useMutationState({
    filters: { predicate: isFailedCapture },
    select: (mutation) => ({
      id: mutation.mutationId,
      message: `Couldn't save ${kinds.get(kindOf(mutation.options.mutationKey))?.describe(mutation) ?? "a change"}`,
    }),
  });
}

const failedCapture = (client: QueryClient, id: number) =>
  client
    .getMutationCache()
    .getAll()
    .find((mutation) => mutation.mutationId === id && isFailedCapture(mutation));

/** Sends a failed capture again; if it fails again, it shows as failed once more. */
export function retryCapture(client: QueryClient, id: number) {
  const mutation = failedCapture(client, id);

  // A retry that fails again is back in the list, so its rejection needs nothing more.
  void mutation?.execute(mutation.state.variables).catch(() => null);
}

/** Drops a failed capture for good. */
export function dismissCapture(client: QueryClient, id: number) {
  const mutation = failedCapture(client, id);

  if (mutation) client.getMutationCache().remove(mutation);
}
