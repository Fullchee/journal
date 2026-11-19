import { isoAt } from "@/core";
import { authorizedBody } from "@worker/lib/auth";
import { createEvent } from "@worker/lib/calendar";
import type { PagesContext } from "@worker/lib/env";
import { IsoDate } from "@worker/lib/habit-records";
import { json } from "@worker/lib/json";
import { scheduleTask } from "@worker/lib/todoist";
import * as z from "zod/mini";

const MINUTES_PER_DAY = 1440;

const Minute = z.int().check(z.gte(0), z.lte(MINUTES_PER_DAY));

const TaskId = z.string().check(z.minLength(1));

const Block = z
  .object({
    label: z.string(),
    start: Minute,
    end: Minute,
    taskIds: z.array(TaskId),
    description: z.string(),
  })
  .check(z.refine(({ start, end }) => end > start));

const Blocks = z.object({ day: IsoDate, blocks: z.array(Block) });

/** The one write for gate 2. Calendar events go first: if Google needs reconnecting, no task changes either. */
export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody({ request, env }, Blocks, "invalid blocks");

  if (body instanceof Response) return body;
  const { day, blocks } = body;

  const results = await Promise.all(
    blocks.map((block) =>
      createEvent(env, {
        summary: block.label,
        description: block.description,
        start: isoAt(day, block.start),
        end: isoAt(day, block.end),
      }),
    ),
  );

  const failed = results.find((result) => result.status !== "ok");

  if (failed) return json(failed, failed.status === "unreachable" ? 502 : 200);

  await Promise.all(
    blocks.flatMap((block) =>
      block.taskIds.map((id) => scheduleTask(env, id, isoAt(day, block.start))),
    ),
  );

  return json({
    status: "ok",
    events: blocks.length,
    tasks: blocks.reduce((sum, b) => sum + b.taskIds.length, 0),
  });
}
