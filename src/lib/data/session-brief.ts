import { queryOptions } from "@tanstack/react-query";
import * as z from "zod/mini";

import { BriefBody, BriefWindow } from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";

const WindowBody = z.extend(BriefWindow, { today: z.string(), coach: z.nullable(z.string()) });

export type WindowBody = z.infer<typeof WindowBody>;

/** Where the brief starts: the last session on the coach's calendar, else 7 days ago. */
export const briefWindowQuery = queryOptions({
  queryKey: ["session-brief", "window"],
  queryFn: ({ signal }) => apiFetch("/api/session-brief-window", { signal }, WindowBody),
  gcTime: 0,
});

/** A brief is private material: never persisted, and dropped as soon as the screen lets go of it. */
export const sessionBriefQuery = (start: string) =>
  queryOptions({
    queryKey: ["session-brief", "brief", start],
    queryFn: ({ signal }) =>
      apiFetch(`/api/session-brief?${new URLSearchParams({ start })}`, { signal }, BriefBody),
    gcTime: 0,
    // Each brief write asks the model once; journal says "try again" instead of retrying.
    retry: false,
  });
