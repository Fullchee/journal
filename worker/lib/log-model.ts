import { formatDay, shiftDay, type Durations } from "@/core";
import type * as z from "zod/mini";
import type { Ai, Env, Json } from "./env";
import { readRecords } from "./habit-records";
import { readJsonIn } from "./json";
import type { LogContext } from "./log-plan";
import { ModelReply } from "./log-thread";

/** Unmeasured: spec open question 1 asks to time this against 20 sample sentences before trusting it. */
export const LOG_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export const MODEL_DOWN =
  "The log box couldn't reach Workers AI. Try again, or log it by hand in the tracker.";

const ITEM = {
  type: "object",
  properties: {
    habit: { type: "string" },
    date: { type: "string" },
    start_time: { type: "string" },
    minutes: { type: "integer" },
    count: { type: "integer" },
    note: { type: "string" },
  },
  required: ["habit"],
};

const SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["log", "ask", "create", "one-off"] },
    log: { type: "array", items: ITEM },
    question: { type: "string" },
    options: { type: "array", items: { type: "string" }, maxItems: 4 },
    habits: { type: "array", items: { type: "string" }, maxItems: 3 },
    entry: {
      type: "object",
      properties: {
        date: { type: "string" },
        start_time: { type: "string" },
        minutes: { type: "integer" },
        count: { type: "integer" },
        note: { type: "string" },
      },
    },
    create: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["good", "bad"] },
        record: { type: "string", enum: ["check", "count", "duration"] },
        target_minutes: { type: "integer" },
        target_type: { type: "string", enum: ["daily", "weekly", "days"] },
        target_count: { type: "integer" },
        target_days: { type: "array", items: { type: "integer" } },
        date: { type: "string" },
        start_time: { type: "string" },
        minutes: { type: "integer" },
        count: { type: "integer" },
        note: { type: "string" },
      },
      required: ["name", "kind", "record", "target_type"],
    },
    one_off: {
      type: "object",
      properties: {
        name: { type: "string" },
        date: { type: "string" },
        time: { type: "string" },
        why: { type: "string" },
      },
      required: ["name"],
    },
  },
  required: ["action"],
} satisfies Json;

const PROMPT = `You turn one person's sentence into Habit logs. Reply with JSON only.
- {"action":"log","log":[{"habit":"<id>","date":"YYYY-MM-DD","start_time":"HH:MM","minutes":30,"count":1}]}
  Use only ids from "habits". "duration" Habits need minutes; give start_time (24-hour) only if the person said when it started. "count" Habits take count (default 1). "check" Habits need neither.
  Leave out date for today. Resolve "yesterday" and weekday names to the latest past date.
  Several Habits in one sentence go in one log list.
  Put what the time or check was spent on in "note", a few words in the person's own wording: "Side projects for the past two hours: Android wrapper" gives "note":"Android wrapper". Leave out note when they said nothing more than the Habit.
- {"action":"ask","question":"Which Habit was that?","habits":["<id>","<id>"],"entry":{"minutes":30},"create":{...}} when the sentence could be two or more Habits, or one only loosely.
  "habits" lists up to 3 candidate ids, best first. "entry" holds what the sentence said (date, start_time, minutes, count, note).
  Add "create" (same shape as below) when a new Habit might fit better than every candidate.
- {"action":"ask","question":"...","options":["..."]} only when the sentence is missing something that isn't the Habit. Options are short plain words, never ids.
- {"action":"create","create":{"name":"...","kind":"good|bad","record":"check|count|duration","target_minutes":60,"target_type":"daily|weekly|days","target_count":3,"target_days":[1,3],"minutes":30}} when no Habit fits. Name it the way a person would, e.g. "Watching YouTube". Never invent an id.
  Fill in every field with your best guess; the person confirms before anything is made.
  kind: "bad" for something they want to stop or cut down, else "good". record: "duration" if they gave minutes, "count" if it can happen many times a day, else "check".
  How often: "daily", "weekly" with target_count (times a week, 1-7), or "days" with target_days (0 = Sunday … 6 = Saturday). Use what they said, e.g. "gym Mon and Thu"; else guess.
- {"action":"one-off","one_off":{"name":"Go portaging","date":"YYYY-MM-DD","time":"HH:MM","why":"..."}} when the person plans something to do once, e.g. "go portaging Saturday" or "run tomorrow at 7am".
  A plan is about a day still to come or later today ("go", "going to", "will"); something already done is a log.
  name: the action, capitalized, e.g. "Go portaging". Resolve "today", "tomorrow", weekday names ("Saturday", "next Tuesday") and dates ("Nov 20") to the next such date on or after today, from "today" and "weekday" in the context.
  If they named no day, leave out date; the person is asked which day. Give time (24-hour) only if they said one, and why only if they said why.
"entries" lists what is already logged; log new entries even if they overlap.`;

/** The model sees the entries of the past week, today included. */
const ENTRY_DAYS = 6;

export type ModelContext = LogContext & { entries: Durations };

const contextMessage = ({ habits, today, time, entries }: ModelContext) =>
  JSON.stringify({
    today,
    weekday: formatDay(today, { weekday: "long" }),
    time,
    habits: habits.map(({ id, name, kind, record }) => ({ id, name, kind, record })),
    entries,
  });

/** Workers AI returns `response` already parsed when `response_format` is set, and as text otherwise. */
export interface JsonModeAi {
  run: (...args: Parameters<Ai["run"]>) => Promise<{ response?: string | object | undefined }>;
}

type ModelResponse = Awaited<ReturnType<JsonModeAi["run"]>>["response"];

/** Reads a JSON-mode reply with `schema`, whether Workers AI parsed it or left it as text; null when it doesn't match. */
export const readModelJson = <Schema extends z.ZodMiniType>(
  response: ModelResponse,
  schema: Schema,
): z.infer<Schema> | null =>
  response instanceof Object
    ? (schema.safeParse(response).data ?? null)
    : readJsonIn(response ?? "", schema);

/** The one call to Workers AI, so tests stub `ai` with canned output. Throws when the model can't be reached. */
export async function askLogModel(ai: JsonModeAi, context: ModelContext, text: string) {
  const { response } = await ai.run(LOG_MODEL, {
    messages: [
      { role: "system", content: `${PROMPT}\n\nContext: ${contextMessage(context)}` },
      { role: "user", content: text },
    ],
    response_format: { type: "json_schema", json_schema: SCHEMA },
  });

  return readModelJson(response, ModelReply);
}

/** Asks the model about `text` with a week of entries and reads its reply with `read`; null when Workers AI can't be reached. */
export async function readModelReply<Reply>(
  env: Env,
  ctx: LogContext,
  text: string,
  read: (reply: ModelReply | null, context: ModelContext) => Reply,
): Promise<Reply | null> {
  const { durations } = await readRecords(env, shiftDay(ctx.today, -ENTRY_DAYS), new Date());
  const context = { ...ctx, entries: durations };

  try {
    return read(await askLogModel(env.AI, context, text), context);
  } catch {
    return null;
  }
}
