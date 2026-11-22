// Imports work-log's data files, weekly notes and work retros into D1 through the API, as the owner.
// Usage: node scripts/import-work-log.ts <work-log path> [--dry-run | --diff]
//   --dry-run  prints what it would send
//   --diff     compares each file with D1 and exits 1 on any difference
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import * as z from "zod/mini";

type Route = "days" | "estimates" | "weeks" | "plans" | "tickets" | "retros";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type Row = Record<string, Json>;

interface Upload {
  route: Route;
  rows: Row[];
}

/** Sends one request and returns the response body's JSON text. */
export type Api = (method: "GET" | "POST" | "PUT", route: string, body?: Json) => string;

/**
 * Each route's key and rows per POST: a free-plan Worker runs at most 50 D1 queries per request, and a Plan takes
 * one per action and Ticket. Weekly notes also fill work_days and work_weeks, so only Plans and estimates flag a
 * row that D1 alone holds.
 */
const ROUTES: Record<Route, { key: string; rowsPerPost: number; filesOnly: boolean }> = {
  days: { key: "day", rowsPerPost: 40, filesOnly: false },
  estimates: { key: "task_id", rowsPerPost: 40, filesOnly: true },
  weeks: { key: "week", rowsPerPost: 40, filesOnly: false },
  plans: { key: "day", rowsPerPost: 2, filesOnly: true },
  tickets: { key: "key", rowsPerPost: 40, filesOnly: false },
  retros: { key: "period", rowsPerPost: 40, filesOnly: false },
};

const IsoDate = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));

const csvNumber = (pattern: RegExp) =>
  z.pipe(z.string().check(z.regex(pattern)), z.transform(Number));

const CsvCount = csvNumber(/^\d+$/);

/** An optional CSV cell: blank is null. */
const blankAsNull = <Out>(cell: z.ZodMiniType<Out, string>) =>
  z.union([
    z.pipe(
      z.literal(""),
      z.transform(() => null),
    ),
    cell,
  ]);

const HistoryDay = z.pipe(
  z.object({
    date: IsoDate,
    prs_merged: CsvCount,
    prs_opened: CsvCount,
    reviews: CsvCount,
    tickets_resolved: CsvCount,
    points_resolved: csvNumber(/^\d+(\.\d+)?$/),
    epics_closed: CsvCount,
    day_off: z.string(),
    vacation_week: z.string(),
    included: csvNumber(/^[01]$/),
  }),
  z.transform(({ date, ...day }) => ({ day: date, ...day })),
);

const Estimate = z.object({
  completion_date: IsoDate,
  task_id: z.string().check(z.minLength(1)),
  task_name: z.string(),
  jira_key: blankAsNull(z.string()),
  estimate: z.string(),
  actual: z.string(),
  blocker_type: z.string(),
  storm_to_sun: blankAsNull(CsvCount),
  notes: z.string(),
});

const NullableText = z.nullable(z.string());

const PlanAction = z.pipe(
  z.object({
    id: z.string(),
    type: z.string(),
    ticket: NullableText,
    pr: NullableText,
    url: NullableText,
    status: z.string(),
  }),
  z.transform(({ id, type, ...action }) => ({ id, kind: type, ...action })),
);

/** A plan-log.jsonl row; its stored hit rate is left out, as core computes it. */
const PlanLogRow = z.object({
  date: IsoDate,
  plan_date: IsoDate,
  written_at: z.string(),
  planned_size: z.int(),
  size_rule: z.string(),
  scored_on: z.nullable(IsoDate),
  unplanned_done: z.nullable(z.int()),
  meeting_hours: z.nullable(z.number()),
  felt: z.nullable(z.int()),
  actions: z.array(PlanAction),
  if_time: z.array(PlanAction),
});

const Range = z.tuple([z.number(), z.number()]);

/** A weeks.jsonl row; `start` and `end` follow from the week, so D1 leaves them out. */
const Week = z.object({
  week: z.string(),
  tickets: z.nullable(z.int()),
  scenarios: z.nullable(z.int()),
  median_cycle_hours: z.nullable(z.number()),
  median_pr_size: z.nullable(z.number()),
  reverts: z.nullable(z.int()),
  reopened: z.nullable(z.int()),
  reviews: z.nullable(z.int()),
  forecast: z.record(z.string(), Range),
});

