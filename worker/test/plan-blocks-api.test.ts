import assert from "node:assert/strict";
import { sentText, urlOf } from "./helpers/fetch";
import type { Env } from "@worker/lib/env";
import { onRequestGet as getBusy } from "@worker/api/plan/busy";
import { onRequestPost as postBlocks } from "@worker/api/plan/blocks";
import { apiRequest, makeEnv, OWNER, STRANGER, type RequestBody } from "./helpers/env";

const connected = (): Env => ({
  ...makeEnv(),
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_REFRESH_TOKEN: "refresh",
});

const accessFetch = fetch;
const calls: { url: string; method: string; body: unknown }[] = [];

// Google and Todoist both answer; Access certs still come from the helper.
jest
  .spyOn(globalThis, "fetch")
  .mockImplementation(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = urlOf(input);

    const external = /googleapis\.com|todoist\.com/.test(url);

    if (!external) return accessFetch(url, init);

    calls.push({
      url,
      method: init.method ?? "GET",
      // The token request sends a form; every calendar and Todoist call sends JSON.
      body: url.includes("/token") ? null : JSON.parse(sentText(init)),
    });

    if (url.includes("/token")) return Response.json({ access_token: "tok" });

    if (url.includes("freeBusy")) {
      return Response.json({
        calendars: {
          primary: { busy: [{ start: "2026-11-06T15:00:00Z", end: "2026-11-06T16:00:00Z" }] },
        },
      });
    }

    return Response.json({});
  });

afterEach(() => {
  calls.length = 0;
});

const busy = (env: Env, day: string) =>
  getBusy({
    env,
    params: {},
    request: apiRequest("GET", `https://x/api/plan/busy?day=${day}`, { email: OWNER }),
  });

const write = (env: Env, body: RequestBody) =>
  postBlocks({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/plan/blocks", { email: OWNER, body }),
  });

const BLOCKS = {
  day: "2026-11-06",
  blocks: [
    {
      label: "09:00–10:30 block",
      start: 540,
      end: 630,
      taskIds: ["a", "b"],
      description: "- A\n- B",
    },
  ],
};

test("busy returns the day's busy intervals", async () => {
  const body = await (await busy(connected(), "2026-11-06")).json();

  assert.deepEqual(body, {
    status: "ok",
    busy: [{ start: "2026-11-06T15:00:00Z", end: "2026-11-06T16:00:00Z" }],
  });
});

test("busy says 'not-connected' without a refresh token, never an empty day", async () => {
  const body = await (await busy(makeEnv(), "2026-11-06")).json();

  assert.deepEqual(body, { status: "not-connected" });
  assert.equal(calls.length, 0);
});

test("busy rejects a bad day", async () => {
  assert.equal((await busy(connected(), "tomorrow")).status, 400);
});

test("blocks add one event per block, then set each task's time", async () => {
  const res = await write(connected(), BLOCKS);

  assert.deepEqual(await res.json(), { status: "ok", events: 1, tasks: 2 });

  const writes = calls.filter((c) => c.method === "POST" && !c.url.includes("/token"));

  assert.deepEqual(
    writes.map((c) => c.url.split("/").at(-1)),
    ["events", "a", "b"],
  );

  assert.deepEqual(writes[0]!.body, {
    summary: "09:00–10:30 block",
    description: "- A\n- B",
    start: { dateTime: "2026-11-06T14:00:00.000Z" },
    end: { dateTime: "2026-11-06T15:30:00.000Z" },
  });

  assert.deepEqual(writes[1]!.body, { due_datetime: "2026-11-06T14:00:00.000Z" });
});

test("blocks write nothing when the calendar is not connected", async () => {
  const res = await write(makeEnv(), BLOCKS);

  assert.deepEqual(await res.json(), { status: "not-connected" });
  assert.equal(calls.length, 0);
});

test("blocks answer 502 and change no task when Google fails", async () => {
  jest
    .mocked(fetch)
    .mockImplementationOnce(() => Promise.resolve(Response.json({ access_token: "tok" })))
    .mockImplementationOnce(() => Promise.resolve(new Response("down", { status: 500 })));

  const res = await write(connected(), BLOCKS);

  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { status: "unreachable" });
});

test("busy rejects a missing day and a stranger", async () => {
  const noDay = await getBusy({
    env: connected(),
    params: {},
    request: apiRequest("GET", "https://x/api/plan/busy", { email: OWNER }),
  });

  const noToken = await getBusy({
    env: connected(),
    params: {},
    request: apiRequest("GET", "https://x/api/plan/busy?day=2026-11-06", { email: null }),
  });

  const stranger = await getBusy({
    env: connected(),
    params: {},
    request: apiRequest("GET", "https://x/api/plan/busy?day=2026-11-06", { email: STRANGER }),
  });

  assert.deepEqual([noDay.status, noToken.status, stranger.status], [400, 401, 403]);
});

test("blocks reject an invalid body and write nothing", async () => {
  const res = await write(connected(), {
    day: "2026-11-06",
    blocks: [{ label: "x", start: 600, end: 540, taskIds: [], description: "" }],
  });

  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});
