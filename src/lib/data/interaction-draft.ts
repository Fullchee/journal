import { InteractionProposal, type InteractionKind } from "@/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError } from "@/lib/api/errors";

export const PROPOSE_FAILED = "Couldn't reach the server. Check your connection and try again.";

/** What the review form saves: one Interaction on everyone picked, and a follow-up line for each of them. */
export interface ProposedInteraction {
  connectionIds: number[];
  day: string;
  kind: InteractionKind;
  note: string;
  minutes: number | null;
  followUp: string;
}

export type ReadSentence =
  | { type: "proposal"; proposal: InteractionProposal }
  | { type: "unclear"; text: string };

/** Not a queued capture, like the Log box: the guess opens a form now, which makes no sense hours later. */
export async function proposeInteraction(text: string): Promise<ReadSentence> {
  try {
    const proposal = await apiFetch(
      "/api/interactions/draft",
      { method: "POST", body: { text } },
      InteractionProposal,
    );

    return { type: "proposal", proposal };
  } catch (error) {
    return {
      type: "unclear",
      text: (error instanceof ApiError ? error.body?.error : undefined) ?? PROPOSE_FAILED,
    };
  }
}

/** Online only: the form stays open with the reason when the save fails. */
export function useSaveProposedInteraction() {
  const client = useQueryClient();

  return useMutation({
    networkMode: "always",
    retry: false,
    mutationFn: (body: ProposedInteraction) =>
      apiFetch("/api/interactions", { method: "POST", body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["connections"] }),
  });
}
