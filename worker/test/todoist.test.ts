import assert from "node:assert/strict";
import { sentText, urlOf } from "./helpers/fetch";
import { dropTask, listPlanTasks, postponeTask, scheduleTask } from "@worker/lib/todoist";
import { makeEnv } from "./helpers/env";

const env = { ...makeEnv(), TODOIST_TOKEN: "secret-token" };

interface Sent {
  url: string;
  method: string;
  auth: string | null;
  body: unknown;
}

// Answers each request with the next response and records what was sent.
function serve(...responses: Response[]) {
  const sent: Sent[] = [];

  jest
    .spyOn(globalThis, "fetch")
    .mockImplementation((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = urlOf(input);

      sent.push({
        url,
        method: init.method ?? "GET",
        auth: new Headers(init.headers).get("authorization"),
        body: init.body === undefined ? null : JSON.parse(sentText(init)),
      });

      return Promise.resolve(responses.shift() ?? new Response("{}", { status: 500 }));
    });

  return sent;
}

afterEach(() => jest.restoreAllMocks());

interface ApiTask {
  id: string;
  content: string;
  project_id: string;
  section_id: string | null;
  priority: number;
  labels: string[];
  due: { date: string } | null;
}

const api = (task: Partial<ApiTask>): ApiTask => ({
  id: "t1",
  content: "Write report",
  project_id: "p1",
  section_id: null,
  priority: 4,
  labels: [],
  due: { date: "2026-11-05" },
  ...task,
});

test("listPlanTasks asks for overdue, today and tomorrow with the token", async () => {
  const sent = serve(Response.json({ results: [api({})], next_cursor: null }));

  await listPlanTasks(env);

  const url = new URL(sent[0]!.url);

  assert.equal(url.origin + url.pathname, "https://api.todoist.com/api/v1/tasks/filter");
  assert.equal(url.searchParams.get("query"), "overdue | today | tomorrow");
  assert.equal(sent[0]!.auth, "Bearer secret-token");
});

test("listPlanTasks maps tasks to camelCase and follows the cursor", async () => {
  const sent = serve(
    Response.json({ results: [api({ id: "a" })], next_cursor: "next" }),
    Response.json({
      results: [api({ id: "b", section_id: "s9", due: null })],
      next_cursor: null,
    }),
  );

  const tasks = await listPlanTasks(env);

  assert.equal(new URL(sent[1]!.url).searchParams.get("cursor"), "next");

  assert.deepEqual(
    tasks.map((t) => [t.id, t.sectionId, t.dueDate, t.projectId, t.priority]),
    [
      ["a", null, "2026-11-05", "p1", 4],
      ["b", "s9", null, "p1", 4],
    ],
  );
});

test("listPlanTasks throws when Todoist rejects the request", async () => {
  serve(new Response("nope", { status: 401 }));
  await assert.rejects(listPlanTasks(env), /Todoist.*401/);
});

test("postponeTask sets the task's due date", async () => {
  const sent = serve(Response.json(api({})));

  await postponeTask(env, "t1", "2026-11-07");

  assert.equal(sent[0]!.url, "https://api.todoist.com/api/v1/tasks/t1");
  assert.equal(sent[0]!.method, "POST");
  assert.deepEqual(sent[0]!.body, { due_date: "2026-11-07" });
});

test("dropTask completes the task instead of deleting it", async () => {
  const sent = serve(new Response(null, { status: 204 }));

  await dropTask(env, "t1");

  assert.equal(sent[0]!.url, "https://api.todoist.com/api/v1/tasks/t1/close");
  assert.equal(sent[0]!.method, "POST");
});

test("a failed write throws", async () => {
  serve(new Response("gone", { status: 404 }));
  await assert.rejects(dropTask(env, "t1"), /Todoist.*404/);
});

test("scheduleTask sets the task's due time", async () => {
  const sent = serve(Response.json(api({})));

  await scheduleTask(env, "t1", "2026-11-06T14:00:00.000Z");

  assert.equal(sent[0]!.url, "https://api.todoist.com/api/v1/tasks/t1");
  assert.deepEqual(sent[0]!.body, { due_datetime: "2026-11-06T14:00:00.000Z" });
});
