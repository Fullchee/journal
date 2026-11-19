import * as z from "zod/mini";

/** One Rest mode period: both ends are Toronto days and both are rest days. */
export const RestPeriod = z.object({ start: z.string(), end: z.string() });

export type RestPeriod = z.infer<typeof RestPeriod>;

export const MAX_REST_DAYS = 30;

/** The Rest mode period covering `day`, if any. */
export const restPeriodOn = (restPeriods: RestPeriod[], day: string) =>
  restPeriods.find(({ start, end }) => start <= day && day <= end) ?? null;
