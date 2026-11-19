import { Disposition, type PlanTask, type Proposal } from "@/core";
import * as z from "zod/mini";
import type { Ai } from "./env";
import { readJsonIn } from "./json";
import { MODEL } from "./session-brief-prose";

const FALLBACK: Proposal = { disposition: "keep", reason: "", minutes: 30 };

const PROMPT = `You triage a person's Todoist tasks for one day. For each task choose a disposition:
- keep: due today or truly urgent, fits the day, has a clear next action.
- postpone: not urgent, the day is overcommitted, or it is blocked.
- drop: long overdue, vague, or repeatedly postponed. Suggest it, never assume it.
Weigh priority (4 is highest) and due date. Estimate minutes of work, a multiple of 5 up to 240.
Reply with JSON only: {"tasks":[{"id":"...","disposition":"keep|postpone|drop","reason":"one short line","minutes":30}]}`;

const OptionalId = z.optional(z.string());

const Minutes = z.int().check(z.gt(0));

// The model may answer any field with the wrong type, so each falls back on its own.
const Reply = z.object({
  id: z.catch(OptionalId, undefined),
  disposition: z.catch(Disposition, FALLBACK.disposition),
  reason: z.catch(z.string(), FALLBACK.reason),
  minutes: z.catch(Minutes, FALLBACK.minutes),
});

const ReplyOrNull = z.catch(z.nullable(Reply), null);

const Replies = z.object({ tasks: z.catch(z.array(ReplyOrNull), []) });

type Reply = z.infer<typeof Reply>;

const proposalOf = (reply: Reply | undefined): Proposal =>
  reply === undefined
    ? FALLBACK
    : { disposition: reply.disposition, reason: reply.reason, minutes: reply.minutes };

/**
 * The model's suggestion per task id, or null when it can't be reached or answers off-format.
 * A task it skips or garbles falls back to keep for 30 minutes, so the user is never left without a row.
 */
export async function proposeForTasks(ai: Ai, tasks: PlanTask[]) {
  if (tasks.length === 0) return {};

  try {
    const { response = "" } = await ai.run(MODEL, {
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: JSON.stringify(
            tasks.map(({ id, content, priority, dueDate, labels }) => ({
              id,
              content,
              priority,
              dueDate,
              labels,
            })),
          ),
        },
      ],
    });

    const parsed = readJsonIn(response, Replies);

    if (parsed === null) return null;
    const replies = parsed.tasks.filter((reply) => reply !== null);

    return Object.fromEntries(
      tasks.map((t) => [t.id, proposalOf(replies.find((r) => r.id === t.id))]),
    );
  } catch {
    return null;
  }
}
