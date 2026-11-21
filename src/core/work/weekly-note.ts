// Weekly notes from the work-log vault (#152, #155). From 2026-W39 a note's Ticket, PR and Code review bullets follow
// a fixed format, so they parse here; every other line is typed by a one-off extraction (`vault-note.ts`).

import * as z from "zod/mini";

import { formatDay } from "@/core/calendar";
import { weekDays } from "@/core/weekly-review";

/** 🟣 merged, 🟢 open, ⚪ draft, 🟡 work in progress before review, ❌ closed unmerged. */
const PR_EMOJI = [
  ["merged", "🟣"],
  ["open", "🟢"],
  ["draft", "⚪"],
  ["wip", "🟡"],
  ["closed", "❌"],
] as const;

const PrState = z.enum(PR_EMOJI.map(([state]) => state));

type PrState = z.infer<typeof PrState>;

const prStateOf = new Map<string, PrState>(PR_EMOJI.map(([state, emoji]) => [emoji, state]));

/**
 * What a Work entry records: a task (finished when `done`), a blocker, a meeting, a Code review, a plain note, or a
 * personal line (health, habits, feelings) the Work view leaves out.
 */
export const WorkEntryKind = z.enum(["task", "blocker", "meeting", "review", "note", "personal"]);

export type WorkEntryKind = z.infer<typeof WorkEntryKind>;

export interface WorkTicket {
  key: string;
  url: string;
  title?: string | undefined;
}

export interface PullRequest {
  ref: string;
  repo: string;
  number: number;
  url: string;
  title?: string | undefined;
  ticket?: string | null | undefined;
  state?: PrState | null | undefined;
}

/**
 * One typed bullet of a weekly note, in `position` order. `day` is null when the note names no day for it;
 * `parent` is the position of the entry it nests under. `done` is true for finished work, false only for an open
 * box from 2026-W39 on, and null when the note never says.
 */
export interface WorkEntry {
  day: string | null;
  position: number;
  parent: number | null;
  kind: WorkEntryKind;
  text: string;
  ticket: string | null;
  pr: string | null;
  done: boolean | null;
}

export interface CodeReview {
  day: string;
  pr: string;
  position: number;
  author: string;
  title: string;
}

/** A weekly note as rows. `raw_md` archives the file as written; the app and API read the entries. */
export interface WeeklyNote {
  week: string;
  raw_md: string;
  entries: WorkEntry[];
  code_reviews: CodeReview[];
  tickets: WorkTicket[];
  pull_requests: PullRequest[];
}

/** The rows a note collects as it parses, keyed so a later mention updates the earlier one. */
export interface Links {
  tickets: Map<string, WorkTicket>;
  pullRequests: Map<string, PullRequest>;
}

const JIRA_LINK = /https:\/\/[\w.-]+\/browse\/([A-Z][A-Z\d]*-\d+)/gu;

const PR_LINK = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/gu;

/** The vault drops the owner from a repo's name: `Acme/acme-web`'s PRs are `web#N`. */
function prRef(owner: string, name: string, number: string) {
  const prefix = `${owner.toLowerCase()}-`;
  const repo = name.toLowerCase().startsWith(prefix) ? name.slice(prefix.length) : name;

  return `${repo}#${number}`;
}

function pullRequestAt(url: string, owner: string, name: string, number: string): PullRequest {
  const ref = prRef(owner, name, number);

  return { ref, repo: ref.slice(0, ref.indexOf("#")), number: Number(number), url };
}

export const emptyLinks = (): Links => ({ tickets: new Map(), pullRequests: new Map() });

/** Adds a bare row for every Jira and PR link in `md` not yet collected. */
export function addLinks(links: Links, md: string) {
  for (const [url, group] of md.matchAll(JIRA_LINK)) {
    const key = String(group);

    if (!links.tickets.has(key)) links.tickets.set(key, { key, url });
  }

  for (const [url, owner, name, number] of md.matchAll(PR_LINK)) {
    const pr = pullRequestAt(url, String(owner), String(name), String(number));

    if (!links.pullRequests.has(pr.ref)) links.pullRequests.set(pr.ref, pr);
  }
}

const TICKET_LINE =
  /^- (?:✅ )?\[([A-Z][A-Z\d]*-\d+)\]\((https:\/\/[\w.-]+\/browse\/\1)\)(?:: (.+))?$/u;

