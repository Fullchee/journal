import * as z from "zod/mini";

import { apiFetch } from "@/lib/api/api-fetch";
import { PRODUCTION_ORIGIN } from "@/lib/api/config";
import { ApiError, NetworkError, SignedOutError, isRetryable } from "@/lib/api/errors";
import { authorize, recoverFromUnauthorized } from "@/lib/auth/auth";

jest.mock("@/lib/auth/auth", () => ({
  authorize: jest.fn((init: RequestInit) =>
    Promise.resolve({
      ...init,
      headers: { ...Object.fromEntries(new Headers(init.headers)), authorization: "Bearer a1" },
    }),
  ),
  recoverFromUnauthorized: jest.fn(() => Promise.resolve(true)),
}));

const fetchMock = jest.spyOn(globalThis, "fetch");

const Saved = z.object({ id: z.number() });

// What these tests' endpoints answer: flat JSON objects.
type ResponseJson = Record<string, string | number | boolean>;

const reply = (status: number, body?: ResponseJson) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

beforeEach(() => {
  fetchMock.mockReset();
  jest.mocked(recoverFromUnauthorized).mockClear();
});

describe("apiFetch", () => {
  it("sends JSON to the production origin with the bearer header", async () => {
    fetchMock.mockResolvedValue(reply(201, { id: 7 }));

    await expect(
      apiFetch("/api/check-ins", { method: "POST", body: { score: 6 } }, Saved),
    ).resolves.toEqual({ id: 7 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${PRODUCTION_ORIGIN}/api/check-ins`);
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ score: 6 }),
      headers: { "content-type": "application/json", authorization: "Bearer a1" },
    });
  });

  it("sends a file as raw bytes with its own content type", async () => {
    fetchMock.mockResolvedValue(reply(201, { url: "/api/attachments/habits/a.png" }));
    const blob = new Blob(["png"]);

    await apiFetch("/api/attachments/habits", {
      method: "POST",
      file: { blob, type: "image/png" },
    });

    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      body: blob,
      headers: { "content-type": "image/png", authorization: "Bearer a1" },
    });
  });

  it("throws when the body doesn't match the schema", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "7" }));

    await expect(apiFetch("/api/check-ins", {}, Saved)).rejects.toBeInstanceOf(z.core.$ZodError);
  });

  it("ignores the body without a schema", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: 7 }));

    await expect(apiFetch("/api/habits", { method: "POST", body: {} })).resolves.toBeUndefined();
  });

  it("returns undefined for a 204", async () => {
    fetchMock.mockResolvedValue(reply(204));

    await expect(apiFetch("/api/habits", { method: "POST", body: {} })).resolves.toBeUndefined();
  });

  it("throws an ApiError with the server's body", async () => {
    fetchMock.mockResolvedValue(reply(400, { error: "invalid check-in" }));

    const request = apiFetch("/api/check-ins");

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      status: 400,
      body: { error: "invalid check-in" },
    });
  });

  it("drops an error body that isn't journal's shape", async () => {
    fetchMock.mockResolvedValue(reply(502, { error: 1033 }));

    await expect(apiFetch("/api/check-ins")).rejects.toMatchObject({ status: 502, body: null });
  });

  it("throws a NetworkError when the request gets no answer", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    await expect(apiFetch("/api/me")).rejects.toBeInstanceOf(NetworkError);
  });

  it("retries once after a 401 when auth recovers", async () => {
    fetchMock.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200, { ok: true }));

    const Ok = z.object({ ok: z.boolean() });

    await expect(apiFetch("/api/me", {}, Ok)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up on a 401 when auth can't recover", async () => {
    jest.mocked(recoverFromUnauthorized).mockResolvedValueOnce(false);
    fetchMock.mockResolvedValue(reply(401));

    await expect(apiFetch("/api/me")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes auth failures through", async () => {
    jest.mocked(authorize).mockRejectedValueOnce(new SignedOutError());

    await expect(apiFetch("/api/me")).rejects.toBeInstanceOf(SignedOutError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("isRetryable", () => {
  it.each([
    [new NetworkError(null), true],
    [new ApiError(503, null), true],
    [new ApiError(400, null), false],
    [new SignedOutError(), false],
  ])("%s → %s", (error, expected) => {
    expect(isRetryable(error)).toBe(expected);
  });
});
