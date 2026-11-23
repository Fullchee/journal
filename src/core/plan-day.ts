import * as z from "zod/mini";

import { dayOfWeek, daysBetween, minuteOfDay, shiftDay, torontoDay } from "./calendar";

// The only Todoist project whose tasks are Job work (09:00-17:00 on weekdays).
const JOB_PROJECT = "6h9ggGQqPMhPGGJJ";

// A block is one sitting; a longer task still gets a block of its own.
const BLOCK_CAP = 90;

// Before this hour the plan targets today, from it tomorrow.
const EVENING_HOUR = 17;

const MINUTES_PER_DAY = 1440;
const LUNCH: Span = { start: 720, end: 780 };

export const PlanTask = z.object({
  id: z.string(),
  content: z.string(),
  projectId: z.string(),
  sectionId: z.nullable(z.string()),
  /** Todoist's scale: 4 is p1 (highest), 1 is p4. */
  priority: z.number(),
  dueDate: z.nullable(z.string()),
  labels: z.array(z.string()),
  /** A Todoist task, or a Plan action from the planned Work day's Plan, which lives only in D1. */
  source: z.enum(["todoist", "work-plan"]),
});

export type PlanTask = z.infer<typeof PlanTask>;

/** A pending Plan action with its Ticket's title, as D1 holds them. */
export interface PlanActionRow {
  id: string;
  kind: string;
  ticket: string | null;
  pr: string | null;
  url: string | null;
  title: string | null;
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function planActionName({ kind, ticket, pr, url, title }: PlanActionRow) {
  const prLink = pr !== null && url !== null ? `[${pr}](${url})` : pr;
  const head = [capitalize(kind), prLink].filter(Boolean).join(" ");
  const ticketName = [ticket, title].filter(Boolean).join(" ");

  return ticketName === "" ? head : `${head}: ${ticketName}`;
}

/** A Plan action as a job task; its shared section packs the Plan into blocks of its own. */
export const planActionTask = (action: PlanActionRow, day: string): PlanTask => ({
  id: action.id,
  content: planActionName(action),
  projectId: JOB_PROJECT,
  sectionId: "work-plan",
  priority: 4,
  dueDate: day,
  labels: [],
  source: "work-plan",
});

export const Disposition = z.enum(["keep", "postpone", "drop"]);

export type Disposition = z.infer<typeof Disposition>;

export const Proposal = z.object({
  disposition: Disposition,
  reason: z.string(),
  minutes: z.number(),
});

export type Proposal = z.infer<typeof Proposal>;

export type Pool = "personal" | "job";

/** Minutes after local midnight. */
export interface Span {
  start: number;
  end: number;
}

const POOLS: Record<Pool, Span> = {
  personal: { start: 420, end: 1320 },
  job: { start: 540, end: 1020 },
};

export interface SizedTask {
  id: string;
  content: string;
  projectId: string;
  sectionId: string | null;
  /** Todoist's scale: 4 is p1 (highest). */
  priority: number;
  dueDate: string | null;
  minutes: number;
  source: PlanTask["source"];
}

export interface Block {
  tasks: SizedTask[];
  minutes: number;
}

export type Placed = Span & { block: Block };

export function targetDay(now: Date) {
  const today = torontoDay(now);

  return minuteOfDay(now) < EVENING_HOUR * 60 ? today : shiftDay(today, 1);
}

const isWeekend = (day: string) => [0, 6].includes(dayOfWeek(day));

/** Whether `now` falls in the job Pool's hours on a weekday, Toronto time. */
export function isJobHours(now: Date) {
  const minute = minuteOfDay(now);

  return !isWeekend(torontoDay(now)) && minute >= POOLS.job.start && minute < POOLS.job.end;
}

export const poolOf = (task: Pick<SizedTask, "projectId">): Pool =>
  task.projectId === JOB_PROJECT ? "job" : "personal";

/** Busy instants as Toronto minutes on `day`, clipped to it; an all-day event spans 0-1440. */
export function busySpans(busy: { start: string; end: string }[], day: string): Span[] {
  const minutes = (iso: string) =>
    daysBetween(day, torontoDay(iso)) * MINUTES_PER_DAY + minuteOfDay(iso);

  return busy
    .flatMap(({ start, end }) => {
      const span = {
        start: Math.max(0, minutes(start)),
        end: Math.min(MINUTES_PER_DAY, minutes(end)),
      };

      return span.end > span.start ? span : [];
    })
    .toSorted((a, b) => a.start - b.start);
}

const subtract = (windows: Span[], cut: Span): Span[] =>
  windows.flatMap((w) => {
    if (cut.end <= w.start || cut.start >= w.end) return [w];

    return [
      { start: w.start, end: Math.min(w.end, cut.start) },
      { start: Math.max(w.start, cut.end), end: w.end },
    ].filter((part) => part.end > part.start);
  });

export function freeWindows(pool: Pool, day: string, busy: Span[]) {
  return pool === "job" && isWeekend(day)
    ? []
    : [LUNCH, ...busy].reduce((windows, cut) => subtract(windows, cut), [POOLS[pool]]);
}

// Earliest due first (no date last), then highest priority.
function byUrgency(a: SizedTask, b: SizedTask) {
  const byDue = (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");

  return byDue === 0 ? b.priority - a.priority : byDue;
}

/** One section at a time, each filled in urgency order up to the cap; sections follow their earliest task. */
export function packBlocks(tasks: SizedTask[]): Block[] {
  // Hermes has no Map.groupBy; a Map keeps sections in the order their first task appears.
  const sections = new Map<string | null, SizedTask[]>();

  for (const t of tasks.toSorted(byUrgency))
    sections.set(t.sectionId, [...(sections.get(t.sectionId) ?? []), t]);

  return [...sections].flatMap(([, section]) =>
    section.reduce<Block[]>((blocks, t) => {
      const last = blocks.at(-1);

      if (last && last.minutes + t.minutes <= BLOCK_CAP) {
        last.tasks.push(t);
        last.minutes += t.minutes;

        return blocks;
      }

      blocks.push({ tasks: [t], minutes: t.minutes });

      return blocks;
    }, []),
  );
}

/** Each block goes to the first window with room for all of it; the rest are overflow. */
export function fitBlocks(blocks: Block[], windows: Span[]) {
  const slots = windows.map((w) => ({ cursor: w.start, end: w.end }));
  const placed: Placed[] = [];
  const unplaced: Block[] = [];

  for (const block of blocks) {
    const slot = slots.find((s) => s.cursor + block.minutes <= s.end);

    if (slot === undefined) {
      unplaced.push(block);
      continue;
    }

    const start = slot.cursor;

    slot.cursor = start + block.minutes;
    placed.push({ block, start, end: start + block.minutes });
  }

  return { placed, unplaced, over: unplaced.reduce((sum, b) => sum + b.minutes, 0) };
}
