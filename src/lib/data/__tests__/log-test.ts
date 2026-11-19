import { LOG_FAILED, LogDraft } from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError, NetworkError } from "@/lib/api/errors";
import { draftLog, logError } from "@/lib/data/log";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const mockApiFetch = jest.mocked(apiFetch);

describe("draftLog", () => {
  it("posts the sentence and answers the model's draft", async () => {
    const draft = { type: "entries", entries: [{ habit: "walk", minutes: 20 }] };

    mockApiFetch.mockResolvedValueOnce(draft);

    await expect(draftLog("walked 20 min")).resolves.toEqual(draft);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/log/draft",
      { method: "POST", body: { text: "walked 20 min" } },
      LogDraft,
    );
  });

  it.each([
    ["server_reason", new ApiError(502, { error: "The model is down." }), "The model is down."],
    ["no_reason", new ApiError(500, null), LOG_FAILED],
    ["offline", new NetworkError(new Error("down")), LOG_FAILED],
  ])("reads a failed request as unclear: %s", async (_id, error, text) => {
    mockApiFetch.mockRejectedValueOnce(error);

    await expect(draftLog("walked")).resolves.toEqual({ type: "unclear", text });
  });
});

describe("logError", () => {
  it("names the API's reason, or a general failure for any other error", () => {
    expect(logError(new ApiError(502, { error: "The model is down." }))).toBe("The model is down.");
    expect(logError(new Error("boom"))).toBe(LOG_FAILED);
  });
});
