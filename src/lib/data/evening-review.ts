import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { CalendarLinksBody, EveningReviewBody, type CalendarLink, type ReviewAnswer } from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError, isRetryable } from "@/lib/api/errors";

const RETRY_DELAY_MS = 500;

// Each screen has its own Try again, so one quick retry covers a blip.
const ONE_QUICK_RETRY = {
  retry: (failures: number, error: Error) => failures < 1 && isRetryable(error),
  retryDelay: RETRY_DELAY_MS,
};

// Online-only writes fail at once instead of queueing like a capture.
const ONLINE_ONLY = { retry: false, networkMode: "always" } as const;

/** Links only, from D1, so Today can ask without reading Google. */
export const calendarLinksQuery = queryOptions({
  queryKey: ["calendar-links"],
  queryFn: ({ signal }) => apiFetch("/api/calendar-links", { signal }, CalendarLinksBody),
  ...ONE_QUICK_RETRY,
});

/** Links plus the recurring series on my calendars; read fresh on every visit. */
export const calendarSeriesQuery = queryOptions({
  queryKey: ["calendar-links", "series"],
  queryFn: ({ signal }) => apiFetch("/api/calendar-links?series=1", { signal }, CalendarLinksBody),
  gcTime: 0,
  ...ONE_QUICK_RETRY,
});

export const eveningReviewQuery = (day: string) =>
  queryOptions({
    queryKey: ["evening-review", day],
    queryFn: ({ signal }) =>
      apiFetch(
        `/api/evening-review?${new URLSearchParams({ day })}`,
        { signal },
        EveningReviewBody,
      ),
    gcTime: 0,
    ...ONE_QUICK_RETRY,
  });

export type LinkChange =
  | ({ type: "link" } & CalendarLink)
  | { type: "unlink"; calendarId: string; seriesId: string };

export function useChangeLink() {
  const client = useQueryClient();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: (change: LinkChange) =>
      apiFetch("/api/calendar-links", { method: "POST", body: change }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["calendar-links"] }),
  });
}

const CONFLICT = 409;

/** A 409 means the Day was already confirmed, here or by the morning pass, so there is nothing left to save. */
async function confirmReview(body: { day: string; answers: ReviewAnswer[] }) {
  try {
    await apiFetch("/api/evening-review", { method: "POST", body });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === CONFLICT)) throw error;
  }
}

export function useConfirmReview() {
  const client = useQueryClient();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: confirmReview,
    onSuccess: (_outcome, { day }) =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["evening-review", day] }),
        client.invalidateQueries({ queryKey: ["habits"] }),
      ]),
  });
}

/** Deletes an unlinked event from Google Calendar, then rereads the Day so its row goes. */
export function useDeleteEvent(day: string) {
  const client = useQueryClient();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: (eventId: string) =>
      apiFetch("/api/evening-review", { method: "DELETE", body: { eventId } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["evening-review", day] }),
  });
}
