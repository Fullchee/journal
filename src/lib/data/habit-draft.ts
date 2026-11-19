import { HabitDetails, type NewHabit } from "@/core";
import { skipToken, useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/api-fetch";

type DetailsInput = Pick<NewHabit, "name" | "kind" | "record"> & { text?: string };

/** Proposes only; nothing is written until the owner taps Create. */
const draftHabitDetails = (input: DetailsInput) =>
  apiFetch("/api/habits/draft", { method: "POST", body: input }, HabitDetails);

/**
 * The log box's proposed Habit gets one details call when its editor opens; a blank New habit has nothing to guess from.
 * A failure isn't retried: the form already works without the details.
 */
export function useHabitDetails(proposed: NewHabit | null, text: string | undefined) {
  return useQuery({
    queryKey: ["habit-details", proposed, text],
    queryFn:
      proposed === null
        ? skipToken
        : () =>
            draftHabitDetails({
              name: proposed.name,
              kind: proposed.kind,
              record: proposed.record,
              ...(text !== undefined && { text }),
            }),
    retry: false,
    staleTime: Infinity,
  });
}
