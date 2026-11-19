import { formatDay } from "@/core";

import type { CodeReview, PlansBody, WeeklyNote, WorkEntry } from "@/lib/data/work";

/** An entry with the link its Ticket or PR opens, and the entries nested under it. */
export interface EntryNode {
  entry: WorkEntry;
  name: string | null;
  title: string;
  url?: string;
  children: EntryNode[];
}

/** A Work day's entries as a tree, or the week's entries that name no day (`day` null), and its Code reviews. */
export interface WorkWeekDay {
  day: string | null;
  heading: string;
  entries: EntryNode[];
  reviews: (CodeReview & { url?: string })[];
}

// A row whose Ticket or PR the note never linked has no URL; it still shows, without opening anything.
function link(urls: Map<string, string>, key: string | null) {
  const url = key === null ? undefined : urls.get(key);

  return url === undefined || url === "" ? {} : { url };
}

/** Nests each entry under its parent when the parent sits in the same group; otherwise it starts a branch. */
function tree(entries: WorkEntry[], note: WeeklyNote, urls: Map<string, string>): EntryNode[] {
  const titles = new Map(note.tickets.map(({ key, title }) => [key, title]));

  const nodes = new Map(
    entries.map((entry) => {
      const name = entry.pr ?? entry.ticket;

      // A bare Ticket bullet has no words of its own, so it shows the Ticket's title.
      const title =
        entry.text === "" && entry.ticket !== null ? (titles.get(entry.ticket) ?? "") : entry.text;

      const node: EntryNode = { entry, name, title, ...link(urls, name), children: [] };

      return [entry.position, node];
    }),
  );

  const roots: EntryNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.entry.parent === null ? undefined : nodes.get(node.entry.parent);

    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }

  return roots;
}

const headingOf = (day: string | null) =>
  day === null ? "This week" : formatDay(day, { weekday: "short", month: "short", day: "numeric" });

/**
 * The week's entries that name no day first, under "This week", then each Work day that holds something, in order.
 * Personal lines stay out: the Work week shows work.
 */
export function workWeekDays(note: WeeklyNote): WorkWeekDay[] {
  const entries = note.entries.filter(({ kind }) => kind !== "personal");

  const urls = new Map([
    ...note.tickets.map(({ key, url }) => [key, url] as const),
    ...note.pull_requests.map(({ ref, url }) => [ref, url] as const),
  ]);

  // "" stands for no day, so the week's undated entries sort first.
  const keys = [...new Set([...entries, ...note.code_reviews].map(({ day }) => day ?? ""))];
  const days = keys.toSorted((a, b) => a.localeCompare(b)).map((key) => (key === "" ? null : key));

  return days.map((day) => ({
    day,
    heading: headingOf(day),
    entries: tree(
      entries.filter((entry) => entry.day === day),
      note,
      urls,
    ),
    reviews: note.code_reviews
      .filter((review) => review.day === day)
      .map((review) => ({ ...review, ...link(urls, review.pr) })),
  }));
}

/** How many scored Plans the trend shows: one week's strip, like the Habit tracker. */
const TREND_LENGTH = 7;

export interface ScoredPlan {
  day: string;
  hitRate: number;
}

/** The latest scored Plans, oldest first; an unscored Plan (any action pending) has no Hit rate yet. */
export const hitRateTrend = ({ plans }: PlansBody): ScoredPlan[] =>
  plans
    .flatMap(({ day, hit_rate }) => (hit_rate === null ? [] : { day, hitRate: hit_rate }))
    .toSorted((a, b) => b.day.localeCompare(a.day))
    .slice(0, TREND_LENGTH)
    .toReversed();

export const percent = (rate: number) => `${Math.round(rate * 100)}%`;
