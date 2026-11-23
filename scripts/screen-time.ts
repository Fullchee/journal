// Sends this Mac's screen-on minutes per Day to the journal (#32), read from `pmset -g log`, which needs no permission.
// Usage: node scripts/screen-time.ts <device> [--install]
//   (none)     posts every whole Day the log covers, plus today so far
//   --install  schedules the send with launchd at 23:50 each night, from this checkout
// It calls /api/screen-time/mac with the Access service token that scripts/setup-screen-time.sh keeps in the
// Keychain. A work Mac needs only Node and a clone of this public repo: the script imports no packages.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

import {
  DEVICE_NAME,
  screenMinutes,
  windowAfter,
  type ScreenEvent,
} from "../src/core/screen-time.ts";
import { installAgent } from "./launch-agent.ts";

// e.g. "2026-11-20 08:15:03 -0500 Notification        \tDisplay is turned on"
const STAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2}) /u;
const DISPLAY = /Display is turned (on|off)\b/u;

/** The display's on and off events in a `pmset -g log` dump, and when the log starts; null for a log with no stamps. */
export function parsePmsetLog(log: string) {
  const events: ScreenEvent[] = [];
  let start: number | null = null;

  for (const line of log.split("\n")) {
    const stamp = STAMP.exec(line);

    if (stamp === null) continue;
    const [, day, time, hours, minutes] = stamp;
    const at = Date.parse(`${day}T${time}${hours}:${minutes}`);
    start ??= at;
    const display = DISPLAY.exec(line);

    if (display !== null) events.push({ at, on: display[1] === "on" });
  }

  return { start, events };
}

const ENDPOINT = "https://journal.fullchee.workers.dev/api/screen-time/mac";

/** The Keychain service holding the Access service token's client id and secret, as two accounts. */
const KEYCHAIN_SERVICE = "journal-screen-time";

function keychain(account: string) {
  const found = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
    { encoding: "utf8" },
  );

  if (found.status !== 0) {
    throw new Error(`No ${account} in the Keychain. Run scripts/setup-screen-time.sh first.`);
  }

  return found.stdout.trim();
}

async function send(device: string) {
  const log = spawnSync("/usr/bin/pmset", ["-g", "log"], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });

  if (log.status !== 0) throw new Error(`pmset -g log failed: ${log.stderr}`);
  const { start, events } = parsePmsetLog(log.stdout);

  if (start === null) throw new Error("pmset -g log has no timestamped lines.");
  const days = screenMinutes(events, windowAfter(start, Date.now()));

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "CF-Access-Client-Id": keychain("client-id"),
      "CF-Access-Client-Secret": keychain("client-secret"),
    },
    body: JSON.stringify({ device, days }),
  });

  if (
    !response.ok ||
    !(response.headers.get("content-type") ?? "").startsWith("application/json")
  ) {
    throw new Error(
      `POST ${ENDPOINT} returned HTTP ${response.status}: Access or the API refused it.`,
    );
  }

  process.stdout.write(`${new Date().toISOString()} sent ${days.length} Days as ${device}\n`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const [device = ""] = args;
  const install = args[1] === "--install";

  if (!DEVICE_NAME.test(device) || args.length !== (install ? 2 : 1)) {
    throw new Error(
      "Usage: node scripts/screen-time.ts <device> [--install]\n<device> is lowercase letters, digits and dashes, e.g. work-mac.",
    );
  }

  if (install) {
    keychain("client-id");
    installAgent({
      label: "com.fullchee.journal-screen-time",
      args: ["/usr/bin/env", "node", import.meta.filename, device],
      hour: 23,
      minute: 50,
      logDir: path.join(homedir(), "Library/Logs/journal-screen-time"),
    });
  } else {
    await send(device);
  }
}
