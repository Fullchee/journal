import {
  type CodeReview,
  isoWeekOf,
  NoteExtraction,
  parseWeeklyNote,
  type PullRequest,
  weekDays,
  type WeeklyNote,
  type WorkEntry,
  type WorkTicket,
} from "@/core";
import { authorizedBody, authorizeWriter } from "@worker/lib/auth";
import type { D1, PagesContext } from "@worker/lib/env";
import { json } from "@worker/lib/json";
import { IsoWeek, upsertRow, workRows } from "@worker/lib/work-store";
import * as z from "zod/mini";

/** A vault weekly note as text, with its extraction; the Worker parses it, so the vault's sync posts the file as it is. */
const NoteText = z.object({
  week: IsoWeek,
  md: z.string(),
  extraction: z.optional(NoteExtraction),
});

type NoteText = z.infer<typeof NoteText>;

/** The first and last Day of an ISO week. */
function weekRange(week: string) {
  const days = weekDays(week);

  return [days[0], days.at(-1)].map(String);
}

/** Parses every note first: one whose heading names a day outside its week, or that names an unlinked PR, fails the whole post. */
function parsedNotes(rows: NoteText[]) {
  try {
    return rows.map(({ week, md, extraction = { entries: [] } }) =>
      parseWeeklyNote(week, md, extraction),
    );
  } catch {
    return null;
  }
}

/** A note never replaces a Ticket's stored title: the tickets route holds the titles from Jira. */
const ticketStatement = (db: D1, { key, url, title = "" }: WorkTicket) =>
  db
    .prepare(
      `INSERT INTO tickets (key, url, title) VALUES (?, ?, ?)
        ON CONFLICT (key) DO UPDATE SET
          url = CASE excluded.url WHEN '' THEN tickets.url ELSE excluded.url END,
          title = CASE tickets.title WHEN '' THEN excluded.title ELSE tickets.title END`,
    )
    .bind(key, url, title);

const entryStatement = (db: D1, week: string, entry: WorkEntry) =>
  db
    .prepare(
      `INSERT INTO work_entries (week, position, parent_id, day, kind, text, ticket, pr, done)
        VALUES (?, ?, (SELECT id FROM work_entries WHERE week = ? AND position = ?), ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      week,
      entry.position,
      week,
      entry.parent,
      entry.day,
      entry.kind,
      entry.text,
      entry.ticket,
      entry.pr,
      entry.done === null ? null : Number(entry.done),
    );

/**
 * Replaces the week's entries and Code reviews in one batch, so a line dropped from the note leaves D1 too.
 * A Code review's Day needs a Work day row.
 * Tickets and PRs are upserted, never deleted: other weeks and Plans name them.
 */
function noteStatements(db: D1, note: WeeklyNote) {
  const { week, raw_md } = note;

  return [
    upsertRow(db, "work_weeks", ["week"], { week, raw_md }),
    ...note.tickets.map((ticket) => ticketStatement(db, ticket)),
    ...note.pull_requests.map((pr) => upsertRow(db, "pull_requests", ["ref"], { ...pr })),
    db.prepare("DELETE FROM work_entries WHERE week = ?").bind(week),
    db.prepare("DELETE FROM code_reviews WHERE day BETWEEN ? AND ?").bind(...weekRange(week)),
    ...note.entries.map((entry) => entryStatement(db, week, entry)),
    ...[...new Set(note.code_reviews.map(({ day }) => day))].map((day) =>
      db.prepare("INSERT INTO work_days (day) VALUES (?) ON CONFLICT DO NOTHING").bind(day),
    ),
    ...note.code_reviews.map((review) =>
      upsertRow(db, "code_reviews", ["day", "pr"], { ...review }),
    ),
  ];
}

// Every week's note unless `?week=` names one.
const WeekQuery = z.optional(IsoWeek);

/** Each weekly note's entries and Code reviews, newest week first, with the Tickets and PRs they name. */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorizeWriter(request, env);

  if (viewer instanceof Response) return viewer;
  const week = WeekQuery.safeParse(new URL(request.url).searchParams.get("week") ?? undefined);

  if (!week.success) return json({ error: "invalid week" }, 400);
  const only = week.data ?? null;
  const days = only === null ? ["0000-01-01", "9999-12-31"] : weekRange(only);

  type StoredEntry = Omit<WorkEntry, "done"> & { week: string; done: number | null };

  const all = <Row>(sql: string, ...args: (string | null)[]) =>
    env.DB.prepare(sql)
      .bind(...args)
      .all<Row>()
      .then(({ results }) => results);

  const [weeks, entries, reviews, tickets, prs] = await Promise.all([
    all<Pick<WeeklyNote, "week" | "raw_md">>(
      `SELECT week, raw_md FROM work_weeks
        WHERE raw_md != '' AND week = coalesce(?, week) ORDER BY week DESC`,
      only,
    ),
    all<StoredEntry>(
      `SELECT entry.week, entry.day, entry.position, parent.position AS parent, entry.kind, entry.text,
          entry.ticket, entry.pr, entry.done
        FROM work_entries AS entry LEFT JOIN work_entries AS parent ON parent.id = entry.parent_id
        WHERE entry.week = coalesce(?, entry.week) ORDER BY entry.week, entry.position`,
      only,
    ),
    all<CodeReview>(
      "SELECT * FROM code_reviews WHERE day BETWEEN ? AND ? ORDER BY day, position",
      ...days,
    ),
    all<WorkTicket>("SELECT * FROM tickets ORDER BY key"),
    all<PullRequest>("SELECT * FROM pull_requests ORDER BY ref"),
  ]);

  const notes = weeks.map(({ week: noteWeek, raw_md }): WeeklyNote => {
    const ownEntries = entries
      .filter((entry) => entry.week === noteWeek)
      .map(({ week: _, done, ...entry }) => ({
        ...entry,
        done: done === null ? null : done === 1,
      }));

    const ownReviews = reviews.filter(({ day }) => isoWeekOf(day) === noteWeek);
    const keys = new Set(ownEntries.map(({ ticket }) => ticket));
    const refs = new Set([...ownEntries, ...ownReviews].map(({ pr }) => pr));

    for (const { ref, ticket } of prs) if (refs.has(ref)) keys.add(ticket ?? null);

    return {
      week: noteWeek,
      raw_md,
      entries: ownEntries,
      code_reviews: ownReviews,
      tickets: tickets.filter(({ key }) => keys.has(key)),
      pull_requests: prs.filter(({ ref }) => refs.has(ref)),
    };
  });

  return json({ notes });
}

/** Saves each note; reports the lines no parse or extraction typed, and extracted lines the note no longer holds. */
export async function onRequestPost({ request, env }: PagesContext) {
  const body = await authorizedBody(
    { request, env },
    workRows(NoteText),
    "invalid weekly notes",
    authorizeWriter,
  );

  if (body instanceof Response) return body;
  const parsed = parsedNotes(body.rows);

  if (parsed === null) return json({ error: "invalid weekly notes" }, 400);
  await env.DB.batch(parsed.flatMap(({ note }) => noteStatements(env.DB, note)));

  return json({
    upserted: parsed.length,
    leftovers: parsed.flatMap(({ leftovers }) => leftovers),
    stale: parsed.flatMap(({ stale }) => stale),
  });
}
