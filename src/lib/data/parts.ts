import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod/mini";

import { Part, PartBody, PartsBody, type PartDraft } from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";

const PARTS_KEY = ["parts"];

const SavedPart = z.object({ part: Part });

const partsQuery = queryOptions({
  queryKey: PARTS_KEY,
  queryFn: ({ signal }) => apiFetch("/api/parts", { signal }, PartsBody),
  meta: { persist: true },
});

const partQuery = (id: number) =>
  queryOptions({
    queryKey: ["parts", "detail", id],
    queryFn: ({ signal }) => apiFetch(`/api/parts/${id}`, { signal }, PartBody),
    meta: { persist: true },
  });

export const useParts = () => useQuery(partsQuery);

export const usePart = (id: number) => useQuery(partQuery(id));

/** Online only: the Part form needs the server, and a name already taken answers 409. */
export function useCreatePart() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (draft: PartDraft) => {
      const { part } = await apiFetch("/api/parts", { method: "POST", body: draft }, SavedPart);

      return part;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: PARTS_KEY }),
  });
}

/** Online only. Check-ins show a Part's current name, so they refetch after a rename. */
export function useUpdatePart(id: number) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (change: Partial<PartDraft> & { retired?: boolean }) => {
      const { part } = await apiFetch(
        `/api/parts/${id}`,
        { method: "PATCH", body: change },
        SavedPart,
      );

      return part;
    },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: PARTS_KEY }),
        client.invalidateQueries({ queryKey: ["check-ins"] }),
      ]),
  });
}

/**
 * Online only; the server refuses a Part any Check-in names, which is retired instead. The list drops the Part at
 * once; the refetch after a failure brings it back.
 */
export function useDeletePart(id: number) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch(`/api/parts/${id}`, { method: "DELETE" }),
    onMutate: () => {
      client.setQueryData(
        partsQuery.queryKey,
        (body) => body && { ...body, parts: body.parts.filter((part) => part.id !== id) },
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: PARTS_KEY }),
  });
}

/** Undoes a delete by saving the Part again; only a Part no Check-in names can be deleted, so a new id loses nothing. */
export function useRestorePart() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async ({ retired, ...draft }: PartDraft & Pick<Part, "retired">) => {
      const { part } = await apiFetch("/api/parts", { method: "POST", body: draft }, SavedPart);

      if (retired)
        await apiFetch(`/api/parts/${part.id}`, { method: "PATCH", body: { retired } }, SavedPart);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: PARTS_KEY }),
  });
}
