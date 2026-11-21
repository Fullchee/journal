import { queryOptions, useQuery } from "@tanstack/react-query";
import * as z from "zod/mini";

import { WorkEntryKind } from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";

/** A typed bullet of a weekly note; `parent` is the position of the entry it nests under. */
const WorkEntry = z.object({
  day: z.nullable(z.string()),
  position: z.number(),
  parent: z.nullable(z.number()),
  kind: WorkEntryKind,
  text: z.string(),
  ticket: z.nullable(z.string()),
  pr: z.nullable(z.string()),
  done: z.nullable(z.boolean()),
});

export type WorkEntry = z.infer<typeof WorkEntry>;

const CodeReview = z.object({
  day: z.string(),
  pr: z.string(),
  author: z.string(),
  title: z.string(),
});

export type CodeReview = z.infer<typeof CodeReview>;

const TicketLink = z.object({ key: z.string(), url: z.string(), title: z.string() });

const PullRequestLink = z.object({ ref: z.string(), url: z.string() });

/** The parts of a weekly note the Work week shows; `raw_md`, the note as written, gives each day's standup. */
const WeeklyNote = z.object({
  week: z.string(),
  raw_md: z.string(),
  entries: z.array(WorkEntry),
  code_reviews: z.array(CodeReview),
  tickets: z.array(TicketLink),
  pull_requests: z.array(PullRequestLink),
});

export type WeeklyNote = z.infer<typeof WeeklyNote>;

const WeeklyNotesBody = z.object({ notes: z.array(WeeklyNote) });

/** `hit_rate` is null while the Plan is unscored. */
const ScoredDay = z.object({ day: z.string(), hit_rate: z.nullable(z.number()) });

const PlansBody = z.object({ plans: z.array(ScoredDay) });

export type PlansBody = z.infer<typeof PlansBody>;

const weeklyNotesQuery = (week: string) =>
  queryOptions({
    queryKey: ["work", "weekly-notes", week],
    queryFn: ({ signal }) =>
      apiFetch(`/api/work/weekly-notes?week=${week}`, { signal }, WeeklyNotesBody),
    meta: { persist: true },
  });

const plansQuery = queryOptions({
  queryKey: ["work", "plans"],
  queryFn: ({ signal }) => apiFetch("/api/work/plans", { signal }, PlansBody),
  meta: { persist: true },
});

/** The note for one ISO week (`2026-W45`); `notes` is empty until the vault writes it. */
export const useWeeklyNotes = (week: string) => useQuery(weeklyNotesQuery(week));

export const usePlans = () => useQuery(plansQuery);
