// The nightly parallel-run check (#15): D1's archived weekly note against the vault's. The typed rows can't rebuild
// a note (they drop PR state, ✅ marks and section labels), so `raw_md` is the week as D1 renders it.
// Scripts import this file by path, so it imports nothing.

/** A run of changed lines, numbered from 1: `vault` lines D1 lacks, then `d1` lines the vault lacks. */
export interface NoteDiffHunk {
  vault: { start: number; lines: string[] };
  d1: { start: number; lines: string[] };
}

/** Trailing spaces, line endings and blank lines at the end are whitespace the two writers may disagree on. */
const normalizedLines = (md: string) => {
  const lines = md
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd());

  while (lines.at(-1) === "") lines.pop();

  return lines;
};

/** The longest run of lines the notes share from line i of `vault` and line j of `d1` on, both counted from 0. */
function commonRuns(vault: readonly string[], d1: readonly string[]) {
  const width = d1.length + 1;
  // Cells past either end are never set and read as 0.
  const common = new Map<number, number>();
  const commonFrom = (i: number, j: number) => common.get(i * width + j) ?? 0;

  for (let i = vault.length - 1; i >= 0; i -= 1) {
    for (let j = d1.length - 1; j >= 0; j -= 1) {
      common.set(
        i * width + j,
        vault[i] === d1[j]
          ? commonFrom(i + 1, j + 1) + 1
          : Math.max(commonFrom(i + 1, j), commonFrom(i, j + 1)),
      );
    }
  }

  return commonFrom;
}

/** The changed lines between two notes after whitespace normalising, as a shortest line diff; empty when they match. */
export function diffNoteLines(vaultMd: string, d1Md: string): NoteDiffHunk[] {
  const vault = normalizedLines(vaultMd);
  const d1 = normalizedLines(d1Md);
  const commonFrom = commonRuns(vault, d1);
  const hunks: NoteDiffHunk[] = [];
  let open: NoteDiffHunk | null = null;
  let i = 0;
  let j = 0;

  while (i < vault.length || j < d1.length) {
    if (i < vault.length && vault[i] === d1[j]) {
      open = null;
      i += 1;
      j += 1;
      continue;
    }

    if (open === null) {
      open = { vault: { start: i + 1, lines: [] }, d1: { start: j + 1, lines: [] } };
      hunks.push(open);
    }

    if (j === d1.length || (i < vault.length && commonFrom(i + 1, j) >= commonFrom(i, j + 1))) {
      open.vault.lines.push(String(vault[i]));
      i += 1;
    } else {
      open.d1.lines.push(String(d1[j]));
      j += 1;
    }
  }

  return hunks;
}

/** Where a side's lines sit: `line 4`, `lines 4–6`, or `none, after line 3` when that side has none. */
function lineRange({ start, lines }: { start: number; lines: string[] }) {
  if (lines.length === 0) return `none, after line ${start - 1}`;

  return lines.length === 1 ? `line ${start}` : `lines ${start}–${start + lines.length - 1}`;
}

/** A hunk's place in both notes, without their text: safe to post where others can read it. */
export const hunkHeading = (week: string, { vault, d1 }: NoteDiffHunk) =>
  `${week}: vault ${lineRange(vault)}; D1 ${lineRange(d1)}`;

/** A hunk as its heading, then `- ` before each vault line and `+ ` before each D1 line. */
export const formatHunk = (week: string, hunk: NoteDiffHunk) => [
  hunkHeading(week, hunk),
  ...hunk.vault.lines.map((line) => `- ${line}`),
  ...hunk.d1.lines.map((line) => `+ ${line}`),
];
