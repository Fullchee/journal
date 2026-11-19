// Fallow reads one coverage map, but each Jest suite writes its own; core code runs under several suites, so hit counts add up.
import { existsSync, writeFileSync } from "node:fs";
import libCoverage from "istanbul-lib-coverage";

import { readCoverageMapData, SUITE_REPORTS } from "./coverage-report.ts";

const map = libCoverage.createCoverageMap({});
const missing = SUITE_REPORTS.filter((report) => !existsSync(report));

// CI runs this step after a failed test step, so name that cause instead of blaming the merge.
if (missing.length > 0) {
  throw new Error(
    `Missing ${missing.join(", ")}: \`bun run test\` writes these files, so a Jest suite that failed wrote none. Check the test step above; locally, run \`bun run test\` before \`bun run fallow\`.`,
  );
}

for (const report of SUITE_REPORTS) {
  map.merge(readCoverageMapData(report));
}

writeFileSync("coverage/coverage-final.json", JSON.stringify(map.toJSON()));
