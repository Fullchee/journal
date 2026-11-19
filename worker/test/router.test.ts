import assert from "node:assert/strict";
import * as attachments from "@worker/api/attachments";
import * as circles from "@worker/api/circles";
import * as close from "@worker/api/close";
import * as closeDraft from "@worker/api/close/draft";
import * as connections from "@worker/api/connections";
import * as interactions from "@worker/api/interactions";
import * as interactionsDraft from "@worker/api/interactions/draft";
import * as logOneOff from "@worker/api/log/one-off";
import * as logUndo from "@worker/api/log/undo";
import * as notes from "@worker/api/notes";
import * as parts from "@worker/api/parts";
import worker from "@worker/index";
import { apiRequest, makeEnv, OWNER } from "./helpers/env";

const call = (method: string, path: string, email: string | null = OWNER) =>
  worker.fetch(
    apiRequest(method, `https://journal.fullchee.workers.dev${path}`, {
      email,
    }),
    makeEnv(),
  );

afterEach(() => {
  jest.restoreAllMocks();
});

test("routes GET /api/me to its handler", async () => {
  const res = await call("GET", "/api/me");

  assert.equal(res.status, 204);
});

test("lets the handler reject a request without an Access token", async () => {
  assert.equal((await call("GET", "/api/me", null)).status, 401);
});

test("answers 405 for a method the module doesn't export", async () => {
  assert.equal((await call("DELETE", "/api/me")).status, 405);
});

test("answers 404 for an unknown path", async () => {
  assert.equal((await call("GET", "/api/nope")).status, 404);
});

test.each([
  {
    id: "log id",
    spy: () => jest.spyOn(logUndo, "onRequestPost"),
    method: "POST",
    path: "/api/log/42/undo",
    expected: { id: "42" },
  },
  {
    id: "note type and rest",
    spy: () => jest.spyOn(notes, "onRequestGet"),
    method: "GET",
    path: "/api/notes/reflection/7",
    expected: { type: "reflection", id: ["7"] },
  },
  {
    id: "empty catch-all",
    spy: () => jest.spyOn(connections, "onRequestGet"),
    method: "GET",
    path: "/api/connections",
    expected: { id: [] },
  },
  {
    id: "interaction id",
    spy: () => jest.spyOn(interactions, "onRequestDelete"),
    method: "DELETE",
    path: "/api/interactions/4",
    expected: { id: ["4"] },
  },
  {
    id: "close kind and period",
    spy: () => jest.spyOn(close, "onRequestGet"),
    method: "GET",
    path: "/api/close/quarter/2026-Q4",
    expected: { kind: "quarter", period: "2026-Q4" },
  },
  {
    id: "close draft kind and period",
    spy: () => jest.spyOn(closeDraft, "onRequestPost"),
    method: "POST",
    path: "/api/close/quarter/2026-Q4/draft",
    expected: { kind: "quarter", period: "2026-Q4" },
  },
  {
    id: "circle id",
    spy: () => jest.spyOn(circles, "onRequestGet"),
    method: "GET",
    path: "/api/circles/3",
    expected: { id: ["3"] },
  },
  {
    id: "part id",
    spy: () => jest.spyOn(parts, "onRequestGet"),
    method: "GET",
    path: "/api/parts/2",
    expected: { id: ["2"] },
  },
  {
    id: "static interactions route",
    spy: () => jest.spyOn(interactionsDraft, "onRequestPost"),
    method: "POST",
    path: "/api/interactions/draft",
    expected: {},
  },
  {
    id: "multi-segment path",
    spy: () => jest.spyOn(attachments, "onRequestGet"),
    method: "GET",
    path: "/api/attachments/a/b.jpg",
    expected: { path: ["a", "b.jpg"] },
  },
  {
    id: "static log route",
    spy: () => jest.spyOn(logOneOff, "onRequestPost"),
    method: "POST",
    path: "/api/log/one-off",
    expected: {},
  },
])("passes Pages-style params: $id", async ({ spy, method, path, expected }) => {
  const handler = spy().mockResolvedValue(Response.json({}));

  await call(method, path);

  expect(handler).toHaveBeenCalledWith(expect.objectContaining({ params: expected }));
});

test("routes GET /api/weekly-review to its handler", async () => {
  assert.equal((await call("GET", "/api/weekly-review?week=soon")).status, 400);
});
