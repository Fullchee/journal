import { cleanNote, isMinutes, type DraftEntry, type LogDraft, type LogEntry } from "@/core";
import {
  ASK_AGAIN,
  candidateIds,
  dayInWords,
  entryOf,
  isRealDate,
  readCreate,
  readOneOff,
  readTime,
  whichDay,
  type LogContext,
} from "./log-plan";
import type { ModelCreate, ModelItem, ModelOneOff, ModelReply } from "./log-thread";

const UNCLEAR: LogDraft = { type: "unclear", text: ASK_AGAIN.text };

// The owner fills any field the form leaves empty, so a field that doesn't check out is dropped, not asked about.
function fieldsOf(item: ModelItem, { today }: LogContext): LogEntry {
  const { date, start_time: start, minutes, count, note = "" } = item;
  const startTime = start === undefined ? null : readTime(start);
  const cleaned = cleanNote(note);

  return {
    ...(date !== undefined && isRealDate(date) && date <= today && { date }),
    ...(startTime !== null && { start_time: startTime }),
    ...(isMinutes(minutes) && { minutes }),
    ...(count !== undefined && Number.isSafeInteger(count) && count >= 1 && { count }),
    ...(cleaned !== "" && { note: cleaned }),
  };
}

const knownId = (id: string | undefined, ctx: LogContext) =>
  ctx.habits.find((habit) => habit.id === id)?.id ?? null;

function entriesDraft(items: ModelReply["log"], ctx: LogContext): LogDraft {
  const entries: DraftEntry[] = (items ?? [])
    .filter((item) => item !== null)
    .map((item) => ({ habit: knownId(item.habit, ctx), ...fieldsOf(item, ctx) }));

  return entries.length > 0 ? { type: "entries", entries } : UNCLEAR;
}

function createDraft(create: ModelCreate | null | undefined, ctx: LogContext): LogDraft | null {
  const proposed = readCreate(create);

  return (
    proposed && { type: "create", habit: proposed.habit, entry: fieldsOf(proposed.entry, ctx) }
  );
}

function chooseDraft(reply: ModelReply, ctx: LogContext): LogDraft {
  const entry = reply.entry ?? {};

  const habit = candidateIds(reply)
    .map((id) => knownId(id, ctx))
    .find((id) => id !== null);

  if (habit !== undefined)
    return { type: "entries", entries: [{ habit, ...fieldsOf(entry, ctx) }] };
  const created = reply.create ? createDraft({ ...reply.create, ...entryOf(entry) }, ctx) : null;

  if (created) return created;
  const { question = "" } = reply;

  return question.trim() === "" ? UNCLEAR : { type: "unclear", text: question };
}

function oneOffDraft(model: ModelOneOff | null | undefined, { today }: LogContext): LogDraft {
  const oneOff = readOneOff(model, today);

  if (oneOff === null) return UNCLEAR;
  const { name, date } = oneOff;

  return {
    type: "one-off",
    one_off: oneOff,
    text: date === undefined ? whichDay(name) : `${name} on ${dayInWords(date)}.`,
  };
}

/** The model's reply as a form the owner edits before saving; it is untrusted, so only checked fields reach the form. */
export function draftOf(reply: ModelReply | null, ctx: LogContext): LogDraft {
  if (reply === null) return UNCLEAR;

  switch (reply.action) {
    case "log": {
      return entriesDraft(reply.log, ctx);
    }

    case "ask": {
      return chooseDraft(reply, ctx);
    }

    case "create": {
      return createDraft(reply.create, ctx) ?? UNCLEAR;
    }

    case "one-off": {
      return oneOffDraft(reply.one_off, ctx);
    }

    case undefined: {
      return UNCLEAR;
    }
  }
}
