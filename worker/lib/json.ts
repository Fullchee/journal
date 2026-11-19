import * as z from "zod/mini";

/** Every body is an object; an interface-typed row has no index signature, so `Json` would refuse it. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- anti-slop bans a plain `object` parameter
export const json = <Body extends object>(body: Body, status = 200) =>
  Response.json(body, { status, headers: { "content-type": "application/json" } });

/** Parses a request or response body with `schema`; a body that is not JSON or not that shape gives `null`. */
export async function readJson<Schema extends z.ZodMiniType>(
  body: Body,
  schema: Schema,
): Promise<z.infer<Schema> | null> {
  try {
    return schema.safeParse(await body.json()).data ?? null;
  } catch {
    return null;
  }
}

/** Parses the JSON object a model reply may wrap in prose; null when there is none or it doesn't match `schema`. */
export function readJsonIn<Schema extends z.ZodMiniType>(
  text: string,
  schema: Schema,
): z.infer<Schema> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end < start) return null;

  try {
    return schema.safeParse(JSON.parse(text.slice(start, end + 1))).data ?? null;
  } catch {
    return null;
  }
}

/** Parses an upstream API's body with `schema`, throwing when the API broke its contract. */
export async function expectJson<Schema extends z.ZodMiniType>(
  body: Body,
  schema: Schema,
): Promise<z.infer<Schema>> {
  return schema.parse(await body.json());
}

/** A string input with its surrounding whitespace removed. */
export const TrimmedText = z.pipe(
  z.string(),
  z.transform((text) => text.trim()),
);
