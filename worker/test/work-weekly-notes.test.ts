import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NoteExtraction } from "@/core";
import type { Env } from "@worker/lib/env";
import worker from "@worker/index";
import * as z from "zod/mini";
import { accessJwt, apiRequest, makeEnv } from "./helpers/env";

const SERVICE = { "Cf-Access-Jwt-Assertion": accessJwt({ common_name: "work-log.access" }) };

const URL = "https://journal.fullchee.workers.dev/api/work/weekly-notes";

const W45 = readFileSync(
  path.join(__dirname, "../../src/core/__tests__/fixtures/weekly-notes/2026-W45.md"),
  "utf8",
);

interface NoteRow {
  week: string;
  md: string;
  extraction?: NoteExtraction;
}

const post = (env: Env, rows: readonly NoteRow[]) =>
  worker.fetch(
    apiRequest("POST", URL, { body: { rows: rows.map((row) => ({ ...row })) }, headers: SERVICE }),
    env,
  );

async function postOk(env: Env, rows: readonly NoteRow[]) {
  const res = await post(env, rows);
  assert.equal(res.status, 200, await res.clone().text());

  return res.json();
}

const ParsedEntry = z.object({ ticket: z.nullable(z.string()) });

const TicketKey = z.object({ key: z.string() });

const ParsedNote = z.object({
  entries: z.array(ParsedEntry),
  code_reviews: z.array(z.unknown()),
  tickets: z.array(TicketKey),
});

const ParsedNotes = z.object({ notes: z.array(ParsedNote) });

const list = async (env: Env, query = "") =>
  (await worker.fetch(apiRequest("GET", `${URL}${query}`, { headers: SERVICE }), env)).json();

const OLD = [
  "## Summary",
  "- Wed",
  "\t- [x] Submitted [a PR](https://github.com/Acme/backend-core/pull/7)",
  "\t\t- tests pass",
  "\t- blocked on [APP-3](https://acme.atlassian.net/browse/APP-3)",
  "- loose line",
  "",
].join("\n");

const OLD_EXTRACTION: NoteExtraction = {
  skip: ["- Wed"],
  entries: [
    {
      source: "\t- [x] Submitted [a PR](https://github.com/Acme/backend-core/pull/7)",
      day: "2025-01-22",
      kind: "task",
      text: "Submitted",
      pr: "backend-core#7",
    },
    { source: "\t\t- tests pass", day: "2025-01-22", kind: "note", text: "tests pass" },
    {
      source: "\t- blocked on [APP-3](https://acme.atlassian.net/browse/APP-3)",
      day: "2025-01-22",
      kind: "blocker",
      text: "blocked on",
      ticket: "APP-3",
    },
    { source: "- gone", day: null, kind: "note", text: "gone" },
  ],
};

test("a note's entries come back typed and nested, with what was left over and stale", async () => {
  const env = makeEnv();

  const posted = await postOk(env, [{ week: "2025-W04", md: OLD, extraction: OLD_EXTRACTION }]);

  assert.deepEqual(posted, {
    upserted: 1,
    leftovers: ["2025-W04:6 - loose line"],
    stale: ['2025-W04: no line "- gone"'],
  });

  const { notes } = await list(env);

  assert.deepEqual(notes, [
    {
      week: "2025-W04",
      raw_md: OLD,
      entries: [
        {
          day: "2025-01-22",
          position: 0,
          parent: null,
          kind: "task",
          text: "Submitted",
          ticket: null,
          pr: "backend-core#7",
          done: true,
        },
        {
          day: "2025-01-22",
          position: 1,
          parent: 0,
          kind: "note",
          text: "tests pass",
          ticket: null,
          pr: null,
          done: null,
        },
        {
          day: "2025-01-22",
          position: 2,
          parent: null,
          kind: "blocker",
          text: "blocked on",
          ticket: "APP-3",
          pr: null,
          done: null,
        },
        {
          day: null,
          position: 3,
          parent: null,
          kind: "note",
          text: "loose line",
          ticket: null,
          pr: null,
          done: null,
        },
      ],
      code_reviews: [],
      tickets: [{ key: "APP-3", title: "", url: "https://acme.atlassian.net/browse/APP-3" }],
      pull_requests: [
        {
          ref: "backend-core#7",
          repo: "backend-core",
          number: 7,
          url: "https://github.com/Acme/backend-core/pull/7",
          title: "",
          ticket: null,
          state: null,
        },
      ],
    },
  ]);
});

