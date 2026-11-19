import { queryOptions, useQuery } from "@tanstack/react-query";

import { PillarBarsBody } from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";

/** The pillar bars for the 7 Days ending `end`; kept on the device so they show offline. */
const pillarsQuery = (end: string) =>
  queryOptions({
    queryKey: ["pillars", end],
    queryFn: ({ signal }) =>
      apiFetch(`/api/pillars?${new URLSearchParams({ end })}`, { signal }, PillarBarsBody),
    meta: { persist: true },
  });

export const usePillarBars = (end: string) => useQuery(pillarsQuery(end));
