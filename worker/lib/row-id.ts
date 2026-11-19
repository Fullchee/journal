import { authorize } from "./auth";
import type { PagesContext } from "./env";
import { json } from "./json";

/** `/api/<things>` is the list (null); `/api/<things>/<id>` is one row; any other path is undefined. */
export function rowIdOf({ params }: Pick<PagesContext<"id">, "params">): number | null | undefined {
  const segments = [params.id ?? []].flat();

  if (segments.length === 0) return null;

  const [first] = segments;

  return first !== undefined && segments.length === 1 && /^\d+$/.test(first)
    ? Number(first)
    : undefined;
}

/** Authorizes, then reads the row id: null for the list, or the Response to send. */
export async function authorizedRowId(
  context: PagesContext<"id">,
): Promise<Response | number | null> {
  const viewer = await authorize(context.request, context.env);

  if (viewer instanceof Response) return viewer;
  const id = rowIdOf(context);

  return id === undefined ? json({ error: "not found" }, 404) : id;
}