// One cell: quoted (a doubled quote stands for one) or bare up to the next comma.
const CSV_CELL = /(?:^|,)("(?:[^"]|"")*"|[^,]*)/gu;

const unquote = (cell: string) =>
  cell.startsWith('"') ? cell.slice(1, -1).replaceAll('""', '"') : cell;

const csvCells = (line: string) =>
  Array.from(line.matchAll(CSV_CELL), ([, cell = ""]) => unquote(cell));

/** Parses CSV into one record per data row, keyed by the header; the data files never break a cell across lines. */
export function parseCsv(text: string): Record<string, string | undefined>[] {
  const [header = [], ...rows] = text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => csvCells(line));

  return rows.map((row) => Object.fromEntries(header.map((name, column) => [name, row[column]])));
}

const readData = (root: string, name: string) =>
  readFileSync(path.join(root, "data", name), "utf8");

/** Ticket titles from Jira, and the retro fields the one-off extraction (#155) found, by period. */
const TicketTitles = z.record(z.string(), z.string());

const RetroFields = z.record(
  z.string(),
  z.partialRecord(z.enum(["shipped", "learning", "values_in_action", "goals"]), z.string()),
);

function readExtracted<Out>(root: string, name: string, schema: z.ZodMiniType<Out>): Out {
  const text = readFileSync(path.join(root, "data/extracted", name), "utf8");

  return schema.parse(JSON.parse(text));
}

const readJsonl = <Out>(root: string, name: string, schema: z.ZodMiniType<Out>): Out[] =>
  readData(root, name)
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => schema.parse(JSON.parse(line)));

/** The data files and extracted titles and retro fields as /api/work uploads, in post order: a Plan after the rows it needs. */
export function readWorkLog(root: string): Upload[] {
  const history = z.array(HistoryDay).parse(parseCsv(readData(root, "history-daily.csv")));
  const estimates = z.array(Estimate).parse(parseCsv(readData(root, "estimate-log.csv")));
  const weeks = readJsonl(root, "weeks.jsonl", Week);
  const planLog = readJsonl(root, "plan-log.jsonl", PlanLogRow);
  const titles = readExtracted(root, "tickets.json", TicketTitles);
  const retros = readExtracted(root, "retros.json", RetroFields);

  // history-daily.csv and plan-log.jsonl each fill their own columns of a Work day.
  const days = new Map<string, Row>(history.map((day) => [day.day, day]));

  for (const { date, meeting_hours, felt } of planLog) {
    days.set(date, { ...(days.get(date) ?? { day: date }), meeting_hours, felt });
  }

  const plans = planLog.map(({ date, meeting_hours: _hours, felt: _felt, ...plan }) => ({
    day: date,
    ...plan,
  }));

  return [
    { route: "days", rows: [...days.values()] },
    { route: "estimates", rows: estimates },
    { route: "weeks", rows: weeks },
    { route: "plans", rows: plans },
    { route: "tickets", rows: Object.entries(titles).map(([key, title]) => ({ key, title })) },
    {
      route: "retros",
      rows: Object.entries(retros).map(([period, fields]) => ({ period, ...fields })),
    },
  ];
}

const keyOf = (route: Route, row: Row) => z.string().parse(row[ROUTES[route].key]);

/** Each field of `row` that D1 holds differently, or one line when D1 lacks the row. */
function rowDiff(label: string, row: Row, storedRow: Row | undefined): string[] {
  if (storedRow === undefined) return [`${label}: missing from D1`];
  const lines: string[] = [];

  for (const [field, value] of Object.entries(row)) {
    if (isDeepStrictEqual(value, storedRow[field])) continue;
    lines.push(
      `${label} ${field}: file ${JSON.stringify(value)}, D1 ${JSON.stringify(storedRow[field])}`,
    );
  }

  return lines;
}

