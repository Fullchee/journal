import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type TestContext, test } from "node:test";
import * as z from "zod/mini";

import {
  diffUploads,
  importWorkLog,
  parseCsv,
  readWorkLog,
  type Api,
  type Row,
} from "./import-work-log.ts";

const ACTION = {
  id: "merge:web#4177",
  type: "merge",
  ticket: "APP-101",
  pr: "web#4177",
  url: "https://github.com/Acme/acme-web/pull/4177",
  status: "missed",
};

const PLAN_LOG = {
  date: "2026-11-06",
  plan_date: "2026-11-05",
  written_at: "2026-11-05T16:02:15-05:00",
  planned_size: 3,
  size_rule: "fixed-3",
  actions: [ACTION],
  if_time: [],
  scored_on: "2026-11-06",
  hit_rate: 0,
  if_time_done: 0,
  unplanned_done: 1,
  meeting_hours: 0.5,
  felt: 1,
};

const WEEK = {
  week: "2026-W45",
  start: "2026-11-02",
  end: "2026-11-06",
  tickets: 5,
  scenarios: 0,
  median_cycle_hours: null,
  median_pr_size: null,
  reverts: 0,
  reopened: 1,
  reviews: 12,
  forecast: { tickets_resolved: [2, 6] },
};

const HISTORY = `date,iso_week,weekday,prs_merged,prs_opened,reviews,tickets_resolved,points_resolved,epics_closed,day_off,vacation_week,included
2026-11-05,2026-W45,Thu,0,2,1,2,1.75,0,,,1
2026-11-06,2026-W45,Fri,0,0,0,0,0,0,holiday: Remembrance Day,zero activity all week,0
`;

const ESTIMATES = `completion_date,task_id,task_name,jira_key,estimate,actual,blocker_type,storm_to_sun,notes
2026-11-16,APP-102#S1,"Install the app, then test",APP-102,,1h,none,4,
2026-11-17,chore-1,Tidy,,2h,1h,none,,"said ""done"""
`;

const JIRA = "https://acme.atlassian.net/browse/APP-103";

/** One weekly note per era, by path under weekly/; the 2026-W30 note's link is what D1 must index. */
const WEEKLY = {
  "2026-W45.md": "**Mon, Nov 2 -> Sun, Nov 8**\n\n#### Mon, Nov 2\n\n- Shipped\n",
  "2026-W30.md": `**Mon, Jul 20**\n\n- [APP-103](${JIRA})\n`,
  "2024/2024-W36.md": "- [x] Onboard\n",
};

const MONTH = [
  "Oct 2026",
  "",
  "## Summary",
  "",
  "### Week 41 (Oct 5–11)",
  "",
  "- **Shipped:** topics",
  "",
  "### Week 42 (Oct 12–18)",
  "- **Metrics:** 13 PRs merged",
  "",
].join("\n");

/** Period notes by path; the plan in images/ names no period. */
const PERIODS = {
  "monthly/2026-10.md": MONTH,
  "monthly/2024-monthly/2024-10.md": "Oct 2024\n",
  "monthly/images/2026-05/plan.md": "# Plan\n",
  "quarterly/2026-Q3.md": "Q3\n",
  "yearly/2026.md": "Goal backlog\n",
  "yearly/2026-work-year.md": "Work year\n",
};

const writeTree = (root: string, files: Record<string, string>) => {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
};

/** The extraction for 2026-W45: its one free bullet typed as done work. */
const EXTRACTION = {
  entries: [{ source: "- Shipped", day: "2026-11-02", kind: "done", text: "Shipped" }],
};

