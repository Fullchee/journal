import assert from "node:assert/strict";
import { urlOf } from "./helpers/fetch";
import { onRequestGet as getTasks } from "@worker/api/plan/tasks";
import { onRequestPost as postTriage } from "@worker/api/plan/triage";
import { insertHabit } from "@worker/lib/habit-records";
import { makeHabit } from "@/core/__tests__/helpers/habit";
import { apiRequest, makeEnv, OWNER, STRANGER, type RequestBody } from "./helpers/env";

const BODY =
  "## 🌧 Rain — cope\n\n### Reach for\n\n- **Protect the base** — bedtime.\n\n## ☀️ Sun — thrive\n";

const todoistTask = {
  id: "t1",
  content: "Pay rent",
  project_id: "p",
  section_id: null,
  priority: 1,
  labels: [],
  due: null,
};

const calls: { url: string; method: string }[] = [];

const accessFetch = fetch;

// Todoist answers the filter with one task and accepts every write; Access certs still come from the helper.
jest
  .spyOn(globalThis, "fetch")
  .mockImplementation(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = urlOf(input);

    if (!url.startsWith("https://api.todoist.com")) return accessFetch(url, init);

    calls.push({ url, method: init.method ?? "GET" });

    return url.includes("/tasks/filter")
      ? Response.json({ results: [todoistTask], next_cursor: null })
      : new Response(null, { status: 204 });
  });

afterEach(() => {
  calls.length = 0;
});

const seeded = async (zone: "Rain" | "Sun") => {
  const env = makeEnv();

  await insertHabit(
    env,
    makeHabit({ id: "practice-storm-to-sun", name: "Storm to Sun", description: BODY }),
  );
  await env.DB.prepare("INSERT INTO check_ins (checked_in_at, zone, score) VALUES (?, ?, ?)")
    .bind("2026-11-06T12:00:00.000Z", zone, zone === "Rain" ? 3 : 7)
    .run();

  return env;
};

const read = (env: Awaited<ReturnType<typeof seeded>>, email: string | null = OWNER) =>
  getTasks({ env, params: {}, request: apiRequest("GET", "https://x/api/plan/tasks", { email }) });

const triage = (
  env: Awaited<ReturnType<typeof seeded>>,
  body: RequestBody,
  email: string | null = OWNER,
) =>
  postTriage({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/plan/triage", { email, body }),
  });

test("tasks come with the latest zone and its reminders", async () => {
  const body = await (await read(await seeded("Rain"))).json();

  assert.equal(body.zone, "Rain");
  assert.equal(body.reminders, "- **Protect the base** — bedtime.");
  assert.deepEqual(
    body.tasks.map((t: { id: string }) => t.id),
    ["t1"],
  );
});

test("a Sun check-in shows no reminders", async () => {
  const body = await (await read(await seeded("Sun"))).json();

  assert.equal(body.reminders, "");
});

test("no check-in means no zone and no reminders", async () => {
  const env = makeEnv();
  const body = await (await read(env)).json();

  assert.equal(body.zone, null);
  assert.equal(body.reminders, "");
});

test("tasks need an Access sign-in", async () => {
  assert.equal((await read(await seeded("Rain"), null)).status, 401);
});

test("a stranger can't read the owner's tasks", async () => {
  assert.equal((await read(await seeded("Rain"), STRANGER)).status, 403);
  assert.equal(calls.length, 0);
});

test("triage postpones and drops the chosen tasks", async () => {
  const res = await triage(await seeded("Rain"), {
    postpone: ["a"],
    drop: ["b"],
    postponeTo: "2026-11-08",
  });

  assert.equal(res.status, 200);
  assert.deepEqual(
    calls.map((c) => [c.method, c.url.split("/v1", 2)[1]]),
    [
      ["POST", "/tasks/a"],
      ["POST", "/tasks/b/close"],
    ],
  );
});

test("a non-owner cannot triage", async () => {
  const res = await triage(
    await seeded("Rain"),
    { postpone: [], drop: ["b"], postponeTo: "2026-11-08" },
    "other@example.com",
  );

  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

for (const [name, body] of [
  ["a bad date", { postpone: ["a"], drop: [], postponeTo: "tomorrow" }],
  ["non-string ids", { postpone: [1], drop: [], postponeTo: "2026-11-08" }],
  ["a task in both lists", { postpone: ["a"], drop: ["a"], postponeTo: "2026-11-08" }],
  ["a missing list", { postponeTo: "2026-11-08" }],
] satisfies [string, RequestBody][])
  test(`triage rejects ${name} and writes nothing`, async () => {
    const res = await triage(await seeded("Rain"), body);

    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });

test("tasks carry the model's proposals, or null when it fails", async () => {
  const env = await seeded("Rain");
  const reply = { tasks: [{ id: "t1", disposition: "drop", reason: "Stale", minutes: 15 }] };

  env.AI = { run: () => Promise.resolve({ response: JSON.stringify(reply) }) };
  assert.deepEqual((await (await read(env)).json()).proposals, {
    t1: { disposition: "drop", reason: "Stale", minutes: 15 },
  });

  env.AI = { run: () => Promise.resolve({ response: "" }) };
  assert.equal((await (await read(env)).json()).proposals, null);
});
