import { draftFor, parseCloseDraft, type CloseDraft, type CloseSourcesBody } from "@/core";
import type { Ai } from "@worker/lib/env";
import { MODEL } from "@worker/lib/session-brief-prose";

const PROMPT = `You help close a quarter or a year of a personal journal, given as JSON.
"sources" are the reflections written during the period (a null body was never written). "signals" are facts read from the period's data. "goals" are the active Goals, each with its felt why and the Habits that serve it.
Write the arc: a short paragraph on the shape of the period, in the person's own words where you can.
For each Goal, write its observed position as soft prose and suggest one move: "carry" (keep it as is), "revise" (keep the direction, new wording in "revision"), "retire" (let it go) or "achieve" (it is lived now).
Never judge or shame the person. Never invent why a Goal matters.
Reply with JSON only: {"arc": string, "reviews": [{"goal": string, "review": string, "move": string, "revision": string}], "newGoals": [{"title": string, "why": string}]}.
"goal" is copied exactly from the Goal's title. For a year, "newGoals" proposes next year's Goals from seeds that recur and gaps the year shows, as directions, never targets; leave "why" empty unless the person wrote it. For a quarter, "newGoals" is [].`;

/** Null when the model fails or answers out of shape; the owner then writes the close by hand. */
export async function writeCloseDraft(
  ai: Ai,
  sources: CloseSourcesBody,
): Promise<CloseDraft | null> {
  try {
    const { response } = await ai.run(MODEL, {
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: JSON.stringify(sources) },
      ],
    });

    const reply = parseCloseDraft(response);

    return reply && draftFor(sources.kind, sources.goals, reply);
  } catch {
    return null;
  }
}
