import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import * as z from "zod/mini";

import { WeeklyReviewBody } from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";

/**
 * Each open asks the model once and the draft holds Check-ins in full, so it is never cached or retried,
 * and never refetched behind the owner's back, which would ask the model again and could drop a typed retro.
 */
export const weeklyReviewQuery = (week: string) =>
  queryOptions({
    queryKey: ["weekly-review", week],
    queryFn: ({ signal }) =>
      apiFetch(`/api/weekly-review?${new URLSearchParams({ week })}`, { signal }, WeeklyReviewBody),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });

const Created = z.object({ id: z.number() });

/** `id` is the saved retro to replace; null creates the week's row, which the API refuses with a 409 if one exists. */
interface RetroSave {
  week: string;
  body: string;
  id: number | null;
}

async function sendRetro({ week, body, id }: RetroSave) {
  if (id === null) {
    const { id: created } = await apiFetch(
      "/api/notes/reflections",
      { method: "POST", body: { periodKind: "week", period: week, body } },
      Created,
    );

    return created;
  }

  await apiFetch(`/api/notes/reflections/${id}`, { method: "PUT", body: { body } });

  return id;
}

/** Saving goes through the notes API; afterwards the screen knows the week's retro exists. */
export function useSaveRetro() {
  const client = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: sendRetro,
    onSuccess: (id, { week, body }) => {
      client.setQueryData(
        weeklyReviewQuery(week).queryKey,
        (review) => review && { ...review, existing: { id, body } },
      );
      void client.invalidateQueries({ queryKey: ["notes", "reflections"] });
    },
  });
}
