import type { PlanTask } from "@/core";
import * as z from "zod/mini";
import type { Env } from "./env";
import { expectJson } from "./json";

const API = "https://api.todoist.com/api/v1";

// The day's triage covers everything not yet done up to tomorrow.
const PLAN_FILTER = "overdue | today | tomorrow";

const Due = z.object({ date: z.string() });

const ApiTask = z.object({
  id: z.string(),
  content: z.string(),
  project_id: z.string(),
  section_id: z.nullable(z.string()),
  priority: z.number(),
  labels: z.array(z.string()),
  due: z.nullable(Due),
});

type ApiTask = z.infer<typeof ApiTask>;

const Page = z.object({ results: z.array(ApiTask), next_cursor: z.nullable(z.string()) });

async function call(env: Env, path: string, init: RequestInit = {}) {
  const headers = new Headers({ authorization: `Bearer ${env.TODOIST_TOKEN}` });

  if (init.body !== undefined && init.body !== null)
    headers.set("content-type", "application/json");
  const response = await fetch(`${API}${path}`, { ...init, headers });

  if (!response.ok) {
    throw new Error(`Todoist ${init.method ?? "GET"} ${path} returned HTTP ${response.status}`);
  }

  return response;
}

const toPlanTask = (t: ApiTask): PlanTask => ({
  id: t.id,
  content: t.content,
  projectId: t.project_id,
  sectionId: t.section_id,
  priority: t.priority,
  dueDate: t.due?.date ?? null,
  labels: t.labels,
  source: "todoist",
});

/** Each page's cursor comes from the page before, so the pages load one after another. */
export async function listPlanTasks(env: Env, cursor: string | null = null): Promise<PlanTask[]> {
  const params = new URLSearchParams({ query: PLAN_FILTER });

  if (cursor !== null) params.set("cursor", cursor);
  const response = await call(env, `/tasks/filter?${params.toString()}`);
  const page = await expectJson(response, Page);
  const tasks = page.results.map((task) => toPlanTask(task));

  return page.next_cursor === null
    ? tasks
    : [...tasks, ...(await listPlanTasks(env, page.next_cursor))];
}

export const postponeTask = (env: Env, id: string, day: string) =>
  call(env, `/tasks/${id}`, { method: "POST", body: JSON.stringify({ due_date: day }) });

/** Completing keeps the task in Todoist's history, so a wrong drop can be undone there. */
export const dropTask = (env: Env, id: string) =>
  call(env, `/tasks/${id}/close`, { method: "POST" });

export const scheduleTask = (env: Env, id: string, dueDatetime: string) =>
  call(env, `/tasks/${id}`, {
    method: "POST",
    body: JSON.stringify({ due_datetime: dueDatetime }),
  });
