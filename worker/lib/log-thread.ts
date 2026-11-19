import * as z from "zod/mini";

export const MAX_TEXT = 2000;

/** JSON mode doesn't promise the schema, so a field of the wrong type is dropped rather than trusted. */
const lenient = <Schema extends z.ZodMiniType>(schema: Schema) =>
  z.catch(z.optional(schema), undefined);

/** A list item of the wrong type becomes null, which the caller skips or asks about. */
function lenientList<Schema extends z.ZodMiniType>(schema: Schema) {
  const item = z.catch(z.nullable(schema), null);

  return lenient(z.array(item));
}

const Numbers = z.array(z.number());

/** One entry as the model proposes it; every field is re-checked before a write. */
export const ModelItem = z.object({
  habit: lenient(z.string()),
  date: lenient(z.string()),
  start_time: lenient(z.string()),
  minutes: lenient(z.number()),
  count: lenient(z.number()),
});

export type ModelItem = z.infer<typeof ModelItem>;

const ModelEntry = z.omit(ModelItem, { habit: true });

const ModelCreate = z.extend(ModelEntry, {
  name: lenient(z.string()),
  kind: lenient(z.string()),
  record: lenient(z.string()),
  target_minutes: lenient(z.number()),
  target_type: lenient(z.string()),
  target_count: lenient(z.number()),
  target_days: lenient(Numbers),
});

export type ModelCreate = z.infer<typeof ModelCreate>;

export const ModelOneOff = z.object({
  name: lenient(z.string()),
  date: lenient(z.string()),
  time: lenient(z.string()),
  why: lenient(z.string()),
  usual_when: lenient(z.string()),
});

export type ModelOneOff = z.infer<typeof ModelOneOff>;

/** The model's JSON as it arrives: any field may be missing, and a wrong-typed one reads as missing. */
export const ModelReply = z.object({
  action: lenient(z.enum(["log", "ask", "create", "one-off"])),
  log: lenientList(ModelItem),
  question: lenient(z.string()),
  options: lenientList(z.string()),
  habits: lenientList(z.string()),
  entry: lenient(z.nullable(ModelItem)),
  create: lenient(z.nullable(ModelCreate)),
  one_off: lenient(z.nullable(ModelOneOff)),
});

export type ModelReply = z.infer<typeof ModelReply>;

/** A message the owner or the model wrote, at most MAX_TEXT long. */
export const MessageText = z.string().check(z.maxLength(MAX_TEXT));

/** The body of a one-shot draft call: one non-blank sentence. */
export const Sentence = z.object({
  text: MessageText.check(z.refine((text) => text.trim() !== "")),
});
