#!/usr/bin/env node
// Lists each uncovered statement, function and branch arm in a Jest coverage report (default: every suite's report).
import { existsSync } from "node:fs";
import path from "node:path";

import { type FileCoverage, readCoverageReport, SUITE_REPORTS } from "./coverage-report.ts";

const functionGaps = (data: FileCoverage) =>
  Object.entries(data.fnMap)
    .filter(([id]) => data.f[id] === 0)
    .map(([, fn]) => `${fn.loc.start.line} function ${fn.name}`);

const branchGaps = (data: FileCoverage) =>
  Object.entries(data.branchMap).flatMap(([id, branch]) =>
    (data.b[id] ?? [])
      .map((hits, arm) => ({ hits, arm }))
      .filter(({ hits }) => hits === 0)
      .map(({ arm }) => {
        const line = branch.locations[arm]?.start.line ?? branch.loc.start.line;

        return `${line} branch ${branch.type} arm ${arm}`;
      }),
  );

const statementGaps = (data: FileCoverage) =>
  Object.entries(data.statementMap)
    .filter(([id]) => data.s[id] === 0)
    .map(([, statement]) => `${statement.start.line} statement`);

const reportPaths =
  process.argv.length > 2
    ? process.argv.slice(2)
    : SUITE_REPORTS.filter((report) => existsSync(report));

const gaps = reportPaths
  .flatMap((reportPath) => Object.entries(readCoverageReport(reportPath)))
  .flatMap(([file, data]) => {
    const where = path.relative(process.cwd(), file);

    return [...functionGaps(data), ...branchGaps(data), ...statementGaps(data)].map(
      (gap) => `${where}:${gap}`,
    );
  });

process.stdout.write(`${gaps.length > 0 ? gaps.join("\n") : "No coverage gaps."}\n`);
