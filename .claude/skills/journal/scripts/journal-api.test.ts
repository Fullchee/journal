// Runs journal-api.sh against fake cloudflared and curl, so nothing reaches the network.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const SCRIPT = path.join(import.meta.dirname, "journal-api.sh");

const FAKE_CLOUDFLARED = `#!/usr/bin/env bash
echo "$@" >> "$CALLS"
[[ "$1 $2" == "access token" && ! -f "$LOGGED_OUT" ]] && echo tok && exit 0
[[ "$1 $2" == "access login" ]] && rm -f "$LOGGED_OUT" && exit 0
exit 1
`;

// Mimics curl's \`-w\` trailer: the body, then a line with the status and content type.
const FAKE_CURL = String.raw`#!/usr/bin/env bash
echo "$@" >> "$CALLS"
printf '%s\n%s' "$BODY" "$TRAILER"
`;

interface FakeEnv extends NodeJS.ProcessEnv {
  CALLS: string;
  LOGGED_OUT: string;
}

function fakeEnv(): FakeEnv {
  const dir = mkdtempSync(path.join(tmpdir(), "journal-api-"));
  const bin = path.join(dir, "bin");

  mkdirSync(bin);

  for (const [name, text] of [
    ["cloudflared", FAKE_CLOUDFLARED],
    ["curl", FAKE_CURL],
  ] as const) {
    writeFileSync(path.join(bin, name), text);
    chmodSync(path.join(bin, name), 0o755);
  }

  return {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin`,
    CALLS: path.join(dir, "calls"),
    LOGGED_OUT: path.join(dir, "logged-out"),
    BODY: '{"id":1}',
    TRAILER: "201 application/json",
  };
}

const run = (env: NodeJS.ProcessEnv, ...args: string[]) =>
  spawnSync("/bin/bash", [SCRIPT, ...args], { env, encoding: "utf8" });

const calls = (env: FakeEnv) => readFileSync(env.CALLS, "utf8");

test("a wrong argument count prints the usage", () => {
  const result = run(process.env);

  assert.deepEqual([result.status, result.stderr.includes("Usage:")], [2, true]);
});

test("a success prints the status and body and sends the token", () => {
  const env = fakeEnv();
  const result = run(env, "POST", "/api/check-ins", '{"score": 5}');

  assert.deepEqual([result.status, result.stdout], [0, 'HTTP 201\n{"id":1}\n']);
  assert.ok(calls(env).includes("cf-access-token: tok"));
});

test("it calls the journal Worker unless JOURNAL_URL says otherwise", () => {
  const env = fakeEnv();

  run(env, "GET", "/api/habits");
  run({ ...env, JOURNAL_URL: "https://other.test" }, "GET", "/api/me");

  assert.ok(calls(env).includes("https://journal.fullchee.workers.dev/api/habits"));
  assert.ok(calls(env).includes("https://other.test/api/me"));
});

for (const [id, trailer, message] of [
  ["api_error", "400 application/json", ""],
  ["access_login_page", "200 text/html", "Access rejected the token"],
] as const) {
  test(`a failure exits non-zero: ${id}`, () => {
    const result = run({ ...fakeEnv(), TRAILER: trailer }, "GET", "/api/habits");

    assert.deepEqual([result.status, result.stderr.includes(message)], [1, true]);
  });
}

test("an expired session logs in before calling", () => {
  const env = fakeEnv();

  writeFileSync(env.LOGGED_OUT, "");
  const result = run(env, "GET", "/api/habits");

  assert.equal(result.status, 0, result.stderr);
  assert.ok(calls(env).includes("access login --quiet"));
});

test("an empty reply prints only the status", () => {
  const result = run({ ...fakeEnv(), BODY: "", TRAILER: "204 " }, "POST", "/api/habits", "{}");

  assert.deepEqual([result.status, result.stdout], [0, "HTTP 204\n"]);
});

test("an @file body goes to curl as a file to read", () => {
  const env = fakeEnv();

  run(env, "POST", "/api/habits", "@/tmp/habit.json");

  assert.ok(calls(env).includes("--data-binary @/tmp/habit.json"));
});

test("a missing cloudflared says how to install it", () => {
  const env = fakeEnv();
  const result = run({ ...env, PATH: "/usr/bin:/bin" }, "GET", "/api/habits");

  assert.deepEqual([result.status, result.stderr.includes("brew install cloudflared")], [1, true]);
});
