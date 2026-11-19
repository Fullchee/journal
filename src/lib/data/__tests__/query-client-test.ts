import { ApiError, NetworkError, SignedOutError } from "@/lib/api/errors";
import { createQueryClient, reloadData, shouldRetryCapture } from "@/lib/data/query-client";

describe("shouldRetryCapture", () => {
  it("keeps retrying while offline or signed out, so no capture is lost", () => {
    expect(shouldRetryCapture(1000, new NetworkError(null))).toBe(true);
    expect(shouldRetryCapture(1000, new SignedOutError())).toBe(true);
  });

  it("gives a failing server a few more tries", () => {
    expect(shouldRetryCapture(1, new ApiError(503, null))).toBe(true);
    expect(shouldRetryCapture(5, new ApiError(503, null))).toBe(false);
  });

  it("drops a capture the server refuses", () => {
    expect(shouldRetryCapture(0, new ApiError(400, null))).toBe(false);
  });
});

describe("reloadData", () => {
  it("clears fetched data but keeps unsent captures", async () => {
    const client = createQueryClient();
    client.setQueryData(["check-ins"], { checkIns: [] });
    client.getMutationCache().build(client, { mutationKey: ["habits", "check"] });

    await reloadData(client);

    expect(client.getQueryData(["check-ins"])).toBeUndefined();
    expect(client.getMutationCache().getAll()).toHaveLength(1);
    client.clear();
  });
});
