import { authorizedBody } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";
import { IsoDate } from "@worker/lib/habit-records";
import { json } from "@worker/lib/json";
import { dropTask, postponeTask } from "@worker/lib/todoist";
import * as z from "zod/mini";

const TaskIds = z.array(z.string().check(z.minLength(1)));

// A task is either postponed or dropped, never both.
const Triage = z
  .object({ postpone: TaskIds, drop: TaskIds, postponeTo: IsoDate })
  .check(z.refine(({ postpone, drop }) => postpone.every((id) => !drop.includes(id))));

/** The one write for gate 1: postpone and drop together, after the user confirms. */
export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, Triage, "invalid triage");

  if (body instanceof Response) return body;
  const { postpone, drop, postponeTo } = body;

  await Promise.all([
    ...postpone.map((id) => postponeTask(env, id, postponeTo)),
    ...drop.map((id) => dropTask(env, id)),
  ]);

  return json({ postponed: postpone.length, dropped: drop.length });
}
