import {
  formatDay,
  INTERACTION_KINDS,
  torontoDay,
  type InteractionProposal,
  type NamedPerson,
} from "@/core";
import * as z from "zod/mini";
import type { Env, Json } from "./env";
import { isRealDate } from "./log-plan";
import { LOG_MODEL, readModelJson, type JsonModeAi } from "./log-model";

/** The API's limits on an Interaction's note and a follow-up line. */
export const MAX_NOTE = 1000;
export const MAX_FOLLOW_UP = 500;

const MAX_PEOPLE = 10;

const SCHEMA = {
  type: "object",
  properties: {
    people: { type: "array", items: { type: "string" }, maxItems: MAX_PEOPLE },
    date: { type: "string" },
    kind: { type: "string", enum: [...INTERACTION_KINDS] },
    note: { type: "string" },
    follow_up: { type: "string" },
  },
  required: ["people"],
} satisfies Json;

const PROMPT = `You turn one person's sentence about being in touch with people into a record of it. Reply with JSON only.
- people: each person they were in touch with, by the name they used. Prefer the spelling in "connections" when it is clearly the same person. Leave out groups and places.
- date: the day it happened as YYYY-MM-DD. "today" or no day is "today" in the context; resolve "yesterday" and weekday names to the latest past date.
- kind: "in-person" if they met (dinner, coffee, visited), "call" for a phone or video call, "message" for texts, chats or email.
- note: a short cleaned-up note on what they talked about, without the names or the day, e.g. "Went to Taiwan last week". Empty if they said nothing about it.
- follow_up: one short thing to ask about next time, starting with a verb, e.g. "Ask about the Taiwan photos". Empty if nothing fits.`;

const Text = z.catch(z.optional(z.string()), undefined);

const Name = z.catch(z.string(), "");

// The model may answer any field with the wrong type, so each is dropped on its own.
const ModelInteraction = z.object({
  people: z.catch(z.array(Name), []),
  date: Text,
  kind: Text,
  note: Text,
  follow_up: Text,
});

type ModelInteraction = z.infer<typeof ModelInteraction>;

interface Person {
  id: number;
  name: string;
}

/** What the model may point at: today and the names of everyone I keep in touch with. */
export interface InteractionContext {
  today: string;
  people: Person[];
}

const wordsOf = (name: string) => name.toLowerCase().split(/\s+/).filter(Boolean);

const startsWith = (words: string[], start: string[]) =>
  start.every((word, i) => words[i] === word);

/**
 * The Connections a said name could mean: the exact name, else names that start with it ("Cindy" is "Cindy Lo"),
 * else names holding it as a word ("Lo"). Never a fuzzy guess: a miss asks the owner to pick.
 */
export function matchesOf(said: string, people: Person[]): Person[] {
  const target = wordsOf(said);

  if (target.length === 0) return [];
  const named = people.map((person) => ({ person, words: wordsOf(person.name) }));

  const tiers = [
    named.filter(({ words }) => words.length === target.length && startsWith(words, target)),
    named.filter(({ words }) => startsWith(words, target)),
    named.filter(({ words }) => target.every((word) => words.includes(word))),
  ];

  return (tiers.find((tier) => tier.length > 0) ?? []).map(({ person }) => person);
}

const oneLine = (text: string | undefined, max: number) =>
  (text ?? "").replaceAll(/\s+/g, " ").trim().slice(0, max);

function peopleOf(said: string[], people: Person[]): NamedPerson[] {
  const names = [
    ...new Set(
      said.flatMap((name) => {
        const line = oneLine(name, MAX_NOTE);

        return line === "" ? [] : line;
      }),
    ),
  ];

  return names
    .slice(0, MAX_PEOPLE)
    .map((name) => ({ said: name, matches: matchesOf(name, people) }));
}

/** The model's reply is untrusted, so a field that doesn't check out falls back to today, a message or empty text. */
export function proposalOf(
  reply: ModelInteraction,
  { today, people }: InteractionContext,
): InteractionProposal {
  const { date } = reply;

  return {
    people: peopleOf(reply.people, people),
    day: date !== undefined && isRealDate(date) && date <= today ? date : today,
    kind: INTERACTION_KINDS.find((kind) => kind === reply.kind) ?? "message",
    note: oneLine(reply.note, MAX_NOTE),
    followUp: oneLine(reply.follow_up, MAX_FOLLOW_UP),
  };
}

async function readInteractionContext(env: Env): Promise<InteractionContext> {
  const { results } = await env.DB.prepare(
    "SELECT id, name FROM connections ORDER BY name COLLATE NOCASE",
  )
    .bind()
    .all<Person>();

  return { today: torontoDay(new Date()), people: results.map(({ id, name }) => ({ id, name })) };
}

/** The one call to Workers AI for an Interaction; ids stay on the server, so the model sees names only. */
async function askInteractionModel(
  ai: JsonModeAi,
  { today, people }: InteractionContext,
  text: string,
) {
  const context = {
    today,
    weekday: formatDay(today, { weekday: "long" }),
    connections: people.map(({ name }) => name),
  };

  const { response } = await ai.run(LOG_MODEL, {
    messages: [
      { role: "system", content: `${PROMPT}\n\nContext: ${JSON.stringify(context)}` },
      { role: "user", content: text },
    ],
    response_format: { type: "json_schema", json_schema: SCHEMA },
  });

  return readModelJson(response, ModelInteraction);
}

/** The sentence as a proposed Interaction; null when Workers AI can't be reached or its reply isn't JSON. */
export async function proposeInteraction(
  env: Env,
  text: string,
): Promise<InteractionProposal | null> {
  const ctx = await readInteractionContext(env);

  try {
    const reply = await askInteractionModel(env.AI, ctx, text);

    return reply === null ? null : proposalOf(reply, ctx);
  } catch {
    return null;
  }
}
