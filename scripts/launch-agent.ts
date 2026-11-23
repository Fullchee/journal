// Nightly launchd agents for the Mac scripts. scripts/screen-time.ts runs on a Mac that may have no node_modules,
// so this file imports only Node built-ins.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import path from "node:path";

/** A nightly agent: launchd runs `args` at `hour`:`minute`, and runs a missed time once the Mac wakes. */
export interface LaunchAgent {
  label: string;
  args: readonly string[];
  hour: number;
  minute: number;
  logDir: string;
}

const xml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const xmlStrings = (values: readonly string[]) =>
  values.map((value) => `      <string>${xml(value)}</string>`).join("\n");

/** The agent's plist, with `envPath` as its PATH so node and gh resolve. */
export function launchAgent({ label, args, hour, minute, logDir }: LaunchAgent, envPath: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${xml(label)}</string>
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
      <integer>${hour}</integer>
      <key>Minute</key>
      <integer>${minute}</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${xml(path.join(logDir, "launchd.log"))}</string>
    <key>StandardErrorPath</key>
    <string>${xml(path.join(logDir, "launchd.log"))}</string>
  </dict>
</plist>
`;
}

/** Writes the agent into ~/Library/LaunchAgents and (re)loads it, with this shell's PATH. */
export function installAgent(agent: LaunchAgent) {
  const plist = path.join(homedir(), "Library/LaunchAgents", `${agent.label}.plist`);
  const domain = `gui/${userInfo().uid}`;
  const { PATH = "" } = process.env;
  mkdirSync(agent.logDir, { recursive: true });
  writeFileSync(plist, launchAgent(agent, PATH));
  // bootout fails when the agent isn't loaded yet; bootstrap then loads it fresh.
  spawnSync("/bin/launchctl", ["bootout", domain, plist]);
  const loaded = spawnSync("/bin/launchctl", ["bootstrap", domain, plist], { encoding: "utf8" });

  if (loaded.status !== 0) throw new Error(`launchctl bootstrap failed: ${loaded.stderr}`);
  const time = `${agent.hour}:${String(agent.minute).padStart(2, "0")}`;
  process.stdout.write(`Scheduled ${agent.label} at ${time} nightly; logs in ${agent.logDir}\n`);
}
