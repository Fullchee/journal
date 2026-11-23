import { clockLabel, formatMinutes, shiftDay } from "./calendar";
import {
  fitBlocks,
  freeWindows,
  packBlocks,
  poolOf,
  type Disposition,
  type Placed,
  type Pool,
  type PlanTask,
  type Proposal,
  type SizedTask,
  type Span,
  type Block,
} from "./plan-day";

export type Choices = Record<string, Disposition>;

/** Without the model's suggestions every task starts on keep. */
export const initialChoices = (
  tasks: PlanTask[],
  proposals: Record<string, Proposal> | null,
): Choices =>
  Object.fromEntries(tasks.map((t) => [t.id, proposals?.[t.id]?.disposition ?? "keep"]));

// Todoist task names allow inline Markdown only: bold, italic, strikethrough, code and links.
// Each pattern captures the words to keep in group 1.
const INLINE_MARKDOWN = [
  /\[([^[\]]*)\]\([^()]*\)/g,
  /\*\*([^*]+)\*\*/g,
  /__([^_]+)__/g,
  /\*([^\s*][^*]*)\*/g,
  /\b_([^\s_][^_]*)_\b/g,
  /~~([^~]+)~~/g,
  /`([^`]*)`/g,
];

/** A task name without its Markdown, for places that show one line of plain text. */
export const plainTaskName = (content: string) =>
  INLINE_MARKDOWN.reduce(
    (text, pattern) => text.replace(pattern, (_match, words: string) => words),
    content,
  );

/** Postponed tasks move to the day after the target. */
export const triageBody = (choices: Choices, target: string) => ({
  postpone: Object.keys(choices).filter((id) => choices[id] === "postpone"),
  drop: Object.keys(choices).filter((id) => choices[id] === "drop"),
  postponeTo: shiftDay(target, 1),
});

export const survivors = (tasks: PlanTask[], choices: Choices) =>
  tasks.filter((t) => choices[t.id] === "keep");

export const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  const parts: string[] = [];

  if (hours !== 0) parts.push(`${hours}h`);

  if (rest !== 0 || hours === 0) parts.push(`${rest}m`);

  return parts.join("");
};

const CALENDAR_MESSAGES = {
  "not-connected":
    "Google Calendar isn't connected. Reconnect it (#85) to time-block; busy times can't be read until then.",
  unreachable: "Google Calendar didn't answer. Try again in a moment.",
};

export const calendarMessage = (status: keyof typeof CALENDAR_MESSAGES) =>
  CALENDAR_MESSAGES[status];

export interface PoolPlan {
  pool: Pool;
  placed: Placed[];
  unplaced: Block[];
  over: number;
}

/** Each pool's survivors packed into blocks and fitted into that pool's free time. */
export function planPools(tasks: SizedTask[], busy: Span[], day: string): PoolPlan[] {
  return (["personal", "job"] as const).map((pool) => {
    const blocks = packBlocks(tasks.filter((t) => poolOf(t) === pool));

    const { placed, unplaced, over } = fitBlocks(blocks, freeWindows(pool, day, busy));

    return { pool, placed, unplaced, over };
  });
}

/** The write for gate 2: one calendar block per placed block; only Todoist tasks get a time. */
export const blocksBody = (day: string, pools: PoolPlan[]) => ({
  day,
  blocks: pools.flatMap((p) =>
    p.placed.map(({ block, start, end }) => ({
      label: `${clockLabel(formatMinutes(start))}–${clockLabel(formatMinutes(end))} block`,
      start,
      end,
      taskIds: block.tasks.flatMap((t) => (t.source === "todoist" ? t.id : [])),
      description: block.tasks.map((t) => `- ${plainTaskName(t.content)}`).join("\n"),
    })),
  ),
});

const DEFAULT_MINUTES = 30;

// A cleared field reads as 0 and a half-typed one as NaN; neither is an estimate.
const estimateOrDefault = (estimate: number | undefined) =>
  estimate === undefined || estimate === 0 || Number.isNaN(estimate) ? DEFAULT_MINUTES : estimate;

/** Attaches each task's estimate; a blank or invalid field counts as the default. */
export const sizeTasks = (
  tasks: PlanTask[],
  minutes: Record<string, number | undefined>,
): SizedTask[] =>
  tasks.map((t) => ({
    id: t.id,
    content: t.content,
    projectId: t.projectId,
    sectionId: t.sectionId,
    priority: t.priority,
    dueDate: t.dueDate,
    minutes: estimateOrDefault(minutes[t.id]),
    source: t.source,
  }));
