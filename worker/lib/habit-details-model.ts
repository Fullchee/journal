import { HabitDetails, Kind, CUE_TYPES, RecordStyle } from "@/core";
import * as z from "zod/mini";
import type { Env, Json } from "./env";
import { Name, readHabits } from "./habit-records";
import { LOG_MODEL, readModelJson, type JsonModeAi } from "./log-model";
import { readTime } from "./log-plan";
import { MAX_TEXT, MessageText } from "./log-thread";

// Longer than any HH:MM answer, so a rambling reply is dropped before it is parsed.
const MAX_TIME_TEXT = 200;

// A Scheduled (`time`) cue is the time itself, which `usual_when` carries; Places covers `location`.
const PICKABLE_IDS = CUE_TYPES.map((c) => c.id).filter((id) => id !== "time" && id !== "location");

/** POST /api/habits/draft: the first call's guesses for the new Habit, and the sentence it came from. */
export const DetailsRequest = z.object({
  name: Name,
  kind: Kind,
  record: RecordStyle,
  text: z.optional(MessageText),
});

type DetailsRequest = z.infer<typeof DetailsRequest>;

const SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string" },
    usual_when: { type: "string" },
    cue_type: { type: "string", enum: PICKABLE_IDS },
    stacked_after: { type: "string" },
    goals: { type: "array", items: { type: "integer" } },
  },
} satisfies Json;

const PROMPT = `You fill in the details of one new Habit a person is about to create. Reply with JSON only, and leave out any field you can't guess well.
- cue_type: what the Habit comes after: "stacked" when it comes right after another Habit, else "emotion" (a feeling), "people" (someone around) or "action" (something they just did).
- stacked_after: with cue_type "stacked" only, the id from "habits" it comes right after. Never invent an id.
- usual_when: a usual start time as HH:MM (24-hour), only if the sentence or the Habit implies one.
- goals: ids from "goals" this Habit serves. Never invent an id.
- description: leave it out unless the sentence holds detail that fits no other field.
Keep every field short, in plain words.`;

const Text = z.catch(z.optional(z.string()), undefined);

const Numbers = z.optional(z.array(z.number()));

// The model may answer any field with the wrong type, so each is dropped on its own.
const ModelDetails = z.object({
  description: Text,
  usual_when: Text,
  cue_type: Text,
  stacked_after: Text,
  goals: z.catch(Numbers, undefined),
});

type ModelDetails = z.infer<typeof ModelDetails>;

/** What the model may point at: the Habits a new one can stack after and the Goals it can serve. */
interface DetailsContext {
  habits: { id: string; name: string }[];
  goals: { id: number; title: string }[];
}

async function readDetailsContext(env: Env): Promise<DetailsContext> {
  const habits = await readHabits(env, "WHERE active = 1 AND target_type != 'none'");

  const { results: goals } = await env.DB.prepare(
    "SELECT id, title FROM goals WHERE state = 'active' ORDER BY title",
  )
    .bind()
    .all<{ id: number; title: string }>();

  return {
    habits: habits.map(({ id, name }) => ({ id, name })),
    goals: goals.map(({ id, title }) => ({ id, title })),
  };
}

const clip = (text: string | undefined, max: number) => {
  const trimmed = text?.trim() ?? "";

  return trimmed === "" ? undefined : trimmed.slice(0, max);
};

// The server refuses a stacked cue without the Habit it comes after.
function cueOf({ cue_type: type, stacked_after: after }: ModelDetails, { habits }: DetailsContext) {
  const known = habits.some((habit) => habit.id === after) ? after : undefined;

  const cueType = PICKABLE_IDS.find(
    (id) => id === type && (id !== "stacked" || known !== undefined),
  );

  return cueType === "stacked"
    ? { cue_type: cueType, stacked_after: known }
    : { cue_type: cueType };
}

const goalsOf = (goals: number[] | undefined, ctx: DetailsContext) => {
  const kept = ctx.goals.filter(({ id }) => goals?.includes(id) === true).map(({ id }) => id);

  return kept.length > 0 ? kept : undefined;
};

const usualWhenOf = (text: string | undefined) => {
  const time = clip(text, MAX_TIME_TEXT);

  return time === undefined ? undefined : (readTime(time) ?? undefined);
};

// Every field may still be undefined here; HabitDetails leaves a missing one out instead.
type Proposed = { [Key in keyof HabitDetails]?: HabitDetails[Key] | undefined };

const present = (fields: Proposed) =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));

/** The model's reply is untrusted, so only fields that check out reach the form; the owner fills in the rest. */
function detailsOf(reply: ModelDetails | null, ctx: DetailsContext): HabitDetails {
  if (reply === null) return {};

  return HabitDetails.parse(
    present({
      ...cueOf(reply, ctx),
      description: clip(reply.description, MAX_TEXT),
      usual_when: usualWhenOf(reply.usual_when),
      goals: goalsOf(reply.goals, ctx),
    }),
  );
}

/** The one call to Workers AI for a new Habit's details; throws when the model can't be reached. */
async function askDetailsModel(
  ai: JsonModeAi,
  ctx: DetailsContext,
  { name, kind, record, text }: DetailsRequest,
) {
  const { response } = await ai.run(LOG_MODEL, {
    messages: [
      { role: "system", content: `${PROMPT}\n\nContext: ${JSON.stringify(ctx)}` },
      {
        role: "user",
        content: JSON.stringify({
          name,
          kind,
          record,
          ...(text !== undefined && { sentence: text }),
        }),
      },
    ],
    response_format: { type: "json_schema", json_schema: SCHEMA },
  });

  return readModelJson(response, ModelDetails);
}

/** The new Habit's details, or null when Workers AI can't be reached. */
export async function readHabitDetails(
  env: Env,
  request: DetailsRequest,
): Promise<HabitDetails | null> {
  const ctx = await readDetailsContext(env);

  try {
    return detailsOf(await askDetailsModel(env.AI, ctx, request), ctx);
  } catch {
    return null;
  }
}
