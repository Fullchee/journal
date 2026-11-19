// Reads the coverage-final.json each Jest suite writes.
import { readFileSync } from "node:fs";
import type { CoverageMapData } from "istanbul-lib-coverage";
import * as z from "zod/mini";

const SUITES = ["core", "app", "worker"];

export const SUITE_REPORTS = SUITES.map((suite) => `coverage/${suite}/coverage-final.json`);

const Range = z.looseObject({ start: z.looseObject({ line: z.number() }) });

// An `if` with no `else` still gets a second arm, whose location is `{}`.
const ArmStart = z.looseObject({ line: z.optional(z.number()) });
const ArmRange = z.looseObject({ start: ArmStart });

const FunctionMapping = z.looseObject({ name: z.string(), loc: Range });
const BranchMapping = z.looseObject({ type: z.string(), loc: Range, locations: z.array(ArmRange) });

const Hits = z.record(z.string(), z.number());
const ArmHits = z.record(z.string(), z.array(z.number()));

const FileCoverage = z.looseObject({
  statementMap: z.record(z.string(), Range),
  fnMap: z.record(z.string(), FunctionMapping),
  branchMap: z.record(z.string(), BranchMapping),
  s: Hits,
  f: Hits,
  b: ArmHits,
});

export type FileCoverage = z.infer<typeof FileCoverage>;

const CoverageReport = z.record(z.string(), FileCoverage);

const readReport = <T>(reportPath: string, schema: z.ZodMiniType<T>): T =>
  schema.parse(JSON.parse(readFileSync(reportPath, "utf8")));

/** Each covered file's report, keyed by its absolute path. */
export const readCoverageReport = (reportPath: string): Record<string, FileCoverage> =>
  readReport(reportPath, CoverageReport);

// @types/istanbul-lib-coverage requires a `line` on every location, which Jest leaves off an `else` arm, so the
// report is checked against the schema above and handed to istanbul unchanged.
const IstanbulReport = z.custom<CoverageMapData>(
  (report) => CoverageReport.safeParse(report).success,
);

export const readCoverageMapData = (reportPath: string): CoverageMapData =>
  readReport(reportPath, IstanbulReport);
