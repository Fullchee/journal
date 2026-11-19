import { authorize } from "@worker/lib/auth";
import type { PagesContext } from "@worker/lib/env";

/** The app asks once after sign-in; anyone but the owner gets a 403 and is signed out. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  return viewer instanceof Response ? viewer : new Response(null, { status: 204 });
}
