import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type TestContext, test } from "node:test";

import { diffWeeks, launchAgent, runNightly, type WeekDiff } from "./vault-diff.ts";

const NOTE =
  "# 2026-W45\n\n#### Mon, Nov 2\n\n- [APP-101](https://acme.atlassian.net/browse/APP-101): Fix the sync\n";

test("diffWeeks finds no difference when every note matches after whitespace normalising", () => {
  assert.deepEqual(
    diffWeeks([{ week: "2026-W45", md: NOTE }], [{ week: "2026-W45", raw_md: `${NOTE}\n  ` }]),
    [],
  );
});

test("diffWeeks names each changed line, and each week only one side holds", () => {
  const diffs = diffWeeks(
    [
      { week: "2026-W45", md: NOTE },
      { week: "2026-W46", md: "# 2026-W46\n" },
    ],
    [
      { week: "2026-W45", raw_md: NOTE.replace("Fix", "Mend") },
      { week: "2026-W47", raw_md: "# 2026-W47\n" },
    ],
  );

  assert.deepEqual(diffs, [
    {
      week: "2026-W45",
      headings: ["2026-W45: vault line 5; D1 line 5"],
      lines: [
        "2026-W45: vault line 5; D1 line 5",
        "- - [APP-101](https://acme.atlassian.net/browse/APP-101): Fix the sync",
        "+ - [APP-101](https://acme.atlassian.net/browse/APP-101): Mend the sync",
      ],
    },
    {
      week: "2026-W46",
      headings: ["2026-W46: missing from D1"],
      lines: ["2026-W46: missing from D1"],
    },
    { week: "2026-W47", headings: ["2026-W47: only in D1"], lines: ["2026-W47: only in D1"] },
  ]);
});

const DIFF: WeekDiff = {
  week: "2026-W45",
  headings: ["2026-W45: vault line 5; D1 line 5"],
  lines: ["2026-W45: vault line 5; D1 line 5", "- secret vault text", "+ secret D1 text"],
};

/** A nightly run against a temp log folder, recording what it notified and commented. */
function nightly(t: TestContext) {
  const logDir = mkdtempSync(path.join(tmpdir(), "vault-diff-"));
  t.after(() => rmSync(logDir, { recursive: true }));
  const notes: string[] = [];
  const comments: string[] = [];
  const sent = { notes, comments };

  return {
    logDir,
    sent,
    run: (diff: () => WeekDiff[], today = "2026-11-22") =>
      runNightly(diff, {
        today,
        logDir,
        notify: (message) => {
          notes.push(message);
        },
        comment: (body) => {
          comments.push(body);
        },
      }),
    read: (file: string) => readFileSync(path.join(logDir, file), "utf8"),
  };
}

test("runNightly logs an empty run quietly", (t) => {
  const { run, read, sent } = nightly(t);
  run(() => []);

  assert.equal(read("2026-11-22.txt"), "No differences.\n");
  assert.equal(read("runs.log"), "2026-11-22 empty\n");
  assert.deepEqual(sent, { notes: [], comments: [] });
});

test("runNightly notifies and comments the weeks and line numbers, keeping the text in the local log", (t) => {
  const { run, read, sent, logDir } = nightly(t);
  run(() => [DIFF]);

  assert.equal(read("2026-11-22.txt"), `${DIFF.lines.join("\n")}\n`);
  assert.equal(read("runs.log"), "2026-11-22 differs 2026-W45\n");
  assert.deepEqual(sent.notes, [
    `1 weeks differ: 2026-W45. Log: ${path.join(logDir, "2026-11-22.txt")}`,
  ]);
  assert.equal(
    sent.comments.join(","),
    "Found 1 weeks where D1 differs from the vault in the 2026-11-22 nightly diff:\n\n- 2026-W45: vault line 5; D1 line 5",
  );
  assert.doesNotMatch(sent.comments.join(","), /secret/u);
});

test("runNightly logs and notifies a failed run", (t) => {
  const { run, read, sent } = nightly(t);
  run(() => {
    throw new Error("GET /api/work/weekly-notes failed:\nHTTP 500");
  });

  assert.match(read("2026-11-22.txt"), /HTTP 500/u);
  assert.equal(read("runs.log"), "2026-11-22 failed\n");
  assert.match(
    sent.notes.join(","),
    /^Failed: Error: GET \/api\/work\/weekly-notes failed:\. Log: /u,
  );
  assert.deepEqual(sent.comments, []);
});

test("runNightly comments once the fourteenth empty run in a row ends the parallel run", (t) => {
  const { run, sent, logDir } = nightly(t);

  const earlier = Array.from(
    { length: 13 },
    (_, day) => `2026-11-${String(day + 1).padStart(2, "0")} empty`,
  );

  writeFileSync(
    path.join(logDir, "runs.log"),
    `2026-10-31 differs 2026-W44\n${earlier.join("\n")}\n`,
  );

  run(() => []);
  run(() => [], "2026-11-23");

  assert.deepEqual(sent.comments, [
    "Reported an empty diff for 14 nights in a row, ending 2026-11-22.",
  ]);
});

test("runNightly counts a streak that starts the run log", (t) => {
  const { run, sent, logDir } = nightly(t);
  writeFileSync(path.join(logDir, "runs.log"), "2026-11-09 empty\n".repeat(13));

  run(() => []);

  assert.equal(sent.comments.length, 1);
});

test("launchAgent runs the command nightly at 22:30 with the given PATH, escaping XML", () => {
  const plist = launchAgent(["/usr/bin/env", "node", "/repo/a&b.ts"], "/bin:/usr/bin", "/logs");

  assert.match(plist, /<string>\/repo\/a&amp;b\.ts<\/string>/u);
  assert.match(plist, /<key>PATH<\/key>\n\s*<string>\/bin:\/usr\/bin<\/string>/u);
  assert.match(
    plist,
    /<key>Hour<\/key>\n\s*<integer>22<\/integer>\n\s*<key>Minute<\/key>\n\s*<integer>30<\/integer>/u,
  );
  assert.match(plist, /<key>StandardOutPath<\/key>\n\s*<string>\/logs\/launchd\.log<\/string>/u);
});