/** A temp work-log checkout holding the data files, the extracted data, the weekly notes and the period notes. */
const makeWorkLog = (t: TestContext) => {
  const root = mkdtempSync(path.join(tmpdir(), "import-work-log-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "data"));
  const write = (name: string, text: string) => writeFileSync(path.join(root, "data", name), text);
  write("plan-log.jsonl", `${JSON.stringify(PLAN_LOG)}\n`);
  write("weeks.jsonl", `${JSON.stringify(WEEK)}\n\n`);
  write("history-daily.csv", HISTORY);
  write("estimate-log.csv", ESTIMATES);
  writeTree(path.join(root, "weekly"), WEEKLY);
  writeTree(path.join(root, "data/extracted"), {
    "tickets.json": JSON.stringify({ "APP-103": "Consolidate feature flags" }),
    "retros.json": JSON.stringify({ "2026-W41": { shipped: "topics" } }),
    "weekly/2026-W45.json": JSON.stringify(EXTRACTION),
  });
  writeTree(root, PERIODS);

  return root;
};

test("parseCsv reads quoted commas, doubled quotes and a missing final newline", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi"""'), [{ a: "x, y", b: 'say "hi"' }]);
});

test("readWorkLog maps each file onto its /api/work route", (t) => {
  const [days, estimates, weeks, plans, tickets, retros] = readWorkLog(makeWorkLog(t));

  assert.deepEqual(days, {
    route: "days",
    rows: [
      {
        day: "2026-11-05",
        prs_merged: 0,
        prs_opened: 2,
        reviews: 1,
        tickets_resolved: 2,
        points_resolved: 1.75,
        epics_closed: 0,
        day_off: "",
        vacation_week: "",
        included: 1,
      },
      {
        day: "2026-11-06",
        prs_merged: 0,
        prs_opened: 0,
        reviews: 0,
        tickets_resolved: 0,
        points_resolved: 0,
        epics_closed: 0,
        day_off: "holiday: Remembrance Day",
        vacation_week: "zero activity all week",
        included: 0,
        meeting_hours: 0.5,
        felt: 1,
      },
    ],
  });

  assert.deepEqual(estimates, {
    route: "estimates",
    rows: [
      {
        completion_date: "2026-11-16",
        task_id: "APP-102#S1",
        task_name: "Install the app, then test",
        jira_key: "APP-102",
        estimate: "",
        actual: "1h",
        blocker_type: "none",
        storm_to_sun: 4,
        notes: "",
      },
      {
        completion_date: "2026-11-17",
        task_id: "chore-1",
        task_name: "Tidy",
        jira_key: null,
        estimate: "2h",
        actual: "1h",
        blocker_type: "none",
        storm_to_sun: null,
        notes: 'said "done"',
      },
    ],
  });

  const { start: _start, end: _end, ...week } = WEEK;
  assert.deepEqual(weeks, { route: "weeks", rows: [week] });

  const { type, ...action } = ACTION;
  assert.deepEqual(plans, {
    route: "plans",
    rows: [
      {
        day: "2026-11-06",
        plan_date: "2026-11-05",
        written_at: "2026-11-05T16:02:15-05:00",
        planned_size: 3,
        size_rule: "fixed-3",
        scored_on: "2026-11-06",
        unplanned_done: 1,
        actions: [{ ...action, kind: type }],
        if_time: [],
      },
    ],
  });

  assert.deepEqual(tickets, {
    route: "tickets",
    rows: [{ key: "APP-103", title: "Consolidate feature flags" }],
  });
  assert.deepEqual(retros, { route: "retros", rows: [{ period: "2026-W41", shipped: "topics" }] });
});

test("readWorkLog rejects a row its schema does not allow", (t) => {
  const root = makeWorkLog(t);
  writeFileSync(path.join(root, "data", "history-daily.csv"), HISTORY.replace(",1.75,", ",lots,"));

  assert.throws(() => readWorkLog(root));
});

const DAY = { day: "2026-11-05", felt: 2, included: 1 };

test("diffUploads lists changed fields, missing rows, and Plans or estimates only D1 holds", () => {
  const uploads = [
    { route: "days" as const, rows: [DAY, { day: "2026-11-06", felt: 1 }] },
    { route: "weeks" as const, rows: [{ week: "2026-W45", forecast: { prs: [1, 2] } }] },
    { route: "plans" as const, rows: [] },
  ];

  const stored = {
    days: [
      { ...DAY, felt: 3, anchor: "" },
      { day: "2026-11-09", felt: null },
    ],
    weeks: [{ week: "2026-W45", forecast: { prs: [1, 2] }, reviews: null }],
    plans: [{ day: "2026-11-09" }],
  };

  // Weekly notes also fill Work days, so a day only D1 holds is no difference.
  assert.deepEqual(diffUploads(uploads, stored), [
    "days 2026-11-05 felt: file 2, D1 3",
    "days 2026-11-06: missing from D1",
    "plans 2026-11-09: only in D1",
  ]);
});

const StoredRow = z.record(z.string(), z.json());

const Rows = z.object({ rows: z.array(StoredRow) });

const NoteText = z.object({ week: z.string(), md: z.string(), extraction: z.optional(z.json()) });

const NoteRows = z.object({ rows: z.array(NoteText) });

const NewRetro = z.object({ period: z.string(), body: z.string() });

const RetroBody = z.object({ body: z.string() });

/** A fake API that stores what the import sends and serves it back, as the Worker would. */
const fakeApi = () => {
  const calls: string[] = [];
  const stored: Record<string, Row[]> = {};
  const notes = new Map<string, string>();
  const retros: { id: number; title: string; body: string }[] = [];

  const get = (route: string) => {
    if (route === "/api/work/weekly-notes") {
      return { notes: [...notes].map(([week, raw_md]) => ({ week, raw_md, entries: [] })) };
    }

    if (route === "/api/notes/reflections?track=work") {
      return { items: retros.map(({ id, title }) => ({ id, title })) };
    }

    const retro = retros.find(({ id }) => route === `/api/notes/reflections/${id}`);

    if (retro !== undefined) return { item: { body: retro.body } };
    const key = route.replace("/api/work/", "");

    return { [key]: stored[key] ?? [] };
  };

  // Like the Worker, a note with no extraction reports its first line as left over.
  const postNotes = (body: Parameters<Api>[2]) => {
    const leftovers: string[] = [];

    for (const { week, md, extraction } of NoteRows.parse(body).rows) {
      notes.set(week, md);

      if (extraction === undefined) leftovers.push(`${week}:1 ${md.slice(0, md.indexOf("\n"))}`);
    }

    return { leftovers, stale: [] };
  };

  const write = (method: string, route: string, body: Parameters<Api>[2]) => {
    if (route === "/api/work/weekly-notes") {
      return postNotes(body);
    }

    if (route === "/api/notes/reflections") {
      const { period, body: text } = NewRetro.parse(body);
      retros.push({ id: retros.length + 1, title: period, body: text });
    } else if (method === "PUT") {
      const retro = retros.find(({ id }) => route === `/api/notes/reflections/${id}`);

      if (retro !== undefined) retro.body = RetroBody.parse(body).body;
    } else {
      const key = route.replace("/api/work/", "");
      stored[key] = [...(stored[key] ?? []), ...Rows.parse(body).rows];
    }

    return {};
  };

  const api: Api = (method, route, body) => {
    calls.push(`${method} ${route}`);

    if (method === "GET") return JSON.stringify(get(route));

    return JSON.stringify(write(method, route, body));
  };

  return { api, calls, notes, retros };
};

/** Collects printed lines. */
const printer = () => {
  const printed: string[] = [];

  return {
    printed,
    print: (line: string) => {
      printed.push(line);
    },
  };
};

const SKIPPED = "Skipped monthly/images/2026-05/plan.md: its name holds no week or period";

test("importWorkLog --dry-run prints what it would send and calls no API", (t) => {
  const { api, calls } = fakeApi();
  const { printed, print } = printer();

  assert.equal(importWorkLog(makeWorkLog(t), "dry-run", api, print), false);
  assert.deepEqual(calls, []);
  assert.deepEqual(printed.slice(0, 3), [SKIPPED, "POST /api/work/days: 2 rows", printed[2]]);
  assert.match(printed[2] ?? "", /^\{"day":"2026-11-05"/);
  assert.deepEqual(printed.slice(-12), [
    "POST /api/work/weekly-notes: 3 notes",
    "Work retros: 7",
    "2024-W36: 14 characters",
    "2026-W30: 72 characters",
    "2026-W45: 57 characters",
    "month 2024-10",
    "month 2026-10",
    "week 2026-W41",
    "week 2026-W42",
    "quarter 2026-Q3",
    "year 2026-work-year",
    "year 2026",
  ]);
});

test("importWorkLog posts the rows, each weekly note and each retro, then diffs clean", (t) => {
  const root = makeWorkLog(t);
  const { api, calls, retros } = fakeApi();
  const { printed, print } = printer();

  assert.equal(importWorkLog(root, "import", api, print), false);
  assert.deepEqual(calls.slice(0, 10), [
    "POST /api/work/days",
    "POST /api/work/estimates",
    "POST /api/work/weeks",
    "POST /api/work/plans",
    "POST /api/work/tickets",
    "POST /api/work/retros",
    "POST /api/work/weekly-notes",
    "POST /api/work/weekly-notes",
    "POST /api/work/weekly-notes",
    "GET /api/notes/reflections?track=work",
  ]);
  assert.equal(retros.length, 7);
  assert.deepEqual(
    retros.find(({ title }) => title === "2026-W42"),
    {
      id: 4,
      title: "2026-W42",
      body: "### Week 42 (Oct 12–18)\n- **Metrics:** 13 PRs merged\n",
    },
  );

  assert.deepEqual(printed, [
    SKIPPED,
    "2024-W36:1 - [x] Onboard",
    "2026-W30:1 **Mon, Jul 20**",
    "Weekly notes: 2 lines left over, 0 extracted lines stale.",
  ]);

  assert.equal(importWorkLog(root, "diff", api, print), false);
  assert.equal(printed.at(-1), "No differences: 8 rows, 3 weekly notes and 7 retros match D1.");
});

test("a re-import posts the weekly notes again and leaves unchanged retros alone", (t) => {
  const root = makeWorkLog(t);
  const { api, calls } = fakeApi();
  const { print } = printer();
  importWorkLog(root, "import", api, print);
  calls.length = 0;
  writeFileSync(path.join(root, "quarterly/2026-Q3.md"), "Q3, revised\n");

  importWorkLog(root, "import", api, print);

  assert.deepEqual(
    calls.filter((call) => /^(?:POST|PUT) \/api\/notes/u.test(call)),
    ["PUT /api/notes/reflections/5"],
  );
});

test("importWorkLog --diff reports what D1 lacks or holds differently, and fails", (t) => {
  const root = makeWorkLog(t);
  const { api, notes, retros } = fakeApi();
  const { printed, print } = printer();
  importWorkLog(root, "import", api, print);

  notes.set("2026-W30", "**Mon, Jul 20**\n");
  notes.set("2026-W45", "changed\n");
  notes.delete("2024-W36");
  notes.set("2026-W46", "extra\n");
  retros.shift();
  retros.push({ id: 99, title: "2026-W01", body: "" });
  writeFileSync(path.join(root, "weekly/2026-W30.md"), "**Mon, Jul 20**\n");
  writeFileSync(path.join(root, "yearly/2026.md"), "Goal backlog, revised\n");
  printed.length = 0;

  assert.equal(importWorkLog(root, "diff", api, print), true);
  assert.deepEqual(printed.slice(1), [
    "weekly 2024-W36: missing from D1",
    "weekly 2026-W45: D1 archives different Markdown",
    "weekly 2026-W46: only in D1",
    "retro 2024-10: missing from D1",
    "retro 2026: body differs",
    "retro 2026-W01: only in D1",
  ]);
});
