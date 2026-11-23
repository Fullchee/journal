import assert from "node:assert/strict";
import type { BriefFacts, BriefRow } from "@/core/session-brief";
import {
  briefMarkdown,
  briefRecordTitle,
  briefRowLine,
  habitLine,
  skipLine,
} from "@/core/session-brief-markdown";

const row = (extra: Partial<BriefRow> = {}): BriefRow => ({
  day: "2026-11-03",
  time: "9:15 AM",
  zone: "Rain",
  score: 3,
  where: "",
  doing: "",
  onMyMind: "",
  note: "",
  tense: "",
  low: "",
  tired: "",
  tiredButWired: false,
  ...extra,
});

const facts = (extra: Partial<BriefFacts> = {}): BriefFacts => ({
  start: "2026-11-01",
  end: "2026-11-07",
  rows: [],
  sleep: [],
  lows: [],
  highs: [],
  habits: [],
  oneOffs: [],
  skips: [],
  notes: [],
  ...extra,
});

test("briefRowLine leaves out empty fields", () => {
  assert.equal(briefRowLine(row(), []), "2026-11-03 9:15 AM, Rain");
  assert.equal(
    briefRowLine(row({ where: "Home", doing: "Work", onMyMind: "Deadline", note: "tired" }), []),
    "2026-11-03 9:15 AM, Rain, Home, Work: Deadline “tired”",
  );
});

test("briefRowLine adds the night that ended on the row's Day, never its score", () => {
  const storm = row({ day: "2026-11-10", zone: "Storm", where: "Home", doing: "Work" });

  const nights = [
    { date: "2026-11-09", durationMin: 480, sleepScore: 90 },
    { date: "2026-11-10", durationMin: 310, sleepScore: 41 },
  ];

  assert.equal(
    briefRowLine(storm, nights),
    "2026-11-10 9:15 AM, Storm, Home, Work · after 5.2h sleep",
  );
  assert.equal(briefRowLine(row({ day: "2026-11-11" }), nights), "2026-11-11 9:15 AM, Rain");
});

test("skipLine flags avoidance and adds a note only when given", () => {
  assert.equal(
    skipLine({ date: "2026-11-03", name: "Run", cause: "avoidance", note: "tired", flagged: true }),
    "2026-11-03 Run: avoidance (flagged) “tired”",
  );
  assert.equal(
    skipLine({ date: "2026-11-03", name: "Run", cause: "outside", note: "", flagged: false }),
    "2026-11-03 Run: outside",
  );
});

