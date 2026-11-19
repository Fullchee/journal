import { parseProse, type BriefFacts, type Prose } from "@/core";
import type { Ai } from "./env";

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const PROMPT = `You write the prose for a coaching Session brief from the facts given as JSON.
Use the person's own words from notes and thoughts. Do not judge, score or advise.
Reply with JSON only: {"summary": string, "patterns": string[], "toRaise": string}.
summary: one line on the shape of the period. patterns: 0-4 bullets, only with 2 or more data points, linking zone to place, what they were doing, sleep or habits.
toRaise: one item, the hardest moment or the pattern that repeats most.
oneOffs are things planned for one date. A Reschedule with cause "avoidance" means the person put it off; report it plainly, without judgement.
skips are recurring Habits the person chose not to do on a day; one with cause "avoidance" is flagged the same way.`;

/** A failing model costs only the prose: the brief still shows its facts. */
export async function writeProse(ai: Ai, facts: BriefFacts): Promise<Prose | null> {
  try {
    const { response } = await ai.run(MODEL, {
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: JSON.stringify(facts) },
      ],
    });

    return parseProse(response);
  } catch {
    return null;
  }
}
