// Diffs each weekly note D1 archives against the work-log vault's, for Phase 3's two-week parallel run (#15).
// Usage: node scripts/vault-diff.ts <work-log path> [--nightly | --install]
//   (none)     prints each difference and exits 1 on any
//   --nightly  logs the run, and on a difference or failure notifies and comments the weeks and line numbers on #15
//   --install  schedules --nightly with launchd at 22:30 each night, from this checkout
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import path from "node:path";
import * as z from "zod/mini";

import { diffNoteLines, formatHunk, hunkHeading } from "../src/core/work/note-diff.ts";
import { fetchNotes, journalApi, readWeeklyNotes } from "./import-work-log.ts";

/** A week whose notes differ: `headings` name the lines without their text; `lines` add the text. */
export interface WeekDiff {
  week: string;
  headings: string[];
  lines: string[];
}

const whole = (week: string, heading: string): WeekDiff => ({
  week,
  headings: [`${week}: ${heading}`],
  lines: [`${week}: ${heading}`],
});

/** Each week whose vault note and D1 `raw_md` differ after whitespace normalising, or that only one side holds. */
export function diffWeeks(
  vault: readonly { week: string; md: string }[],
  stored: readonly { week: string; raw_md: string }[],
): WeekDiff[] {
  const storedMd = new Map(stored.map(({ week, raw_md }) => [week, raw_md]));
  const diffs: WeekDiff[] = [];

  for (const { week, md } of vault) {
    const d1 = storedMd.get(week);
    storedMd.delete(week);

    if (d1 === undefined) {
      diffs.push(whole(week, "missing from D1"));
      continue;
    }

    const hunks = diffNoteLines(md, d1);

    if (hunks.length > 0) {
      diffs.push({
        week,
        headings: hunks.map((hunk) => hunkHeading(week, hunk)),
        lines: hunks.flatMap((hunk) => formatHunk(week, hunk)),
      });
    }
  }

  for (const week of storedMd.keys()) diffs.push(whole(week, "only in D1"));

  return diffs;
}

/** The parallel run ends after this many empty nights in a row. */
const STREAK_GOAL = 14;

export interface Nightly {
  today: string;
  logDir: string;
  notify: (message: string) => void;
  comment: (body: string) => void;
}

const isEmptyRun = (line: string | undefined) => line?.endsWith(" empty") === true;

/** Whether the run log, one `<day> <result>` line per run, has just reached the goal's streak of empty runs. */
function reachedStreak(runLog: string) {
  const results = readFileSync(runLog, "utf8").trimEnd().split("\n");
  const streak = results.slice(-STREAK_GOAL);

  return (
    streak.length === STREAK_GOAL &&
    streak.every((line) => isEmptyRun(line)) &&
    !isEmptyRun(results.at(-STREAK_GOAL - 1))
  );
}

/**
 * One nightly run: writes the full diff to `<logDir>/<today>.txt` and the result to `runs.log`. A difference or a
 * failure notifies; a difference also comments its weeks and line numbers, never their text, as #15 is public.
 */
export function runNightly(diff: () => WeekDiff[], nightly: Nightly) {
  const { today, logDir, notify, comment } = nightly;
  const runLog = path.join(logDir, "runs.log");
  const report = path.join(logDir, `${today}.txt`);
  mkdirSync(logDir, { recursive: true });
  let diffs: WeekDiff[];

  try {
    diffs = diff();
  } catch (error) {
    writeFileSync(report, `${String(error)}\n`);
    appendFileSync(runLog, `${today} failed\n`);
    notify(`Failed: ${String(error).split("\n", 1)[0]}. Log: ${report}`);

    return;
  }

  if (diffs.length === 0) {
    writeFileSync(report, "No differences.\n");
    appendFileSync(runLog, `${today} empty\n`);

    if (reachedStreak(runLog)) {
      comment(`Reported an empty diff for ${STREAK_GOAL} nights in a row, ending ${today}.`);
    }

    return;
  }

  const weeks = diffs.map(({ week }) => week);
  writeFileSync(report, `${diffs.flatMap(({ lines }) => lines).join("\n")}\n`);
  appendFileSync(runLog, `${today} differs ${weeks.join(",")}\n`);
  notify(`${weeks.length} weeks differ: ${weeks.join(", ")}. Log: ${report}`);
  comment(
    [
      `Found ${weeks.length} weeks where D1 differs from the vault in the ${today} nightly diff:`,
      "",
      ...diffs.flatMap(({ headings }) => headings.map((heading) => `- ${heading}`)),
    ].join("\n"),
  );
}

