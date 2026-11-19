import { PRODUCTION_ORIGIN } from "@/lib/api/config";
import { NetworkError } from "@/lib/api/errors";
import { resolveImageSource } from "@/lib/api/image-source";
import { authorize } from "@/lib/auth/auth";

jest.mock("@/lib/auth/auth", () => ({
  authorize: jest.fn((init: RequestInit) =>
    Promise.resolve({ ...init, headers: { authorization: "Bearer a1" } }),
  ),
}));

const ATTACHMENT = "/api/attachments/habits/a.webp";

describe("resolveImageSource", () => {
  it("loads an attachment from the API origin with the bearer header", async () => {
    await expect(resolveImageSource(ATTACHMENT)).resolves.toEqual({
      uri: `${PRODUCTION_ORIGIN}${ATTACHMENT}`,
      headers: { authorization: "Bearer a1" },
    });
  });

  it("still loads an attachment without a token, so the disk cache can answer offline", async () => {
    jest.mocked(authorize).mockRejectedValueOnce(new NetworkError(new Error("offline")));

    await expect(resolveImageSource(ATTACHMENT)).resolves.toEqual({
      uri: `${PRODUCTION_ORIGIN}${ATTACHMENT}`,
      headers: {},
    });
  });

  it("never sends the token to another host", async () => {
    await expect(resolveImageSource("https://example.com/a.png")).resolves.toEqual({
      uri: "https://example.com/a.png",
    });
  });
});
