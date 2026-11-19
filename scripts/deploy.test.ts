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

const script = path.join(import.meta.dirname, "deploy.sh");

// macOS and the Ubuntu runners both ship git here.
const GIT = "/usr/bin/git";

// Logs each call as `<tool> <args>`; FAKE_FAIL names the args that exit 1.
const fakeTool = (name: string) => `#!/usr/bin/env bash
echo "${name} $*" >>"$CALL_LOG"
[[ "$*" == "\${FAKE_FAIL:-}" ]] && exit 1
exit 0
`;

/** A clone of a bare origin with one pushed commit, and fake `bun` and `bunx` that log each call. */
const makeRepo = (t: TestContext) => {
  const root = mkdtempSync(path.join(tmpdir(), "deploy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = path.join(root, "origin.git");
  const repo = path.join(root, "repo");
  const bin = path.join(root, "bin");
  const callLog = path.join(root, "calls.log");
  const git = (...args: string[]) => spawnSync(GIT, args, { cwd: repo, encoding: "utf8" });

  spawnSync(GIT, ["init", "--quiet", "--bare", "--initial-branch=main", origin]);
  spawnSync(GIT, ["clone", "--quiet", origin, repo]);
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "--allow-empty", "-m", "a");
  git("push", "--quiet", "origin", "HEAD:main");
  mkdirSync(bin);

  for (const name of ["bun", "bunx"]) {
    writeFileSync(path.join(bin, name), fakeTool(name));
    chmodSync(path.join(bin, name), 0o755);
  }

  return {
    repo,
    git,
    deploy: (env = {}) =>
      spawnSync(script, {
        cwd: repo,
        encoding: "utf8",
        env: {
          ...process.env,
          ...env,
          CALL_LOG: callLog,
          PATH: `${bin}:${process.env["PATH"] ?? ""}`,
        },
      }),
    calls: () => (existsSync(callLog) ? readFileSync(callLog, "utf8").trim().split("\n") : []),
  };
};

test("checks, builds, migrates and deploys origin/main in order", (t) => {
  const { deploy, calls } = makeRepo(t);
  assert.equal(deploy().status, 0);
  assert.deepEqual(calls(), [
    "bun run check",
    "bunx expo export -p web",
    "bunx wrangler@4 d1 migrations apply fullchee-dashboard --remote",
    "bunx wrangler@4 deploy",
  ]);
});

test("refuses a checkout with uncommitted changes", (t) => {
  const { repo, deploy, calls } = makeRepo(t);
  writeFileSync(path.join(repo, "draft.txt"), "wip");
  const result = deploy();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Commit or stash/);
  assert.deepEqual(calls(), []);
});

test("refuses a commit that is not on origin/main", (t) => {
  const { git, deploy, calls } = makeRepo(t);
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "--allow-empty", "-m", "b");
  const result = deploy();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Check out origin\/main/);
  assert.deepEqual(calls(), []);
});

test("ships nothing when the checks fail", (t) => {
  const { deploy, calls } = makeRepo(t);
  assert.equal(deploy({ FAKE_FAIL: "run check" }).status, 1);
  assert.deepEqual(calls(), ["bun run check"]);
});