const LABEL = "com.fullchee.journal-vault-diff";

const xml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const xmlStrings = (values: readonly string[]) =>
  values.map((value) => `      <string>${xml(value)}</string>`).join("\n");

/** A launchd agent running `args` at 22:30 each night; launchd runs a missed time once the Mac wakes. */
export function launchAgent(args: readonly string[], envPath: string, logDir: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${xmlStrings(args)}
    </array>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${xml(envPath)}</string>
    </dict>
    <key>StartCalendarInterval</key>
    <dict>
      <key>Hour</key>
      <integer>22</integer>
      <key>Minute</key>
      <integer>30</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${xml(path.join(logDir, "launchd.log"))}</string>
    <key>StandardErrorPath</key>
    <string>${xml(path.join(logDir, "launchd.log"))}</string>
  </dict>
</plist>
`;
}

const LOG_DIR = path.join(homedir(), "Library/Logs/journal-vault-diff");

function run(
  command: string,
  args: readonly string[],
  options: { input?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });

  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed: ${result.stderr}`);

  return result.stdout;
}

/** Writes the agent into ~/Library/LaunchAgents and (re)loads it, with this shell's PATH so node and gh resolve. */
function install(workLog: string) {
  const plist = path.join(homedir(), "Library/LaunchAgents", `${LABEL}.plist`);
  const args = ["/usr/bin/env", "node", import.meta.filename, path.resolve(workLog), "--nightly"];
  const domain = `gui/${userInfo().uid}`;
  const { PATH = "" } = process.env;
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(plist, launchAgent(args, PATH, LOG_DIR));
  // bootout fails when the agent isn't loaded yet; bootstrap then loads it fresh.
  spawnSync("/bin/launchctl", ["bootout", domain, plist]);
  run("/bin/launchctl", ["bootstrap", domain, plist]);
  process.stdout.write(`Scheduled ${LABEL} at 22:30 nightly; logs in ${LOG_DIR}\n`);
}

const notify = (message: string) =>
  run("/usr/bin/osascript", [
    "-e",
    `display notification ${JSON.stringify(message)} with title "Journal vault diff"`,
  ]);

/** Comments on #15 as the owner's personal account, which `gh` may not have active. */
const comment = (body: string) => {
  const token = run("gh", ["auth", "token", "--user", "Fullchee"]).trim();
  run("gh", ["issue", "comment", "15", "--repo", "Fullchee/journal", "--body-file", "-"], {
    input: body,
    env: { ...process.env, GH_TOKEN: token },
  });
};

const Args = z.tuple([z.string(), z.optional(z.enum(["--nightly", "--install"]))]);

if (import.meta.main) {
  const args = Args.safeParse(process.argv.slice(2));

  if (!args.success) {
    throw new Error("Usage: node scripts/vault-diff.ts <work-log path> [--nightly | --install]");
  }

  const [workLog, flag] = args.data;

  const diff = () =>
    diffWeeks(
      readWeeklyNotes(workLog, (file) =>
        process.stderr.write(`Skipped ${file}: its name holds no week\n`),
      ),
      fetchNotes(journalApi),
    );

  if (flag === "--install") {
    install(workLog);
  } else if (flag === "--nightly") {
    runNightly(diff, {
      today: new Date().toLocaleDateString("en-CA"),
      logDir: LOG_DIR,
      notify,
      comment,
    });
  } else {
    const diffs = diff();

    for (const { lines } of diffs) process.stdout.write(`${lines.join("\n")}\n`);

    if (diffs.length > 0) throw new Error(`${diffs.length} weeks differ between D1 and the vault.`);
    process.stdout.write("No differences.\n");
  }
}
