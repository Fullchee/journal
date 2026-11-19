import assert from "node:assert/strict";
import { test } from "node:test";

import { missingClaudeImports } from "./check-conventions.ts";

const claudeFiles = new Map([
  ["CLAUDE.md", "@AGENTS.md\n"],
  ["worker/CLAUDE.md", "# Worker\n"],
]);

test("missingClaudeImports flags a CLAUDE.md that is missing or lacks the import", () => {
  assert.deepEqual(
    missingClaudeImports(["AGENTS.md", "worker/AGENTS.md", "modules/x/AGENTS.md"], (file) =>
      claudeFiles.get(file),
    ),
    [
      "worker/CLAUDE.md must contain the line @AGENTS.md",
      "modules/x/CLAUDE.md must contain the line @AGENTS.md",
    ],
  );
});
