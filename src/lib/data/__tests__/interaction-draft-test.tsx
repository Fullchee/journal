import { InteractionProposal } from "@/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError, NetworkError } from "@/lib/api/errors";
import {
  PROPOSE_FAILED,
  proposeInteraction,
  useSaveProposedInteraction,
} from "@/lib/data/interaction-draft";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const mockApiFetch = jest.mocked(apiFetch);

beforeEach(() => mockApiFetch.mockReset());

describe("proposeInteraction", () => {
  it("posts the sentence and answers the proposal", async () => {
    const proposal = { people: [], day: "2026-11-11", kind: "call", note: "", followUp: "" };

    mockApiFetch.mockResolvedValueOnce(proposal);

    await expect(proposeInteraction("Called Cindy")).resolves.toEqual({
      type: "proposal",
      proposal,
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/interactions/draft",
      { method: "POST", body: { text: "Called Cindy" } },
      InteractionProposal,
    );
  });

  it.each([
    ["server_reason", new ApiError(422, { error: "Who was it?" }), "Who was it?"],
    ["no_reason", new ApiError(500, null), PROPOSE_FAILED],
    ["offline", new NetworkError(new Error("down")), PROPOSE_FAILED],
  ])("answers the reason a request failed: %s", async (_id, error, reason) => {
    mockApiFetch.mockRejectedValueOnce(error);

    await expect(proposeInteraction("Called Cindy")).resolves.toEqual({
      type: "unclear",
      text: reason,
    });
  });
});

it("useSaveProposedInteraction posts the Interaction and refreshes Connections", async () => {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, "invalidateQueries");

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const body = {
    connectionIds: [1],
    day: "2026-11-11",
    kind: "call",
    note: "",
    minutes: null,
    followUp: "Ask about Taiwan",
  } as const;

  mockApiFetch.mockResolvedValueOnce({ id: 9 });
  const { result } = await renderHook(() => useSaveProposedInteraction(), { wrapper });

  await act(() => result.current.mutateAsync({ ...body, connectionIds: [...body.connectionIds] }));

  expect(mockApiFetch).toHaveBeenCalledWith("/api/interactions", { method: "POST", body });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["connections"] });
});
