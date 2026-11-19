// A vault weekly note becomes typed Work entries (#155): from 2026-W39 its Ticket, PR and Code review bullets parse,
// and a one-off extraction types every other line. A line neither covers is kept as a note and reported as left over.

import * as z from "zod/mini";

import {
  addLinks,
  type CodeReview,
  emptyLinks,
  type EntryFields,
  type Links,
  parseWeekLines,
  type ParsedLine,
  type WeeklyNote,
  type WorkEntry,
  WorkEntryKind,
} from "./weekly-note";

const FULL_FROM = "2026-W39";

const TicketKey = z.string().check(z.regex(/^[A-Z][A-Z\d]*-\d+$/u));

const PrRef = z.string().check(z.regex(/^[\w.-]+#\d+$/u));

/**
 * One line typed by the extraction. `source` is the line exactly as the note holds it, so an edit above it can't
 * shift it onto another line; `text` is the line's words without its bullet, checkbox, status mark or the links
 * moved into `ticket` and `pr`.
 */
const IsoDay = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/u));

/** A field the extraction may leave out or set to null. */
const unset = <Field extends z.ZodMiniType>(field: Field) => z.optional(z.nullable(field));

const ExtractedEntry = z.object({
  source: z.string(),
  day: z.nullable(IsoDay),
  kind: WorkEntryKind,
  text: z.string().check(z.minLength(1)),
  ticket: unset(TicketKey),
  pr: unset(PrRef),
  done: unset(z.boolean()),
});

/** A note's extraction: an entry per line, and `skip` for lines that only name a day or a section. */
const Lines = z.array(z.string());

export const NoteExtraction = z.object({
  skip: z.optional(Lines),
  entries: z.array(ExtractedEntry),
});

export type NoteExtraction = z.infer<typeof NoteExtraction>;

/** Lines that carry no entry: headings, rules, wiki-link navigation, a week's date range, bold labels and empty bullets. */
const STRUCTURAL = [
  /^#{1,6} /u,
  /^-{3,}$/u,
  /^(?:\[\[[^\]]+\]\][\s|]*)+$/u,
  /^\**[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} -> [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}\**$/u,
  /^\*\*[^*]+\*\*:?$/u,
  /^\s*(?:[-*+]|\d+\.)(?: \[[ x]?\])?$/iu,
];

const isStructural = (line: string) => STRUCTURAL.some((pattern) => pattern.test(line));

const CHECKBOX = /^\s*(?:[-*+]|\d+\.) \[([ x])\]/iu;

/**
 * A ticked box is done. An open box is not done only from 2026-W39, where Plans are scored (the extraction may
 * mark one done from plan-log); before that nothing ever closed the boxes, so the note never says.
 */
function doneOf(week: string, line: string, extracted: boolean | null) {
  const box = CHECKBOX.exec(line)?.[1];

  if (box === undefined) return extracted;

  if (box !== " ") return true;

  return week < FULL_FROM ? null : (extracted ?? false);
}

/** A left-over line's words: the line without its indent, bullet and checkbox. */
const plainText = (line: string) =>
  line.replace(/^\s*(?:(?:[-*+]|\d+\.)\s+)?(?:\[[ x]\]\s*)?/iu, "");

/** Tabs count as one four-space level, as Obsidian draws them. */
const indentOf = (line: string) => line.replaceAll("\t", " ".repeat(4)).search(/\S/u);

/** Claims, for each item in order, the first unclaimed line equal to its source, searching on from the last claim. */
function claimLines<Item>(
  lines: readonly string[],
  taken: Set<number>,
  items: readonly Item[],
  sourceOf: (item: Item) => string,
) {
  const claimed = new Map<number, Item>();
  const stale: Item[] = [];
  let from = 0;

  for (const item of items) {
    const source = sourceOf(item).trimEnd();
    const start = from;
    const free = (index: number) => !taken.has(index) && lines[index] === source;
    const after = lines.findIndex((_, index) => index >= start && free(index));
    const index = after === -1 ? lines.findIndex((_, at) => free(at)) : after;

    if (index === -1) {
      stale.push(item);
    } else {
      taken.add(index);
      claimed.set(index, item);
      from = index + 1;
    }
  }

  return { claimed, stale };
}

