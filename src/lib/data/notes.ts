import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod/mini";

import type { NoteType } from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";

/**
 * `title` is a Goal's direction, a Reflection's period or a Health record's title; `detail` is the
 * Goal's state, the Reflection's period kind or the record's last update. Only a Goal has `parentId`:
 * the Goal it serves, null at the top level.
 */
const ParentId = z.optional(z.nullable(z.number()));

const NoteRow = z.object({
  id: z.number(),
  title: z.string(),
  detail: z.string(),
  updatedAt: z.string(),
  parentId: ParentId,
});

export type NoteRow = z.infer<typeof NoteRow>;

/** Only a Goal has `why`. */
const Note = z.extend(NoteRow, { body: z.string(), why: z.optional(z.string()) });

export type Note = z.infer<typeof Note>;

const NoteListBody = z.object({ items: z.array(NoteRow) });

export type NoteListBody = z.infer<typeof NoteListBody>;

const NoteBody = z.object({ item: Note });

export type NoteBody = z.infer<typeof NoteBody>;

const HealthPlan = z.object({ body: z.string(), updatedAt: z.nullable(z.string()) });

const HealthPlanBody = z.object({ item: HealthPlan });

export type HealthPlanBody = z.infer<typeof HealthPlanBody>;

export const GOAL_STATES = ["active", "achieved", "retired"] as const;

export interface GoalDraft {
  title: string;
  why: string;
  state: (typeof GOAL_STATES)[number];
  parentId: number | null;
}

/** Persisted so it opens offline from a cold start: it is what the owner reads in Storm. */
export const healthPlanQuery = queryOptions({
  queryKey: ["health-plan"],
  queryFn: ({ signal }) => apiFetch("/api/health-plan", { signal }, HealthPlanBody),
  meta: { persist: true },
});

export const noteListQuery = (type: NoteType) =>
  queryOptions({
    queryKey: ["notes", type],
    queryFn: ({ signal }) => apiFetch(`/api/notes/${type}`, { signal }, NoteListBody),
    meta: { persist: true },
  });

export const noteQuery = (type: NoteType, id: string) =>
  queryOptions({
    queryKey: ["notes", type, id],
    queryFn: ({ signal }) =>
      apiFetch(`/api/notes/${type}/${encodeURIComponent(id)}`, { signal }, NoteBody),
    meta: { persist: true },
  });

export const useHealthPlan = () => useQuery(healthPlanQuery);

export const useNoteList = (type: NoteType) => useQuery(noteListQuery(type));

export const useNote = (type: NoteType, id: string) => useQuery(noteQuery(type, id));

// Edits are online only, so they are never queued: a failure shows at once and the draft stays.
const ONLINE_ONLY = { retry: false } as const;

export function useSaveHealthPlan() {
  const client = useQueryClient();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: (body: string) =>
      apiFetch("/api/health-plan", { method: "PUT", body: { body } }, HealthPlanBody),
    onSuccess: (saved) => client.setQueryData(healthPlanQuery.queryKey, saved),
  });
}

// PUT and PATCH both answer with the saved note, which replaces the cached one; the list's titles may change.
function useSaveNote<T>(
  type: NoteType,
  id: string,
  send: (path: string, value: T) => Promise<NoteBody>,
) {
  const client = useQueryClient();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: (value: T) => send(`/api/notes/${type}/${encodeURIComponent(id)}`, value),
    onSuccess: (saved) => {
      client.setQueryData(noteQuery(type, id).queryKey, saved);
      void client.invalidateQueries({ queryKey: noteListQuery(type).queryKey, exact: true });
    },
  });
}

export const useSaveNoteBody = (type: NoteType, id: string) =>
  useSaveNote(type, id, (path, body: string) =>
    apiFetch(path, { method: "PUT", body: { body } }, NoteBody),
  );

export const useSaveGoal = (id: string) =>
  useSaveNote("goals", id, (path, goal: GoalDraft) =>
    apiFetch(path, { method: "PATCH", body: goal }, NoteBody),
  );

const Created = z.object({ id: z.number() });

interface HealthRecordDraft {
  title: string;
  body: string;
}

export function useCreateHealthRecord() {
  const client = useQueryClient();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: (record: HealthRecordDraft) =>
      apiFetch("/api/notes/health-records", { method: "POST", body: record }, Created),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: noteListQuery("health-records").queryKey,
        exact: true,
      }),
  });
}
