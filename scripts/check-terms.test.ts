import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type TestContext, test } from "node:test";

const script = path.join(import.meta.dirname, "check-terms.sh");

// macOS and the Ubuntu runners both ship git here.
const GIT = "/usr/bin/git";

/** A repo with one tracked file, `notes.md`, holding the given lines. */
const makeRepo = (t: TestContext, lines: string[]) => {
  const repo = mkdtempSync(path.join(tmpdir(), "check-terms-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  spawnSync(GIT, ["init", "--quiet", repo]);
  writeFileSync(path.join(repo, "notes.md"), `${lines.join("\n")}\n`);
  spawnSync(GIT, ["add", "notes.md"], { cwd: repo });

  return repo;
};

const check = (repo: string, deniedTerms: string) =>
  spawnSync(script, [], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, DENIED_TERMS: deniedTerms },
  });

test("a denied term fails with its file and line, never the term or the line", (t) => {
  const repo = makeRepo(t, ["first", "a Secret Word here"]);

  const result = check(repo, "unused\n\nsecret word\n");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^notes\.md:2$/m);
  assert.doesNotMatch(result.stdout + result.stderr, /secret word|here/i);
});

test("a clean tree passes", (t) => {
  const repo = makeRepo(t, ["nothing to see"]);

  const result = check(repo, "secret");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /No denied terms/);
});

test("an empty or blank list fails, so a missing secret can't pass the check", (t) => {
  const repo = makeRepo(t, ["nothing to see"]);

  for (const terms of ["", " \n\n"]) {
    const result = check(repo, terms);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /DENIED_TERMS is empty/);
  }
});
