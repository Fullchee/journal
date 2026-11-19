// Checks repo conventions no linter covers.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const IMPORT_LINE = "@AGENTS.md";

/**
 * Claude Code reads CLAUDE.md, never AGENTS.md, so each AGENTS.md needs a CLAUDE.md beside it that imports it.
 * @returns one problem per AGENTS.md whose CLAUDE.md is missing or lacks the import.
 */
export const missingClaudeImports = (
  agentsFiles: string[],
  readClaude: (file: string) => string | undefined,
): string[] => {
  const problems: string[] = [];

  for (const agents of agentsFiles) {
    const claude = path.join(path.dirname(agents), "CLAUDE.md");
    const lines = readClaude(claude)?.split("\n") ?? [];

    if (!lines.includes(IMPORT_LINE))
      problems.push(`${claude} must contain the line ${IMPORT_LINE}`);
  }

  return problems;
};

const readIfPresent = (file: string): string | undefined =>
  existsSync(file) ? readFileSync(file, "utf8") : undefined;

if (import.meta.main) {
  // oxlint-disable-next-line sonarjs/no-os-command-from-path -- git lives in different folders on macOS and the CI runner
  const agentsFiles = execFileSync("git", ["ls-files", "*AGENTS.md", ":!:.claude/skills/**"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file !== "");

  const problems = missingClaudeImports(agentsFiles, readIfPresent);

  if (problems.length > 0) throw new Error(problems.join("\n"));
}
