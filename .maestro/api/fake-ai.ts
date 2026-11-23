// Stands in for the Workers AI binding, so the smoke flows never reach Cloudflare.
// The log box gets a real plan for "<habit> <n> min", a new Habit's details call gets fixed fields, and every other prompt gets fixed prose.
import { WorkerEntrypoint } from "cloudflare:workers";

type Message = { role: string; content: string };
type Habit = { id: string; name: string };

const LOG_SENTENCE = /^(\w+?)(?:ed|ing)?\s+(\d+)\s*min/i;

function habitsIn(system: string): Habit[] {
  const context = system.split("\n\nContext: ")[1];

  return context ? (JSON.parse(context).habits ?? []) : [];
}

function logPlan(system: string, sentence: string) {
  const match = LOG_SENTENCE.exec(sentence.trim());

  if (!match) return null;
  const habit = habitsIn(system).find((h) =>
    h.name.toLowerCase().startsWith(match[1].toLowerCase()),
  );

  return habit ? { action: "log", log: [{ habit: habit.id, minutes: Number(match[2]) }] } : null;
}

// Matches the opening of worker/lib/habit-details-model.ts's PROMPT.
const DETAILS_PROMPT = "You fill in the details of one new Habit";

const DETAILS = {
  cue_type: "action",
  description: "E2E fake description",
};

export function reply(messages: Message[]) {
  const latest = (role: string) => messages.findLast((m) => m.role === role)?.content ?? "";

  if (latest("system").startsWith(DETAILS_PROMPT)) return DETAILS;

  return logPlan(latest("system"), latest("user")) ?? "E2E fake model reply.";
}

export default class FakeAi extends WorkerEntrypoint {
  async run(_model: string, input: { messages: Message[] }) {
    return { response: reply(input.messages) };
  }

  async fetch() {
    return new Response("fake AI: call run() over the service binding", { status: 404 });
  }
}