/** One line per field that differs between the files and D1, plus each row only one side holds. */
export function diffUploads(uploads: Upload[], stored: Partial<Record<Route, Row[]>>): string[] {
  return uploads.flatMap(({ route, rows }) => {
    const storedRows = new Map((stored[route] ?? []).map((row) => [keyOf(route, row), row]));
    const lines: string[] = [];

    for (const row of rows) {
      const key = keyOf(route, row);
      lines.push(...rowDiff(`${route} ${key}`, row, storedRows.get(key)));
      storedRows.delete(key);
    }

    if (ROUTES[route].filesOnly) {
      for (const key of storedRows.keys()) lines.push(`${route} ${key}: only in D1`);
    }

    return lines;
  });
}

const StoredRows = z.array(z.record(z.string(), z.json()));

const fetchStored = (api: Api, route: Route): Row[] =>
  z.record(z.string(), StoredRows).parse(JSON.parse(api("GET", `/api/work/${route}`)))[route] ?? [];

/** A vault weekly note and its one-off extraction (#155), when it has one; the Worker parses and types it. */
interface WeeklyNoteFile {
  week: string;
  md: string;
  extraction?: Json;
}

type PeriodKind = "week" | "month" | "quarter" | "year";

/** A work retro, keyed by its period within the Work track. */
interface Retro {
  periodKind: PeriodKind;
  period: string;
  body: string;
}

const WEEKLY_FILE = /^(?:\d{4}\/)?(\d{4}-W\d{2})\.md$/u;

/**
 * Each period note's folder, the file names it holds and their kind; the file name is the period. The work year
 * (Nov to Nov) keeps its name, `2026-work-year`, so it sits beside the calendar year `2026`.
 */
const PERIOD_FOLDERS: [folder: string, file: RegExp, kind: PeriodKind][] = [
  ["monthly", /^(?:\d{4}-monthly\/)?(\d{4}-\d{2})\.md$/u, "month"],
  ["quarterly", /^(\d{4}-Q[1-4])\.md$/u, "quarter"],
  ["yearly", /^(\d{4}(?:-work-year)?)\.md$/u, "year"],
];

const WEEK_RETRO = /^### Week (\d{1,2})\b/u;

/** Each Markdown file under `folder` whose `/`-joined path matches `pattern`, named by its first group; others are skipped. */
function namedNotes(root: string, folder: string, pattern: RegExp, skip: (file: string) => void) {
  const files = readdirSync(path.join(root, folder), { recursive: true, encoding: "utf8" });
  const notes: { name: string; text: string }[] = [];
  files.sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const relative = file.split(path.sep).join("/");
    const name = pattern.exec(relative)?.[1];

    if (name !== undefined) {
      notes.push({ name, text: readFileSync(path.join(root, folder, file), "utf8") });
    } else if (relative.endsWith(".md")) {
      skip(`${folder}/${relative}`);
    }
  }

  return notes;
}

/** Each weekly note, named by the ISO week in its file name (2024's sit in a subfolder), with its extraction. */
export function readWeeklyNotes(root: string, skip: (file: string) => void): WeeklyNoteFile[] {
  return namedNotes(root, "weekly", WEEKLY_FILE, skip).map(({ name, text }) => {
    const file = path.join(root, "data/extracted/weekly", `${name}.json`);

    return existsSync(file)
      ? { week: name, md: text, extraction: z.json().parse(JSON.parse(readFileSync(file, "utf8"))) }
      : { week: name, md: text };
  });
}

/** A month's `### Week NN` retros, each kept whole from its heading to the next heading; NN is an ISO week of the month's year. */
function weekRetros(month: string, md: string): Retro[] {
  const blocks: { period: string; lines: string[] }[] = [];
  let open: { period: string; lines: string[] } | null = null;

  for (const line of md.split("\n")) {
    const week = WEEK_RETRO.exec(line)?.[1];

    if (week !== undefined) {
      open = { period: `${month.slice(0, 4)}-W${week.padStart(2, "0")}`, lines: [line] };
      blocks.push(open);
    } else if (line.startsWith("#")) {
      open = null;
    } else {
      open?.lines.push(line);
    }
  }

  return blocks.map(({ period, lines }) => ({
    periodKind: "week",
    period,
    body: `${lines.join("\n").trimEnd()}\n`,
  }));
}

