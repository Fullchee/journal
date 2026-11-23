import assert from "node:assert/strict";
import { test } from "node:test";

import { launchAgent } from "./launch-agent.ts";

test("launchAgent runs the command nightly at its time with the given PATH, escaping XML", () => {
  const plist = launchAgent(
    {
      label: "com.example.nightly",
      args: ["/usr/bin/env", "node", "/repo/a&b.ts"],
      hour: 22,
      minute: 30,
      logDir: "/logs",
    },
    "/bin:/usr/bin",
  );

  assert.match(plist, /<string>com\.example\.nightly<\/string>/u);
  assert.match(plist, /<string>\/repo\/a&amp;b\.ts<\/string>/u);
  assert.match(plist, /<key>PATH<\/key>\n\s*<string>\/bin:\/usr\/bin<\/string>/u);
  assert.match(
    plist,
    /<key>Hour<\/key>\n\s*<integer>22<\/integer>\n\s*<key>Minute<\/key>\n\s*<integer>30<\/integer>/u,
  );
  assert.match(plist, /<key>StandardOutPath<\/key>\n\s*<string>\/logs\/launchd\.log<\/string>/u);
});
