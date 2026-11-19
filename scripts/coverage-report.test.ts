import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type TestContext, test } from "node:test";

import { readCoverageMapData, readCoverageReport } from "./coverage-report.ts";

const range = { start: { line: 3, column: 0 }, end: { line: 3, column: 9 } };

// Shaped like Jest's output: an `if` with no `else` leaves its second arm's location empty, and extra fields ride along.
const REPORT = {
  "/repo/src/a.ts": {
    path: "/repo/src/a.ts",
    statementMap: { 0: range },
    fnMap: { 0: { name: "a", decl: range, loc: range, line: 3 } },
    branchMap: { 0: { type: "if", loc: range, locations: [range, { start: {}, end: {} }] } },
    s: { 0: 1 },
    f: { 0: 1 },
    b: { 0: [1, 0] },
    hash: "abc",
  },
};

const REPORT_JSON = JSON.stringify(REPORT);

const writeReport = (t: TestContext, json: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), "coverage-report-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "coverage-final.json");
  writeFileSync(file, json);

  return file;
};

test("readCoverageReport accepts an else arm with no location", (t) => {
  const report = readCoverageReport(writeReport(t, REPORT_JSON));

  assert.equal(report["/repo/src/a.ts"]?.branchMap["0"]?.locations[1]?.start.line, undefined);
});

test("readCoverageMapData hands istanbul the report unchanged", (t) => {
  assert.deepEqual(readCoverageMapData(writeReport(t, REPORT_JSON)), REPORT);
});

test("both readers reject a file that is not a coverage report", (t) => {
  const file = writeReport(t, JSON.stringify({ "/repo/src/a.ts": { path: "/repo/src/a.ts" } }));

  assert.throws(() => readCoverageReport(file));
  assert.throws(() => readCoverageMapData(file));
});
