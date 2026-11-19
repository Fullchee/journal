import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod/mini";

import { CirclesBody } from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";

const CIRCLES_KEY = ["circles"];

const CONNECTIONS_KEY = ["connections"];

const CreatedCircle = z.object({ id: z.number() });

const circlesQuery = queryOptions({
  queryKey: CIRCLES_KEY,
  queryFn: ({ signal }) => apiFetch("/api/circles", { signal }, CirclesBody),
  meta: { persist: true },
});

export const useCircles = () => useQuery(circlesQuery);

// A link or a new Circle changes who a Habit's counted days log for.
function useCirclesMutation<Variables, Result>(
  mutationFn: (variables: Variables) => Promise<Result>,
) {
  const client = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: CIRCLES_KEY }),
        client.invalidateQueries({ queryKey: CONNECTIONS_KEY }),
      ]),
  });
}

/** Online only: the Circle follows the Habit from today, or no Habit with null. */
export const useFollowHabit = () =>
  useCirclesMutation(({ circleId, habitId }: { circleId: number; habitId: string | null }) =>
    apiFetch(`/api/circles/${circleId}`, { method: "PATCH", body: { habitId } }),
  );

/** Online only: a name already taken answers 409. */
export const useCreateCircle = () =>
  useCirclesMutation((circle: { name: string; habitId: string; memberIds: number[] }) =>
    apiFetch("/api/circles", { method: "POST", body: circle }, CreatedCircle),
  );
