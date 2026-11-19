import * as z from "zod/mini";

/** A date range when a recurring Habit is due: Toronto days, both inclusive; an open Season has no end yet. */
export const Season = z.object({ start: z.string(), end: z.nullable(z.string()) });

export type Season = z.infer<typeof Season>;

const covers = ({ start, end }: Season, day: string) =>
  start <= day && (end === null || day <= end);

/** A Habit with no Season is due all year; with any, only on days inside one. */
export const isInSeason = (seasons: Season[], day: string) =>
  seasons.length === 0 || seasons.some((season) => covers(season, day));

/** The first day from `day` on that is inside a Season, or null when none is ahead. */
export const nextSeasonDay = (seasons: Season[], day: string) =>
  isInSeason(seasons, day) ? day : (seasons.find(({ start }) => start > day)?.start ?? null);

const byStart = (seasons: Season[]) => seasons.toSorted((a, b) => a.start.localeCompare(b.start));

/** The Season covering `day`, which the Habit page's End season ends; null when none is. */
export const openSeason = (seasons: Season[], day: string) =>
  seasons.find((season) => covers(season, day)) ?? null;

/** Start season: a Season typed in ahead starts today instead; otherwise a new one opens today. */
export function startSeason(seasons: Season[], today: string): Season[] {
  const ahead = seasons.find(({ start }) => start > today);
  const rest = seasons.filter((season) => season !== ahead);

  return byStart([...rest, { start: today, end: ahead?.end ?? null }]);
}

/** End season: the Season covering today ends today. */
export const endSeason = (seasons: Season[], today: string): Season[] =>
  seasons.map((season) => (covers(season, today) ? { ...season, end: today } : season));