test("a `####` note parses its Ticket, PR and Code review bullets; ?week= returns only that week", async () => {
  const env = makeEnv();
  await postOk(env, [
    { week: "2025-W04", md: OLD },
    { week: "2026-W45", md: W45 },
  ]);

  const { notes } = ParsedNotes.parse(await list(env, "?week=2026-W45"));
  const [note = ParsedNote.parse({ entries: [], code_reviews: [], tickets: [] })] = notes;

  assert.equal(notes.length, 1);
  assert.equal(note.code_reviews.length, 3);
  assert.ok(note.entries.some(({ ticket }) => ticket === "APP-135"));
  assert.ok(note.tickets.some(({ key }) => key === "APP-135"));
  assert.equal((await list(env)).notes.length, 2);
});

test("a repost replaces the week's entries; a note never replaces a stored Ticket title", async () => {
  const env = makeEnv();
  await postOk(env, [{ week: "2026-W45", md: W45 }]);
  await env.DB.prepare("UPDATE tickets SET title = 'From Jira' WHERE key = 'APP-135'").bind().run();

  const monday = [
    "#### Mon, Nov 2",
    "",
    "- ✅ [APP-135](https://acme.atlassian.net/browse/APP-135): Recipe list missing",
    "",
  ].join("\n");

  await postOk(env, [{ week: "2026-W45", md: monday }]);

  const [note] = (await list(env)).notes;

  assert.equal(note.raw_md, monday);
  assert.equal(note.entries.length, 1);
  assert.deepEqual(note.code_reviews, []);
  assert.deepEqual(note.tickets, [
    {
      key: "APP-135",
      title: "From Jira",
      url: "https://acme.atlassian.net/browse/APP-135",
    },
  ]);
});

test("a bare Ticket keeps the URL a later note links", async () => {
  const env = makeEnv();

  const bare: NoteExtraction = {
    entries: [
      {
        source: "- clean up APP-102",
        day: null,
        kind: "task",
        text: "clean up APP-102",
        ticket: "APP-102",
      },
    ],
  };

  await postOk(env, [{ week: "2026-W44", md: "- clean up APP-102\n", extraction: bare }]);
  await postOk(env, [
    {
      week: "2026-W46",
      md: "- [x] [APP-102](https://acme.atlassian.net/browse/APP-102)\n",
    },
  ]);
  await postOk(env, [{ week: "2026-W44", md: "- clean up APP-102\n", extraction: bare }]);

  const [note] = (await list(env, "?week=2026-W44")).notes;

  assert.deepEqual(note.tickets, [
    { key: "APP-102", title: "", url: "https://acme.atlassian.net/browse/APP-102" },
  ]);
});

test("GET refuses a week that is not an ISO week", async () => {
  const res = await worker.fetch(
    apiRequest("GET", `${URL}?week=2026-45`, { headers: SERVICE }),
    makeEnv(),
  );

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid week" });
});

test("a week with no note text is not a weekly note", async () => {
  const env = makeEnv();

  const res = await worker.fetch(
    apiRequest("POST", "https://journal.fullchee.workers.dev/api/work/weeks", {
      body: { rows: [{ week: "2026-W45", reviews: 3 }] },
      headers: SERVICE,
    }),
    env,
  );

  assert.equal(res.status, 200);

  assert.deepEqual(await list(env), { notes: [] });
});

test.each<[string, NoteRow]>([
  ["a heading for a day outside its week", { week: "2026-W45", md: "#### Mon, Nov 9\n" }],
  ["a malformed week", { week: "2026-45", md: W45 }],
  [
    "an extracted PR it never links",
    {
      week: "2025-W04",
      md: "- x\n",
      extraction: {
        entries: [{ source: "- x", day: null, kind: "note", text: "x", pr: "web#1" }],
      },
    },
  ],
])("a note with %s is rejected and stores nothing", async (_, row) => {
  const env = makeEnv();
  const res = await post(env, [{ week: "2025-W04", md: OLD }, row]);

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid weekly notes" });
  assert.deepEqual(await list(env), { notes: [] });
});

test("only the work-log service and the owner may read or write weekly notes", async () => {
  const env = makeEnv();
  const stranger = { "Cf-Access-Jwt-Assertion": accessJwt({ email: "stranger@example.com" }) };

  assert.equal(
    (await worker.fetch(apiRequest("GET", URL, { headers: stranger }), env)).status,
    403,
  );
  assert.equal((await post({ ...env }, [])).status, 400);
});