/** Every period note whole, plus each month's `### Week NN` retros; a file named for no period is skipped. */
function readRetros(root: string, skip: (file: string) => void): Retro[] {
  const retros: Retro[] = [];

  for (const [folder, pattern, periodKind] of PERIOD_FOLDERS) {
    for (const { name, text } of namedNotes(root, folder, pattern, skip)) {
      retros.push({ periodKind, period: name, body: text });

      if (periodKind === "month") retros.push(...weekRetros(name, text));
    }
  }

  return retros;
}

const StoredNote = z.object({ week: z.string(), raw_md: z.string() });

type StoredNote = z.infer<typeof StoredNote>;

const StoredNotes = z.object({ notes: z.array(StoredNote) });

export const fetchNotes = (api: Api) => {
  const body = api("GET", "/api/work/weekly-notes");

  return StoredNotes.parse(JSON.parse(body)).notes;
};

const RetroListItem = z.object({ id: z.int(), title: z.string() });

const RetroItems = z.object({ items: z.array(RetroListItem) });

const RetroItem = z.object({ item: z.object({ body: z.string() }) });

/** The stored work retros, by period. */
function fetchRetros(api: Api) {
  const list = api("GET", "/api/notes/reflections?track=work");
  const { items } = RetroItems.parse(JSON.parse(list));

  // Each body is fetched only when compared, one request per retro.
  const bodyOf = (id: number) => {
    const detail = api("GET", `/api/notes/reflections/${id}`);

    return RetroItem.parse(JSON.parse(detail)).item.body;
  };

  return new Map(items.map(({ id, title }) => [title, { id, body: () => bodyOf(id) }]));
}

/** A note's difference: D1 lacks it, or archives other text, so its entries came from other lines. */
function noteDiff({ week, md }: WeeklyNoteFile, stored: StoredNote | undefined): string[] {
  if (stored === undefined) return [`weekly ${week}: missing from D1`];

  return stored.raw_md === md ? [] : [`weekly ${week}: D1 archives different Markdown`];
}

function diffNotes(notes: WeeklyNoteFile[], retros: Retro[], api: Api): string[] {
  const storedNotes = new Map(fetchNotes(api).map((note) => [note.week, note]));
  const storedRetros = fetchRetros(api);
  const lines = notes.flatMap((note) => noteDiff(note, storedNotes.get(note.week)));

  for (const { week } of notes) storedNotes.delete(week);

  for (const week of storedNotes.keys()) lines.push(`weekly ${week}: only in D1`);

  for (const { period, body } of retros) {
    const stored = storedRetros.get(period);
    storedRetros.delete(period);

    if (stored === undefined) lines.push(`retro ${period}: missing from D1`);
    else if (stored.body() !== body) lines.push(`retro ${period}: body differs`);
  }

  for (const period of storedRetros.keys()) lines.push(`retro ${period}: only in D1`);

  return lines;
}

const NoteReport = z.object({ leftovers: z.array(z.string()), stale: z.array(z.string()) });

/**
 * Posts each weekly note on its own, as one note can take most of a request's D1 queries, and prints each line
 * left over (kept as a note) or stale (extracted, but gone from the note); saves each retro that changed.
 */
function importNotes(
  notes: WeeklyNoteFile[],
  retros: Retro[],
  api: Api,
  print: (line: string) => void,
) {
  const reports = notes.map((note) =>
    NoteReport.parse(JSON.parse(api("POST", "/api/work/weekly-notes", { rows: [{ ...note }] }))),
  );

  const leftovers = reports.flatMap((report) => report.leftovers);
  const stale = reports.flatMap((report) => report.stale);

  for (const line of [...leftovers, ...stale]) print(line);
  print(
    `Weekly notes: ${leftovers.length} lines left over, ${stale.length} extracted lines stale.`,
  );
  const stored = fetchRetros(api);

  for (const { periodKind, period, body } of retros) {
    const existing = stored.get(period);

    if (existing === undefined) {
      api("POST", "/api/notes/reflections", { track: "work", periodKind, period, body });
    } else if (existing.body() !== body) {
      api("PUT", `/api/notes/reflections/${existing.id}`, { body });
    }
  }
}

