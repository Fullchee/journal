import * as z from "zod/mini";

const isDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** A real calendar day as YYYY-MM-DD; Feb 30 fails. */
export const Day = z.string().check(z.refine(isDay));
