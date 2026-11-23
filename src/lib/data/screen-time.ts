import { queryOptions, useQuery } from "@tanstack/react-query";
import * as z from "zod/mini";

import { apiFetch } from "@/lib/api/api-fetch";

const ScreenTimeDay = z.object({ day: z.string(), minutes: z.number() });

const ScreenTimeBody = z.object({ days: z.array(ScreenTimeDay) });

/** Each Day's screen-on minutes from `from` on, summed across devices; kept on the device so it shows offline. */
const screenTimeQuery = (from: string) =>
  queryOptions({
    queryKey: ["screen-time", from],
    queryFn: ({ signal }) =>
      apiFetch(`/api/screen-time?${new URLSearchParams({ from })}`, { signal }, ScreenTimeBody),
    meta: { persist: true },
  });

export const useScreenTime = (from: string) => useQuery(screenTimeQuery(from));