test("briefMarkdown lists Skips only when there are some", () => {
  const skip = {
    date: "2026-11-03",
    name: "Run",
    cause: "avoidance",
    note: "",
    flagged: true,
  } as const;

  const withSkip = facts({ rows: [row()], skips: [skip] });
  const without = facts({ rows: [row()] });

  assert.match(
    briefMarkdown({ facts: withSkip, prose: null }),
    /## Skips\n\n- 2026-11-03 Run: avoidance \(flagged\)/,
  );
  assert.doesNotMatch(briefMarkdown({ facts: without, prose: null }), /## Skips/);
});

test("briefMarkdown lists Habit notes only when there are some", () => {
  const note = { name: "Side projects", date: "2026-11-03", note: "Android wrapper" };

  const withNote = facts({ rows: [row()], notes: [note] });
  const without = facts({ rows: [row()] });

  assert.match(
    briefMarkdown({ facts: withNote, prose: null }),
    /## Habit notes\n\n- 2026-11-03 Side projects: Android wrapper/,
  );
  assert.doesNotMatch(briefMarkdown({ facts: without, prose: null }), /## Habit notes/);
});

test("briefRecordTitle names the window by month and day", () => {
  assert.equal(
    briefRecordTitle({ facts: facts({ end: "2026-11-15" }), prose: null }),
    "Session brief, Nov 1 to Nov 15",
  );
});

test("habitLine says day or days", () => {
  assert.equal(habitLine({ name: "Walk", days: 1 }), "Walk: 1 day");
  assert.equal(habitLine({ name: "Walk", days: 3 }), "Walk: 3 days");
});

test("briefMarkdown says so when the window has no Check-ins", () => {
  assert.equal(
    briefMarkdown({ facts: facts(), prose: null }),
    "# Session brief: 2026-11-01 to 2026-11-07\n\nNo Check-ins in this window.\n",
  );
});

test("briefMarkdown writes every section, escaping table cells", () => {
  const low = row({ where: "Home", onMyMind: "a|b" });

  const markdown = briefMarkdown({
    facts: facts({
      rows: [low],
      lows: [low],
      sleep: [{ date: "2026-11-02", durationMin: 450, sleepScore: null }],
      habits: [{ name: "Walk", days: 2 }],
    }),
    prose: { summary: "A slow week.", patterns: [], toRaise: "Sleep." },
  });

  assert.match(markdown, /\*\*The week in one line:\*\* A slow week\./);
  assert.match(markdown, /\| 2026-11-03 9:15 AM \| Rain \(3\) \| Home \| {2}\| a\\\|b \|/);
  assert.match(markdown, /\*\*Sleep:\*\* 2026-11-02 7\.5h/);
  assert.match(markdown, /## Lows\n\n- 2026-11-03 9:15 AM, Rain, Home: a\|b/);
  assert.match(markdown, /## Highs\n\nNone\./);
  assert.match(markdown, /## Patterns I noticed\n\nNo pattern with 2\+ data points\./);
  assert.match(markdown, /## What helped\n\n- Walk: 2 days/);
  assert.match(markdown, /## To raise in session\n\nSleep\.\n$/);
});

test("briefMarkdown lists each high Check-in", () => {
  const high = row({ zone: "Sun", score: 8, where: "Park" });
  const markdown = briefMarkdown({ facts: facts({ rows: [high], highs: [high] }), prose: null });

  assert.match(markdown, /## Highs\n\n- 2026-11-03 9:15 AM, Sun, Park/);
});

test("briefMarkdown pairs each Low and High with the night before it", () => {
  const storm = row({ day: "2026-11-10", zone: "Storm", score: 1, where: "Home", doing: "Work" });
  const sun = row({ day: "2026-11-12", zone: "Sun", score: 8 });

  const markdown = briefMarkdown({
    facts: facts({
      rows: [storm, sun],
      lows: [storm],
      highs: [sun],
      sleep: [{ date: "2026-11-10", durationMin: 310, sleepScore: 41 }],
    }),
    prose: null,
  });

  assert.match(
    markdown,
    /## Lows\n\n- 2026-11-10 9:15 AM, Storm, Home, Work · after 5\.2h sleep\n/,
  );
  assert.match(markdown, /## Highs\n\n- 2026-11-12 9:15 AM, Sun\n/);
  assert.doesNotMatch(markdown, /41/);
});

test("briefMarkdown says what the model couldn't write", () => {
  const markdown = briefMarkdown({ facts: facts({ rows: [row()] }), prose: null });

  assert.match(markdown, /The summary couldn't be written/);
  assert.match(markdown, /## Patterns I noticed\n\nThe prose couldn't be written\./);
  assert.doesNotMatch(markdown, /Sleep:/);
});

test("briefMarkdown counts Tense, Low and Tired only when a Check-in answered them", () => {
  const rows = [
    row({ tense: "A lot", tired: "A lot", tiredButWired: true }),
    row({ tense: "Some" }),
  ];

  const unanswered = facts({ rows: [row()] });

  assert.match(
    briefMarkdown({ facts: facts({ rows }), prose: null }),
    /## Tense, Low and Tired\n\n- Tense: A lot on 1 of 2 Check-ins, Some on 1\n- Tired: A lot on 1 of 1 Check-in\n- Tired but wired \(Tense and Tired both A lot\): 1 Check-in/,
  );
  assert.doesNotMatch(briefMarkdown({ facts: unanswered, prose: null }), /Tense, Low and Tired/);
});
