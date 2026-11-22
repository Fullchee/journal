import { TargetNumber } from "@/core";
import { authorizedBody } from "@worker/lib/auth";
import { Day } from "@worker/lib/day";
import type { PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

/** `through` is the last Day of the period that ended short, so the Weekly review asks about it once. */
const Answer = z.discriminatedUnion("answer", [
  z.object({ answer: z.enum(["keep", "let-go", "achieved"]), through: Day }),
  z.object({ answer: z.literal("adjust"), through: Day, number: TargetNumber }),
]);

// ?1 is `through`, ?2 the Goal and ?3 an Adjust's new number. Let go drops the number, so the Goal is directional again.
const ANSWERS: Record<z.infer<typeof Answer>["answer"], string> = {
  keep: "UPDATE goal_targets SET reviewed_through = ?1 WHERE goal_id = ?2",
  adjust: "UPDATE goal_targets SET number = ?3, reviewed_through = ?1 WHERE goal_id = ?2",
  "let-go": "UPDATE goal_targets SET number = NULL, reviewed_through = ?1 WHERE goal_id = ?2",
  achieved:
    "UPDATE goal_targets SET reviewed_through = ?1 WHERE goal_id = ?2 AND period = 'deadline'",
};

/** The Weekly review's answer to a Target whose period ended short: Keep, Adjust, Let go, or Achieved at a deadline. */
export async function onRequestPost(context: PagesContext<"goalId">) {
  const body = await authorizedBody(context, Answer, "invalid answer");

  if (body instanceof Response) return body;
  const goalId = Number(context.params.goalId);
  const db = context.env.DB;

  const { meta } = await db
    .prepare(ANSWERS[body.answer])
    .bind(body.through, goalId, ...(body.answer === "adjust" ? [body.number] : []))
    .run();

  if (meta.changes === 0) return json({ error: "no target to answer" }, 404);

  if (body.answer === "achieved")
    await db
      .prepare(
        "UPDATE goals SET state = 'achieved', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      )
      .bind(goalId)
      .run();

  return new Response(null, { status: 204 });
}
