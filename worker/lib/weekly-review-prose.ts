import { parseWeeklyProse, type WeekDay, type WeeklyGoal, type WeeklyProse } from "@/core";
import type { Ai } from "./env";
import { MODEL } from "./session-brief-prose";

const PROMPT = `You help write a Weekly retro from one week of journal data given as JSON.
"days" holds the week's Check-ins, sleep, activity and the Habits done each day. "goals" are the active Goals, each with its felt why and the Habits that serve it.
Surface direction: say which way the week moved each Goal. Never judge or shame the person. Use the person's own words from notes where you can.
Reply with JSON only: {"summary": string, "directions": [{"goal": string, "movement": string}]}.
summary: one line on the shape of the week. directions: one entry per Goal, "goal" copied exactly from its title, "movement" one short clause.`;

/** A failing model costs only the prose: the retro still shows the week's data and a skeleton to write in. */
export async function writeWeeklyProse(
  ai: Ai,
  facts: { week: string; days: WeekDay[]; goals: WeeklyGoal[] },
): Promise<WeeklyProse | null> {
  try {
    const { response } = await ai.run(MODEL, {
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: JSON.stringify(facts) },
      ],
    });

    return parseWeeklyProse(response);
  } catch {
    return null;
  }
}
