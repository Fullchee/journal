/** One imported session as a Duration entry: a local date, a local HH:MM start time and minutes. */
export interface ImportedEntry {
  date: string;
  startTime: string;
  minutes: number;
}

const MINUTES_A_DAY = 1440;

// A quoted cell runs to its closing quote; a doubled quote inside it is one quote.
function quotedCell(text: string, openQuote: number): [cell: string, next: number] {
  let cell = "";
  let i = openQuote + 1;

  while (i < text.length) {
    const char = text.charAt(i);

    if (char === '"' && text.charAt(i + 1) !== '"') return [cell, i + 1];
    cell += char;
    i += char === '"' ? 2 : 1;
  }

  return [cell, i];
}

/** Splits CSV text into rows of cells; quoted cells may hold commas, doubled quotes and line breaks. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  const row: string[] = [];
  let cell = "";
  let i = 0;

  while (i < text.length) {
    const char = text.charAt(i);

    if (char === '"') {
      const [quoted, next] = quotedCell(text, i);
      cell += quoted;
      i = next;
      continue;
    }

    if (char === "," || char === "\n") {
      row.push(cell);
      cell = "";

      if (char === "\n") rows.push(row.splice(0));
    } else if (char !== "\r") {
      cell += char;
    }

    i++;
  }

  if (cell !== "" || row.length > 0) rows.push([...row, cell]);

  return rows;
}

/** A session too short to round to a minute still counts as one; a Duration entry holds at most a day. */
export const clampMinutes = (minutes: number) =>
  Math.min(Math.max(Math.round(minutes), 1), MINUTES_A_DAY);

const startOf = ({ date, startTime }: ImportedEntry) => `${date} ${startTime}`;

/** Keeps one entry per start, earliest first: two rows with the same start are one session. */
export function oncePerStart(entries: ImportedEntry[]): ImportedEntry[] {
  const byStart = new Map(entries.map((entry) => [startOf(entry), entry]));

  return [...byStart.values()].toSorted((a, b) => startOf(a).localeCompare(startOf(b)));
}
