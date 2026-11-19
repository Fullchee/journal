import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError } from "@/lib/api/errors";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, pendingApi, reply } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { connection, habit, timedHabit } from "../../jest/fixtures";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

describe("fakeApi", () => {
  it("answers a GET by pathname, whatever its query", async () => {
    fakeApi({ "/api/me": () => ({ ok: true }) });

    await expect(apiFetch("/api/me?x=1")).resolves.toEqual({ ok: true });
  });

  it("prefers the route whose query params match, by key or by value", async () => {
    fakeApi({
      "/api/habits": () => "tracked",
      "/api/habits?view=library": () => "library",
      "/api/check-ins": () => "list",
      "/api/check-ins?at": () => "guess",
    });

    await expect(apiFetch("/api/habits?view=week")).resolves.toBe("tracked");
    await expect(apiFetch("/api/habits?view=library")).resolves.toBe("library");
    await expect(apiFetch("/api/check-ins")).resolves.toBe("list");
    await expect(apiFetch("/api/check-ins?at=2026-11-08")).resolves.toBe("guess");
  });

  it("answers from a function of the request", async () => {
    fakeApi({ "/api/search": ({ url }) => url.searchParams.get("q") });

    await expect(apiFetch("/api/search?q=walk")).resolves.toBe("walk");
  });

  it("rejects with the error a route throws, and still records the write", async () => {
    const notFound = new ApiError(404, null);

    const fail = () => {
      throw notFound;
    };

    const { writes } = fakeApi({ "/api/notes/goals/9": fail, "PUT /api/health-plan": fail });

    await expect(apiFetch("/api/notes/goals/9")).rejects.toBe(notFound);
    await expect(apiFetch("/api/health-plan", { method: "PUT", body: {} })).rejects.toBe(notFound);
    expect(writes).toEqual([{ path: "/api/health-plan", method: "PUT", body: {} }]);
  });

  it("throws on a GET with no route", async () => {
    fakeApi({});

    await expect(apiFetch("/api/sleep")).rejects.toThrow("Unexpected GET /api/sleep");
  });

  it("records every write and answers it from its method and path, or undefined", async () => {
    const { writes } = fakeApi({ "POST /api/habits": () => ({ id: "stretch" }) });

    await expect(
      apiFetch("/api/habits", { method: "POST", body: { name: "Stretch" } }),
    ).resolves.toEqual({ id: "stretch" });
    await expect(
      apiFetch("/api/habits", { method: "PATCH", body: { id: "walk" } }),
    ).resolves.toBeUndefined();
    expect(writes).toEqual([
      { path: "/api/habits", method: "POST", body: { name: "Stretch" } },
      { path: "/api/habits", method: "PATCH", body: { id: "walk" } },
    ]);
  });
});

it("reply answers a body, or rejects with an Error", async () => {
  const down = new ApiError(502, null);

  fakeApi({ "/api/plan/tasks": reply({ tasks: [] }), "/api/plan/busy": reply(down) });

  await expect(apiFetch("/api/plan/tasks")).resolves.toEqual({ tasks: [] });
  await expect(apiFetch("/api/plan/busy")).rejects.toBe(down);
});

it("pendingApi never settles", async () => {
  pendingApi();

  const settled = jest.fn();

  void apiFetch("/api/me").then(settled).catch(settled);
  await Promise.resolve();

  expect(settled).not.toHaveBeenCalled();
});

describe("fixtures", () => {
  it("a timed Habit records duration with minutes a day", () => {
    expect(timedHabit({ id: "sit", targetMinutes: 20 })).toEqual(
      habit({ id: "sit", record: "duration", targetMinutes: 20 }),
    );
    expect(timedHabit().targetMinutes).toBe(30);
  });

  it("a Connection takes overrides", () => {
    expect(connection({ name: "Dad" })).toEqual(expect.objectContaining({ id: 3, name: "Dad" }));
  });
});