/** Each entry's parent: the nearest line above it indented less, when that line is an entry. */
function withParents(lines: readonly string[], fields: Map<number, EntryFields>): WorkEntry[] {
  const positions = new Map(
    [...fields.keys()].toSorted((a, b) => a - b).map((line, at) => [line, at]),
  );

  const open: { indent: number; position: number | null }[] = [];
  const entries: WorkEntry[] = [];

  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") continue;
    const indent = indentOf(line);

    while ((open.at(-1)?.indent ?? -1) >= indent) open.pop();
    const position = positions.get(index) ?? null;
    const entry = fields.get(index);

    if (entry !== undefined && position !== null) {
      entries.push({ ...entry, position, parent: open.at(-1)?.position ?? null });
    }

    open.push({ indent, position });
  }

  return entries;
}

type ExtractedEntry = z.infer<typeof ExtractedEntry>;

/** An extracted line's fields; a Ticket the note never links gets a bare row. */
function extractedFields(week: string, line: string, links: Links, extracted: ExtractedEntry) {
  const { source: _, ticket = null, pr = null, done = null, ...entry } = extracted;

  if (pr !== null && !links.pullRequests.has(pr)) throw new Error(`${week} never links ${pr}`);

  if (ticket !== null && !links.tickets.has(ticket)) {
    links.tickets.set(ticket, { key: ticket, url: "" });
  }

  return { ...entry, ticket, pr, done: doneOf(week, line, done) };
}

/** A line nothing typed: kept as a note on the day its heading names. */
const leftoverFields = (week: string, line: string, day: string | null): EntryFields => ({
  day,
  kind: "note",
  text: plainText(line),
  ticket: null,
  pr: null,
  done: doneOf(week, line, null),
});

/** Numbers each Code review from 0 within its day. */
const numbered = (reviews: Omit<CodeReview, "position">[]) =>
  reviews.map((review, index) => ({
    ...review,
    position: reviews.slice(0, index).filter(({ day }) => day === review.day).length,
  }));

/**
 * Turns a weekly note and its extraction into rows. Returns the lines no parse, extraction or `skip` covered
 * (each kept as a note entry) and the extracted lines the note no longer holds.
 * Throws on a `####` heading that names no day of `week`, or on an extracted PR the note never links.
 */
export function parseWeeklyNote(week: string, md: string, extraction: NoteExtraction) {
  const lines = md.split("\n").map((line) => line.trimEnd());
  const links = emptyLinks();

  const { parsed, days } =
    week < FULL_FROM
      ? { parsed: new Map<number, ParsedLine>(), days: [] }
      : parseWeekLines(week, lines, links);

  addLinks(links, md);
  const taken = new Set(parsed.keys());
  const extracted = claimLines(lines, taken, extraction.entries, ({ source }) => source);
  const skipped = claimLines(lines, taken, extraction.skip ?? [], (source) => source);
  const stale = [...extracted.stale.map(({ source }) => source), ...skipped.stale];
  const fields = new Map<number, EntryFields>();
  const reviews: Omit<CodeReview, "position">[] = [];

  for (const [index, line] of parsed) {
    if ("entry" in line) fields.set(index, line.entry);
    else reviews.push(line.review);
  }

  for (const [index, entry] of extracted.claimed) {
    fields.set(index, extractedFields(week, String(lines[index]), links, entry));
  }

  const left = [...lines.entries()].filter(
    ([index, line]) => line.trim() !== "" && !taken.has(index) && !isStructural(line),
  );

  for (const [index, line] of left)
    fields.set(index, leftoverFields(week, line, days[index] ?? null));

  const note: WeeklyNote = {
    week,
    raw_md: md,
    entries: withParents(lines, fields),
    code_reviews: numbered(reviews),
    tickets: [...links.tickets.values()],
    pull_requests: [...links.pullRequests.values()],
  };

  return {
    note,
    leftovers: left.map(([index, line]) => `${week}:${index + 1} ${line}`),
    stale: stale.map((source) => `${week}: no line "${source}"`),
  };
}
