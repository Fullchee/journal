import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TargetsBody, type GoalTargetDraft } from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";

/** Every Goal's Target with its progress around `day`; kept on the device so it shows offline. */
const targetsQuery = (day: string) =>
  queryOptions({
    queryKey: ["targets", day],
    queryFn: ({ signal }) =>
      apiFetch(`/api/targets?${new URLSearchParams({ day })}`, { signal }, TargetsBody),
    meta: { persist: true },
  });

export const useTargets = (day: string) => useQuery(targetsQuery(day));

type TargetAnswer =
  | { answer: "keep" | "let-go" | "achieved"; through: string }
  | { answer: "adjust"; through: string; number: number };

// Edits are online only, so a failure shows at once and the draft stays.
function useTargetWrite<T>(send: (value: T) => Promise<void>) {
  const client = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: send,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["targets"] });
      // Achieved changes the Goal's state.
      void client.invalidateQueries({ queryKey: ["notes", "goals"] });
    },
  });
}

const path = (goalId: number) => `/api/targets/${goalId}`;

export const useSaveTarget = (goalId: number) =>
  useTargetWrite((target: GoalTargetDraft) =>
    apiFetch(path(goalId), { method: "PUT", body: target }),
  );

export const useRemoveTarget = (goalId: number) =>
  useTargetWrite(() => apiFetch(path(goalId), { method: "DELETE" }));

export const useAnswerTarget = (goalId: number) =>
  useTargetWrite((answer: TargetAnswer) =>
    apiFetch(`${path(goalId)}/review`, { method: "POST", body: answer }),
  );
