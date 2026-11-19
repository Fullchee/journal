import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { NoteExtraction, parseWeeklyNote } from "@/core/work/vault-note";

const fixture = (week: string) =>
  readFileSync(path.join(__dirname, "fixtures/weekly-notes", `${week}.md`), "utf8");

const NAV = "[[weekly/2025-W03| ⬅️ Previous week]] | [[weekly/2025-W05| ➡️ Next week]]";

describe("an older note", () => {
  const md = [
    NAV,
    "",
    "Mon, Jan 20 -> Sun, Jan 26",
    "## Summary",
    "---",
    "**Code reviews**",
    "- ",
    "- [ ]",
    "- Thurs",
    "\t- PostgresLookupTablesList",
    "\t\t- [x] static function",
    "\t\t- [ ] feedback",
    "- Wed",
    "\t- [x] Submitted [a PR](https://github.com/Acme/backend-core/pull/7)",
    "\t- [ ] ❌ blocked on [APP-3](https://acme.atlassian.net/browse/APP-3)",
    "AWS VPN docs",
    "\t- [ ] left over",
    "",
  ].join("\n");

  const extraction = NoteExtraction.parse({
    skip: ["- Thurs", "- Wed", "- Gone"],
    entries: [
      { source: "\t- PostgresLookupTablesList", day: "2025-01-23", kind: "task", text: "x" },
      {
        source: "\t\t- [x] static function",
        day: "2025-01-23",
        kind: "task",
        text: "s",
        done: false,
      },
      { source: "\t\t- [ ] feedback", day: "2025-01-23", kind: "note", text: "f" },
      {
        source: "\t- [x] Submitted [a PR](https://github.com/Acme/backend-core/pull/7)",
        day: "2025-01-22",
        kind: "task",
        text: "Submitted",
        pr: "backend-core#7",
      },
      {
        source: "\t- [ ] ❌ blocked on [APP-3](https://acme.atlassian.net/browse/APP-3)",
        day: "2025-01-22",
        kind: "blocker",
        text: "blocked on",
        ticket: "APP-3",
      },
      {
        source: "AWS VPN docs",
        day: null,
        kind: "task",
        text: "AWS VPN docs",
        ticket: "APP-4",
        done: true,
      },
      { source: "- not in the note", day: null, kind: "note", text: "gone" },
    ],
  });

  const { note, leftovers, stale } = parseWeeklyNote("2025-W04", md, extraction);

  test("every line becomes one entry, nested by indent; a ticked box is done and an open one says nothing", () => {
    assert.deepEqual(
      note.entries.map(({ position, parent, day, kind, text, ticket, pr, done }) => [
        position,
        parent,
        day,
        kind,
        text,
        ticket,
        pr,
        done,
      ]),
      [
        [0, null, "2025-01-23", "task", "x", null, null, null],
        [1, 0, "2025-01-23", "task", "s", null, null, true],
        [2, 0, "2025-01-23", "note", "f", null, null, null],
        [3, null, "2025-01-22", "task", "Submitted", null, "backend-core#7", true],
        [4, null, "2025-01-22", "blocker", "blocked on", "APP-3", null, null],
        [5, null, null, "task", "AWS VPN docs", "APP-4", null, true],
        [6, 5, null, "note", "left over", null, null, null],
      ],
    );
  });

  test("a line nothing typed is kept as a note and reported; a source no line holds is stale", () => {
    assert.deepEqual(leftovers, ["2025-W04:17 \t- [ ] left over"]);
    assert.deepEqual(stale, [
      '2025-W04: no line "- not in the note"',
      '2025-W04: no line "- Gone"',
    ]);
  });

  test("an extracted Ticket the note never links gets a bare row", () => {
    assert.deepEqual(note.tickets, [
      { key: "APP-3", url: "https://acme.atlassian.net/browse/APP-3" },
      { key: "APP-4", url: "" },
    ]);
    assert.equal(note.raw_md, md);
  });
});

test("repeated lines are claimed in order", () => {
  const md = "- a\n- b\n- a\n";

  const { note } = parseWeeklyNote("2025-W04", md, {
    entries: [
      { source: "- b", day: null, kind: "note", text: "b" },
      { source: "- a", day: null, kind: "note", text: "second" },
      { source: "- a", day: null, kind: "note", text: "first" },
    ],
  });

  assert.deepEqual(
    note.entries.map(({ text }) => text),
    ["first", "b", "second"],
  );
});

test("an extracted PR the note never links throws", () => {
  assert.throws(
    () =>
      parseWeeklyNote("2025-W04", "- x\n", {
        entries: [{ source: "- x", day: null, kind: "note", text: "x", pr: "web#1" }],
      }),
    { message: "2025-W04 never links web#1" },
  );
});

describe("a `####` note", () => {
  const md = fixture("2026-W46");
  const { note, leftovers } = parseWeeklyNote("2026-W46", md, { entries: [] });

  test("its Ticket, PR and Code review bullets parse; a line left over takes its heading's day", () => {
    const parsed = note.entries.filter(({ kind }) => kind !== "note");

    assert.ok(parsed.length > 40);
    assert.equal(note.code_reviews.length, 2);
    assert.ok(leftovers.includes("2026-W46:45 - Fix the analytics events"));
    assert.equal(
      note.entries.find(({ text }) => text === "Fix the analytics events")?.day,
      "2026-11-10",
    );
  });

  test("a PR bullet nests under its Ticket", () => {
    const pr = note.entries.find((entry) => entry.pr === "web#197");
    const parent = note.entries.find((entry) => entry.position === pr?.parent);

    assert.equal(parent?.ticket, "APP-140");
  });

  test("Code reviews number from 0 each day", () => {
    const md45 = fixture("2026-W45");
    const reviews = parseWeeklyNote("2026-W45", md45, { entries: [] }).note.code_reviews;

    assert.ok(
      reviews.every(({ day, position }) => reviews.filter((r) => r.day === day).at(position)),
    );
  });
});

describe("an open box from 2026-W39 on", () => {
  const md = "**Plan — Tue, Nov 10**\n- [ ] Merge\n- [ ] Fix CI\n- [ ] left over\n";

  const { note } = parseWeeklyNote("2026-W46", md, {
    entries: [
      { source: "- [ ] Merge", day: "2026-11-10", kind: "task", text: "Merge" },
      { source: "- [ ] Fix CI", day: "2026-11-10", kind: "task", text: "Fix CI", done: true },
    ],
  });

  test("is not done, unless the extraction marks it done from plan-log", () => {
    assert.deepEqual(
      note.entries.map(({ text, done }) => [text, done]),
      [
        ["Merge", false],
        ["Fix CI", true],
        ["left over", false],
      ],
    );
  });
});
