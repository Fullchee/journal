import {
  queryOptions,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as z from "zod/mini";

import {
  PlanTask,
  Proposal,
  minuteOfDay,
  ZONES,
  blocksBody,
  torontoDay,
  type PoolPlan,
  type triageBody,
} from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError, isRetryable, type ApiErrorBody } from "@/lib/api/errors";

/** What GET /api/plan/tasks returns; `proposals` is null when the model is unreachable. */
const Proposals = z.record(z.string(), Proposal);

const PlanBody = z.object({
  zone: z.nullable(z.enum(ZONES)),
  reminders: z.string(),
  tasks: z.array(PlanTask),
  proposals: z.nullable(Proposals),
});

export type PlanBody = z.infer<typeof PlanBody>;

const NotConnected = z.object({ status: z.literal("not-connected") });

const Unreachable = z.object({ status: z.literal("unreachable") });

type CalendarFailure = z.infer<typeof NotConnected> | z.infer<typeof Unreachable>;

const Busy = z.object({ start: z.string(), end: z.string() });

const BusyBody = z.discriminatedUnion("status", [
  NotConnected,
  Unreachable,
  z.object({ status: z.literal("ok"), busy: z.array(Busy) }),
]);

export type BusyBody = z.infer<typeof BusyBody>;

export const BlocksResult = z.discriminatedUnion("status", [
  NotConnected,
  Unreachable,
  z.object({ status: z.literal("ok"), events: z.number(), tasks: z.number() }),
]);

export type BlocksResult = z.infer<typeof BlocksResult>;

/** Minutes after Toronto midnight, with each task's title. */
export interface SavedBlock {
  start: number;
  end: number;
  tasks: string[];
}

/** The plan last written to the calendar, kept so Today can show it offline. */
export interface SavedPlan {
  day: string;
  blocks: SavedBlock[];
}

const RETRY_DELAY_MS = 500;

// The screen has its own Try again, so one quick retry covers a blip and the error shows within a second.
const ONE_QUICK_RETRY = {
  retry: (failures: number, error: Error) => failures < 1 && isRetryable(error),
  retryDelay: RETRY_DELAY_MS,
};

/** Planning is online only, so tasks and busy times are fetched fresh on every visit and never stored. */
export const planTasksQuery = queryOptions({
  queryKey: ["plan", "tasks"],
  queryFn: ({ signal }) => apiFetch("/api/plan/tasks", { signal }, PlanBody),
  gcTime: 0,
  ...ONE_QUICK_RETRY,
});

export const busyQuery = (day: string) =>
  queryOptions({
    queryKey: ["plan", "busy", day],
    queryFn: ({ signal }) =>
      apiFetch(`/api/plan/busy?${new URLSearchParams({ day })}`, { signal }, BusyBody),
    gcTime: 0,
    ...ONE_QUICK_RETRY,
  });

/** Only the app writes it, so it never fetches. */
export const savedPlanQuery = queryOptions<SavedPlan>({
  queryKey: ["plan", "saved"],
  queryFn: skipToken,
  meta: { persist: true },
});

// Online-only writes fail at once instead of queueing like a capture.
const ONLINE_ONLY = { retry: false, networkMode: "always" } as const;

export function useTriage() {
  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: (body: ReturnType<typeof triageBody>) =>
      apiFetch("/api/plan/triage", { method: "POST", body }),
  });
}

const isCalendarFailure = (body: ApiErrorBody | null): body is CalendarFailure =>
  body?.status === "not-connected" || body?.status === "unreachable";

export const savedPlanOf = (day: string, pools: PoolPlan[]): SavedPlan => ({
  day,
  blocks: pools
    .flatMap((p) =>
      p.placed.map(({ start, end, block }) => ({
        start,
        end,
        tasks: block.tasks.map((t) => t.content),
      })),
    )
    .toSorted((a, b) => a.start - b.start),
});

interface WriteBlocks {
  day: string;
  pools: PoolPlan[];
}

// The server answers an unreachable calendar with a 502 that still names the failure.
async function writeBlocks({ day, pools }: WriteBlocks) {
  try {
    return await apiFetch(
      "/api/plan/blocks",
      { method: "POST", body: blocksBody(day, pools) },
      BlocksResult,
    );
  } catch (error) {
    if (error instanceof ApiError && isCalendarFailure(error.body)) return error.body;
    throw error;
  }
}

export function useWriteBlocks() {
  const client = useQueryClient();

  return useMutation({
    ...ONLINE_ONLY,
    mutationFn: writeBlocks,
    onSuccess: (result, { day, pools }) => {
      if (result.status === "ok")
        client.setQueryData(savedPlanQuery.queryKey, savedPlanOf(day, pools));
    },
  });
}

const NEXT_COUNT = 2;

/** `day` is set when the plan is for a later day (planned after 17:00), so Today can say so. */
export interface PlanNext {
  day: string | null;
  blocks: SavedBlock[];
}

/** The next blocks still to come; a plan for a past day shows nothing. */
export function planNextOf(saved: SavedPlan | undefined, now: Date): PlanNext {
  const today = torontoDay(now);

  if (!saved || saved.day < today) return { day: null, blocks: [] };

  if (saved.day > today) return { day: saved.day, blocks: saved.blocks.slice(0, NEXT_COUNT) };
  const minutes = minuteOfDay(now);

  return { day: null, blocks: saved.blocks.filter((b) => b.end > minutes).slice(0, NEXT_COUNT) };
}

/** What Today's PlanNext shows; it reads the stored plan, so it works offline. */
// eslint-disable-next-line react/purity -- what is next counts from this moment, so each render reads the clock
export function usePlanNext(now = new Date()) {
  const { data } = useQuery(savedPlanQuery);

  return planNextOf(data, now);
}