const PR_LINE =
  /^( {4})?- (\S+) \[([\w.-]+#\d+)\]\((https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+))\)(?:: (.+))?$/u;

const REVIEW_LINE =
  /^- \[([\w.-]+#\d+)\]\((https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+))\) \(([^)]+)\): (.+)$/u;

/** A link's PR when its text is the ref its URL names and no earlier mention gave that ref another URL. */
function knownPullRequest(links: Links, text: string, pr: PullRequest) {
  const known = links.pullRequests.get(pr.ref);

  if (pr.ref !== text || (known !== undefined && known.url !== pr.url)) return null;

  return known ?? pr;
}

/** A parsed entry before its position and parent are known. */
export type EntryFields = Omit<WorkEntry, "position" | "parent">;

/** What the parser makes of one line: an entry, or a Code review. */
export type ParsedLine = { entry: EntryFields } | { review: Omit<CodeReview, "position"> };

function ticketEntry(links: Links, day: string, line: string): EntryFields | null {
  const match = TICKET_LINE.exec(line);

  if (!match) return null;
  const [, keyGroup, urlGroup, title = ""] = match;
  const [key, url] = [String(keyGroup), String(urlGroup)];
  const known = links.tickets.get(key);

  if (known !== undefined && known.url !== url) return null;
  links.tickets.set(key, { key, url, title });

  return { day, kind: "task", text: title, ticket: key, pr: null, done: true };
}

/** A PR bullet: at the top level when `ticket` is null, else nested one level under that Ticket's bullet. */
function prEntry(
  links: Links,
  day: string,
  line: string,
  ticket: string | null,
): EntryFields | null {
  const match = PR_LINE.exec(line);

  if (!match) return null;
  const [, indent, emoji, text, url, owner, name, number, title = ""] = match;
  const state = prStateOf.get(String(emoji));

  const pr = knownPullRequest(
    links,
    String(text),
    pullRequestAt(String(url), String(owner), String(name), String(number)),
  );

  if (state === undefined || pr === null || (indent !== undefined) !== (ticket !== null)) {
    return null;
  }

  links.pullRequests.set(pr.ref, { ...pr, title, ticket, state });

  return { day, kind: "task", text: title, ticket, pr: pr.ref, done: true };
}

function reviewOf(links: Links, day: string, line: string, seen: Set<string>) {
  const match = REVIEW_LINE.exec(line);

  if (!match) return null;

  const [text, url, owner, name, number, author, title] = match.slice(1).map(String);

  const pr = knownPullRequest(
    links,
    String(text),
    pullRequestAt(String(url), String(owner), String(name), String(number)),
  );

  if (pr === null || seen.has(`${day} ${pr.ref}`)) return null;
  seen.add(`${day} ${pr.ref}`);
  links.pullRequests.set(pr.ref, { ...pr, title: String(title) });

  return { day, pr: pr.ref, author: String(author), title: String(title) };
}

type Section = "items" | "reviews" | "other";

function sectionOf(line: string): Section | null {
  if (line === "**Code reviews**") return "reviews";

  return line === "**Meetings**" || /^\*\*Plan\b.*\*\*$/u.test(line) ? "other" : null;
}

/** The section each line sits in: a day's bullets, its Code reviews, or a Meetings or Plan section. */
function lineSections(lines: readonly string[]) {
  let section: Section = "items";

  return lines.map((line) => {
    if (line.startsWith("#### ")) section = "items";
    section = sectionOf(line) ?? section;

    return section;
  });
}

/** Parses a day's bullets in order; a PR bullet nests only under the Ticket bullet above it. */
function itemParser(links: Links) {
  let ticket: string | null = null;

  return (day: string, line: string) => {
    if (!/^\S/u.test(line)) return ticket === null ? null : prEntry(links, day, line, ticket);
    const entry = ticketEntry(links, day, line) ?? prEntry(links, day, line, null);
    ticket = entry?.pr === null ? entry.ticket : null;

    return entry;
  };
}

const HEADING = /^#### ([A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2})(?!\d)/u;

/** "Tue, Nov 3", the label a `####` heading starts with. */
export const headingLabel = (day: string) =>
  formatDay(day, { weekday: "short", month: "short", day: "numeric" });

/** The Day each line sits under: its `####` heading's, until a `---` or a higher heading ends the days. */
function lineDays(week: string, lines: readonly string[]) {
  const dayOf = new Map(weekDays(week).map((day) => [headingLabel(day), day]));
  const seen = new Set<string>();
  let current: string | null = null;

  return lines.map((line) => {
    const match = HEADING.exec(line);

    if (match) {
      const day = dayOf.get(String(match[1]));

      if (day === undefined) throw new Error(`${week} has no day for "${line}"`);

      if (seen.has(day)) throw new Error(`${week} has two headings for ${day}`);
      seen.add(day);
      current = day;
    } else if (/^(?:---|#{1,3} )/u.test(line)) {
      current = null;
    }

    return current;
  });
}

/**
 * Parses the Ticket, PR and Code review bullets of a `#### Ddd, Mon D` note (2026-W39 on), by line index.
 * A line parses only when it matches its format exactly; every other line is left for the extraction.
 * A Ticket or PR bullet in a day's log records work done that day, so it is a done task.
 * Throws on a heading that names no day of `week`, or names one twice.
 */
export function parseWeekLines(week: string, lines: readonly string[], links: Links) {
  const parsed = new Map<number, ParsedLine>();
  const days = lineDays(week, lines);
  const sections = lineSections(lines);
  const reviewed = new Set<string>();
  const itemOf = itemParser(links);

  for (const [index, line] of lines.entries()) {
    const day = days[index] ?? null;

    if (day === null || line === "") continue;

    if (sections[index] === "reviews") {
      const review = reviewOf(links, day, line, reviewed);

      if (review) parsed.set(index, { review });
    } else if (sections[index] === "items") {
      const entry = itemOf(day, line);

      if (entry) parsed.set(index, { entry });
    }
  }

  return { parsed, days };
}
