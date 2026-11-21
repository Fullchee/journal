import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod/mini";

import { apiFetch } from "@/lib/api/api-fetch";

/** The one field of a Work day that Today reads; the API sends the rest too. */
const AnchorRow = z.object({ anchor: z.string() });

const AnchorDays = z.object({ days: z.array(AnchorRow) });

type AnchorDays = z.infer<typeof AnchorDays>;

const anchorQuery = (day: string) =>
  queryOptions({
    queryKey: ["work", "days", day],
    queryFn: ({ signal }) =>
      apiFetch(`/api/work/days?${new URLSearchParams({ day })}`, { signal }, AnchorDays),
    meta: { persist: true },
  });

// A Day with no Work day row yet has no Anchor, the same as an empty one.
const anchorOf = ({ days }: AnchorDays) => days[0]?.anchor ?? "";

/** The Work day's Anchor; empty until `/close-day` or the owner sets one. */
export const useAnchor = (day: string) => useQuery({ ...anchorQuery(day), select: anchorOf });

/** Saves the Anchor on its Work day, adding the row when the Day has none. */
export function useSetAnchor() {
  const client = useQueryClient();

  return useMutation({
    // Online only: Today shows the error and keeps the draft, so nothing waits in a queue.
    retry: false,
    networkMode: "always",
    mutationFn: ({ day, anchor }: { day: string; anchor: string }) =>
      apiFetch("/api/work/days", { method: "POST", body: { rows: [{ day, anchor }] } }),
    onSuccess: (_saved, { day, anchor }) =>
      client.setQueryData(anchorQuery(day).queryKey, { days: [{ anchor }] }),
  });
}
