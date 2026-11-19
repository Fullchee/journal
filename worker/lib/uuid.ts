import * as z from "zod/mini";

/** Offline clients make their ids with crypto.randomUUID(), so anything else is a bad request. */
export const ClientId = z
  .string()
  .check(z.regex(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i));
