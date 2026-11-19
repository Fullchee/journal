import assert from "node:assert/strict";
import * as calendarLinks from "@worker/api/calendar-links";
import * as closeDraft from "@worker/api/close/draft";
import * as eveningReview from "@worker/api/evening-review";
import * as notes from "@worker/api/notes";
import * as parts from "@worker/api/parts";
import * as search from "@worker/api/search";
import * as sessionBrief from "@worker/api/session-brief";
import * as sessionBriefWindow from "@worker/api/session-brief-window";
import * as weeklyReview from "@worker/api/weekly-review";
import type { PagesContext } from "@worker/lib/env";
import { apiRequest, makeEnv, OWNER } from "./helpers/env";

type Handler = (context: PagesContext<"id" | "kind" | "period" | "type">) => Promise<Response>;

const call = (handler: Handler, method: string, email: string | null) =>
  handler({
    env: makeEnv(),
    params: {},
    request: apiRequest(method, "https://x/api/thing", { email }),
  });

test.each([
  ["parts GET", parts.onRequestGet, "GET"],
  ["search GET", search.onRequestGet, "GET"],
  ["notes PATCH", notes.onRequestPatch, "PATCH"],
  ["close draft POST", closeDraft.onRequestPost, "POST"],
  ["session brief window GET", sessionBriefWindow.onRequestGet, "GET"],
  ["calendar links GET", calendarLinks.onRequestGet, "GET"],
  ["evening review GET", eveningReview.onRequestGet, "GET"],
  ["evening review POST", eveningReview.onRequestPost, "POST"],
])("%s refuses a request that bypassed Access", async (_name, handler, method) => {
  assert.equal((await call(handler, method, null)).status, 401);
});

test("search without a query lists everything", async () => {
  assert.equal((await call(search.onRequestGet, "GET", OWNER)).status, 200);
});

test("a notes request with no type is not found", async () => {
  assert.equal((await call(notes.onRequestGet, "GET", OWNER)).status, 404);
});

test("a notes PATCH with a body that is not a goal is invalid", async () => {
  const res = await notes.onRequestPatch({
    env: makeEnv(),
    params: { type: "goals", id: ["1"] },
    request: apiRequest("PATCH", "https://x/api/notes/goals/1", { email: OWNER, body: "nope" }),
  });

  assert.equal(res.status, 400);
});

test("a session brief without a start date is invalid", async () => {
  assert.equal((await call(sessionBrief.onRequestGet, "GET", OWNER)).status, 400);
});

test("a weekly review without a week is invalid", async () => {
  assert.equal((await call(weeklyReview.onRequestGet, "GET", OWNER)).status, 400);
});
