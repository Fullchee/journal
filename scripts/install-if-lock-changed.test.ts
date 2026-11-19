import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type TestContext, test } from "node:test";

const script = path.join(import.meta.dirname, "install-if-lock-changed.sh");

const fakeBun = `#!/usr/bin/env bash
echo "$*" >>"$BUN_LOG"
exit "\${FAKE_BUN_EXIT:-0}"
`;

/** A temp repo root with node_modules and a fake `bun` that logs each call. */
const makeRepo = (t: TestContext) => {
  const repo = mkdtempSync(path.join(tmpdir(), "install-if-lock-changed-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const bin = path.join(repo, "bin");
  const bunLog = path.join(repo, "bun-calls.log");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "bun"), fakeBun);
  chmodSync(path.join(bin, "bun"), 0o755);
  mkdirSync(path.join(repo, "node_modules"));

  return {
    writeLock: (text: string) => writeFileSync(path.join(repo, "bun.lock"), text),
    runHook: (env = {}) =>
      spawnSync(script, {
        cwd: repo,
        encoding: "utf8",
        env: {
          ...process.env,
          ...env,
          BUN_LOG: bunLog,
          PATH: `${bin}:${process.env["PATH"] ?? ""}`,
        },
      }),
    bunCalls: () => (existsSync(bunLog) ? readFileSync(bunLog, "utf8").trim().split("\n") : []),
  };
};

test("skips a commit that predates bun.lock", (t) => {
  const { runHook, bunCalls } = makeRepo(t);
  assert.equal(runHook().status, 0);
  assert.deepEqual(bunCalls(), []);
});

test("installs once, then skips while bun.lock is unchanged", (t) => {
  const { writeLock, runHook, bunCalls } = makeRepo(t);
  writeLock("v1");
  runHook();
  runHook();
  assert.deepEqual(bunCalls(), ["install --frozen-lockfile"]);
});

test("installs again when bun.lock changes", (t) => {
  const { writeLock, runHook, bunCalls } = makeRepo(t);
  writeLock("v1");
  runHook();
  writeLock("v2");
  runHook();
  assert.equal(bunCalls().length, 2);
});

test("retries on the next run after a failed install", (t) => {
  const { writeLock, runHook, bunCalls } = makeRepo(t);
  writeLock("v1");
  assert.equal(runHook({ FAKE_BUN_EXIT: "1" }).status, 1);
  runHook();
  assert.equal(bunCalls().length, 2);
});
