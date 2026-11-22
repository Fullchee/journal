import { readFileSync } from "node:fs";
import path from "node:path";

import { diffNoteLines, formatHunk, hunkHeading } from "@/core/work/note-diff";

const note = readFileSync(path.join(__dirname, "fixtures/weekly-notes/2026-W45.md"), "utf8");

describe("diffNoteLines", () => {
  it("is empty for the same note", () => {
    expect(diffNoteLines(note, note)).toEqual([]);
  });

  it("ignores trailing spaces, CRLF line endings and blank lines at the end", () => {
    const d1 = `${note.replaceAll("\n", "  \r\n")}\n\n`;

    expect(diffNoteLines(note, d1)).toEqual([]);
  });

  it("finds a changed line between matching ones", () => {
    expect(diffNoteLines("# W\n- a\n- b\n- c", "# W\n- a\n- B\n- c")).toEqual([
      { vault: { start: 3, lines: ["- b"] }, d1: { start: 3, lines: ["- B"] } },
    ]);
  });

  it("splits separate changes into separate hunks", () => {
    expect(diffNoteLines("a\nb\nc\nd", "a\nc\nd\ne")).toEqual([
      { vault: { start: 2, lines: ["b"] }, d1: { start: 2, lines: [] } },
      { vault: { start: 5, lines: [] }, d1: { start: 4, lines: ["e"] } },
    ]);
  });

  it("reports a note D1 holds none of as all vault lines", () => {
    expect(diffNoteLines("a\nb", "")).toEqual([
      { vault: { start: 1, lines: ["a", "b"] }, d1: { start: 1, lines: [] } },
    ]);
  });
});

describe("hunkHeading", () => {
  it("names a line, a range, or where a side has none", () => {
    expect(
      hunkHeading("2026-W45", {
        vault: { start: 4, lines: ["a", "b", "c"] },
        d1: { start: 4, lines: ["d"] },
      }),
    ).toBe("2026-W45: vault lines 4–6; D1 line 4");

    expect(
      hunkHeading("2026-W45", { vault: { start: 2, lines: [] }, d1: { start: 2, lines: ["e"] } }),
    ).toBe("2026-W45: vault none, after line 1; D1 line 2");
  });
});

describe("formatHunk", () => {
  it("lists vault lines with `-` and D1 lines with `+` under the heading", () => {
    expect(
      formatHunk("2026-W45", {
        vault: { start: 3, lines: ["- b"] },
        d1: { start: 3, lines: ["- B"] },
      }),
    ).toEqual(["2026-W45: vault line 3; D1 line 3", "- - b", "+ - B"]);
  });
});
