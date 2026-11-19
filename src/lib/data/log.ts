import { LOG_FAILED, LogDraft, Logged, type LogItem, type NewOneOff } from "@/core";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError } from "@/lib/api/errors";
import { invalidateHabits } from "@/lib/data/habits";

// The server explains a refusal or a bad sentence in `{ error }`; anything else reads as a failed request.
const reasonOf = (error: ApiError | null) => error?.body?.error ?? LOG_FAILED;

/** Not a queued capture: the model's guess saves or opens a form now, which makes no sense hours later. */
export async function draftLog(text: string): Promise<LogDraft> {
  try {
    return await apiFetch("/api/log/draft", { method: "POST", body: { text } }, LogDraft);
  } catch (error) {
    return { type: "unclear", text: reasonOf(error instanceof ApiError ? error : null) };
  }
}

export interface SaveEntries {
  text: string;
  log: LogItem[];
}

/** Online only, like Habit edits: the form stays open with the reason when the save fails. */
export function useSaveEntries() {
  const client = useQueryClient();

  return useMutation({
    networkMode: "always",
    retry: false,
    mutationFn: (body: SaveEntries) =>
      apiFetch("/api/log/entries", { method: "POST", body }, Logged),
    onSuccess: () => invalidateHabits(client),
  });
}

export interface SaveOneOff {
  text: string;
  one_off: NewOneOff;
}

/** A One-off is saved as a log action, so Undo removes it like any log. */
export function useSaveOneOff() {
  const client = useQueryClient();

  return useMutation({
    networkMode: "always",
    retry: false,
    mutationFn: (body: SaveOneOff) =>
      apiFetch("/api/log/one-off", { method: "POST", body }, Logged),
    onSuccess: () => invalidateHabits(client),
  });
}

/** Reverses the log action a save answered; the server refuses a second Undo of the same one. */
export function useUndoLog() {
  const client = useQueryClient();

  return useMutation({
    networkMode: "always",
    retry: false,
    mutationFn: (action: number) => apiFetch(`/api/log/${action}/undo`, { method: "POST" }),
    onSuccess: () => invalidateHabits(client),
  });
}

const RECEIPT_KEY = ["log", "receipt"] as const;

/**
 * The Log box's latest Receipt, shared by every composer and the Check-in's "What were you doing?". It lives in the
 * query cache but never persists or refetches: it means nothing once the app restarts.
 */
export function useLogReceipt() {
  const client = useQueryClient();
  const { data = null } = useQuery<Logged | null>({ queryKey: RECEIPT_KEY, queryFn: skipToken });

  return {
    receipt: data,
    showReceipt: (logged: Logged | null) => client.setQueryData(RECEIPT_KEY, logged),
  };
}

export const logError = (error: Error) => reasonOf(error instanceof ApiError ? error : null);
