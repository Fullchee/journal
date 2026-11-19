import type { PagesContext } from "@worker/lib/env";
import { listDays } from "@worker/lib/signal-days";
import { postWorkRows, TicketKey } from "@worker/lib/work-store";
import * as z from "zod/mini";

/** A Ticket's title from Jira; its URL comes from the notes that link it. */
const TicketTitle = z.object({ key: TicketKey, title: z.string().check(z.minLength(1)) });

export async function onRequestGet({ request, env }: PagesContext) {
  return listDays(request, env, "tickets", "SELECT key, title FROM tickets ORDER BY key");
}

export async function onRequestPost(context: PagesContext) {
  return postWorkRows(context, TicketTitle, "tickets", ["key"]);
}