type Mode = "import" | "dry-run" | "diff";

interface WorkLog {
  uploads: Upload[];
  notes: WeeklyNoteFile[];
  retros: Retro[];
}

function printDryRun({ uploads, notes, retros }: WorkLog, print: (line: string) => void) {
  for (const { route, rows } of uploads) {
    print(`POST /api/work/${route}: ${rows.length} rows`);

    for (const row of rows) print(JSON.stringify(row));
  }

  print(`POST /api/work/weekly-notes: ${notes.length} notes`);
  print(`Work retros: ${retros.length}`);

  for (const { week, md } of notes) print(`${week}: ${md.length} characters`);

  for (const { periodKind, period } of retros) print(`${periodKind} ${period}`);
}

function importAll({ uploads, notes, retros }: WorkLog, api: Api, print: (line: string) => void) {
  for (const { route, rows } of uploads) {
    const { rowsPerPost } = ROUTES[route];

    for (let start = 0; start < rows.length; start += rowsPerPost) {
      api("POST", `/api/work/${route}`, { rows: rows.slice(start, start + rowsPerPost) });
    }
  }

  importNotes(notes, retros, api, print);
}

/** Prints each difference; returns true when there is one. */
function diffAll({ uploads, notes, retros }: WorkLog, api: Api, print: (line: string) => void) {
  const stored = Object.fromEntries(uploads.map(({ route }) => [route, fetchStored(api, route)]));
  const differences = [...diffUploads(uploads, stored), ...diffNotes(notes, retros, api)];
  const rowCount = uploads.reduce((total, { rows }) => total + rows.length, 0);

  for (const line of differences) print(line);

  if (differences.length === 0) {
    print(
      `No differences: ${rowCount} rows, ${notes.length} weekly notes and ${retros.length} retros match D1.`,
    );
  }

  return differences.length > 0;
}

/** Runs one mode; returns true when the diff finds a difference. */
export function importWorkLog(
  root: string,
  mode: Mode,
  api: Api,
  print: (line: string) => void,
): boolean {
  const skip = (file: string) => print(`Skipped ${file}: its name holds no week or period`);

  const workLog = {
    uploads: readWorkLog(root),
    notes: readWeeklyNotes(root, skip),
    retros: readRetros(root, skip),
  };

  if (mode === "diff") return diffAll(workLog, api, print);

  if (mode === "dry-run") printDryRun(workLog, print);
  else importAll(workLog, api, print);

  return false;
}

const API_SCRIPT = path.join(
  import.meta.dirname,
  "../.claude/skills/journal/scripts/journal-api.sh",
);

/** Calls the live API through the journal skill's script, which logs in through Cloudflare Access. */
export const journalApi: Api = (method, route, body) => {
  const result = spawnSync(
    API_SCRIPT,
    [method, route, ...(body === undefined ? [] : [JSON.stringify(body)])],
    { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 },
  );

  if (result.status !== 0) throw new Error(`${method} ${route} failed:\n${result.stdout}`);

  // The script prints `HTTP <status>` above the JSON payload.
  return result.stdout.slice(result.stdout.indexOf("\n") + 1);
};

const MODES = { "--dry-run": "dry-run", "--diff": "diff" } as const;

const Args = z.tuple([z.string(), z.optional(z.enum(["--dry-run", "--diff"]))]);

if (import.meta.main) {
  const args = Args.safeParse(process.argv.slice(2));

  if (!args.success) {
    throw new Error("Usage: node scripts/import-work-log.ts <work-log path> [--dry-run | --diff]");
  }

  const [root, flag] = args.data;
  const print = (line: string) => process.stdout.write(`${line}\n`);

  if (importWorkLog(root, flag === undefined ? "import" : MODES[flag], journalApi, print)) {
    throw new Error("The work-log data files differ from D1.");
  }
}
