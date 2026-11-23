import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePmsetLog } from "./screen-time.ts";

const LOG = [
  "PM ASL data store: /var/log/powermanagement",
  "2026-11-09 20:36:25 -0500 Assertions          \tPID 42(exampled) Created MaintenanceWake",
  "2026-11-10 08:10:52 -0500 Notification        \tDisplay is turned on   \t",
  "2026-11-10 08:11:02 -0500 Sleep               \tEntering Sleep state due to 'Idle Sleep'",
  "2026-11-10 09:06:38 -0500 Notification        \tDisplay is turned off  \t",
  "",
].join("\n");

test("parsePmsetLog reads the display events and when the log starts", () => {
  assert.deepEqual(parsePmsetLog(LOG), {
    start: Date.parse("2026-11-10T01:36:25Z"),
    events: [
      { at: Date.parse("2026-11-10T13:10:52Z"), on: true },
      { at: Date.parse("2026-11-10T14:06:38Z"), on: false },
    ],
  });
});

test("parsePmsetLog gives no start for a log without timestamps", () => {
  assert.deepEqual(parsePmsetLog("PM ASL data store: /var/log/powermanagement\n"), {
    start: null,
    events: [],
  });
});
