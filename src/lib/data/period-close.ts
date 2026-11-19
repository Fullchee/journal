import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import * as z from "zod/mini";

import { CloseDraft, CloseSourcesBody, type CloseKind, type CloseSave } from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";

const closePath = (kind: CloseKind, period: string) =>
  `/api/close/${kind}/${encodeURIComponent(period)}`;

/** The signals summarize every Check-in, so they are never cached, and a refetch never drops a close being typed. */
export const closeQuery = (kind: CloseKind, period: string) =>
  queryOptions({
    queryKey: ["close", kind, period],
    queryFn: ({ signal }) => apiFetch(closePath(kind, period), { signal }, CloseSourcesBody),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });

/** Each press asks the model once; a failure leaves the owner to write by hand. */
export const useCloseDraft = (kind: CloseKind, period: string) =>
  useMutation({
    retry: false,
    mutationFn: () => apiFetch(`${closePath(kind, period)}/draft`, { method: "POST" }, CloseDraft),
  });

const Saved = z.object({ id: z.number(), body: z.string() });

/** Saves the reflection and the Goal moves together; afterwards the period is read again, closed and with its Goals moved. */
export function useSaveClose(kind: CloseKind, period: string) {
  const client = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: (save: CloseSave) =>
      apiFetch(closePath(kind, period), { method: "PUT", body: save }, Saved),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: closeQuery(kind, period).queryKey });
      void client.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}
