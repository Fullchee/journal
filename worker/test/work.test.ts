import assert from "node:assert/strict";
import type { Env, Json } from "@worker/lib/env";
import worker from "@worker/index";
import { accessJwt, apiRequest, makeEnv, type RequestBody } from "./helpers/env";

const SERVICE = { "Cf-Access-Jwt-Assertion": accessJwt({ common_name: "work-log.access" }) };

interface Call {
  method: string;
  path: string;
  body?: RequestBody;
  headers?: Record<string, string>;
}

const call = (env: Env, { method, path, body, headers = SERVICE }: Call) =>
  worker.fetch(
    apiRequest(method, `https://journal.fullchee.workers.dev/api/work/${path}`, { body, headers }),
    env,
  );

const post = async (env: Env, path: string, rows: RequestBody[]) => {
  const res = await call(env, { method: "POST", path, body: { rows } });
  assert.equal(res.status, 200, await res.clone().text());

  return res.json();
};

const list = async (env: Env, path: string) => (await call(env, { method: "GET", path })).json();

const WORK_TABLES = [
  "work_days",
  "tickets",
  "plans",
  "plan_actions",
  "estimates",
  "work_weeks",
  "work_retros",
];

const snapshot = async (env: Env) =>
  Promise.all(
    WORK_TABLES.map(
      async (table) => (await env.DB.prepare(`SELECT * FROM ${table}`).bind().all()).results,
    ),
  );

// history-daily.csv's 2026-11-04 row, with the derived iso_week and weekday left out.
const historyDay = {
  day: "2026-11-04",
  prs_merged: 2,
  prs_opened: 1,
  reviews: 2,
  tickets_resolved: 1,
  points_resolved: 1,
  epics_closed: 0,
  day_off: "",
  vacation_week: "",
  included: 1,
};

const action = (pr: string, status: string, ticket: string | null = "APP-101") => ({
  id: `merge:${pr}`,
  kind: "merge",
  ticket,
  pr,
  url: `https://github.com/Acme/acme-web/pull/${pr.split("#", 2)[1]}`,
  status,
});

const plan = (day: string, actions: Json[], extra: Record<string, Json> = {}) => ({
  day,
  plan_date: "2026-11-09",
  written_at: `${day}T07:56:08-05:00`,
  planned_size: 3,
  size_rule: "fixed-3",
  scored_on: day,
  unplanned_done: 1,
  actions,
  if_time: [],
  ...extra,
});

// The planned actions of plan-log.jsonl's 2026-11-10 and 2026-11-11 rows, which stored hit_rate 0 and null.
const PLAN_LOG = [
  plan("2026-11-10", [
    action("web#4183", "missed", "APP-102"),
    action("infra#9", "missed", "APP-103"),
    action("web#3753", "blocked", null),
  ]),
  plan(
    "2026-11-11",
    [action("web#4183", "pending", "APP-102"), action("web#3753", "pending", null)],
    { scored_on: null, unplanned_done: null },
  ),
];

const week45 = {
  week: "2026-W45",
  tickets: 5,
  scenarios: 0,
  median_cycle_hours: null,
  median_pr_size: null,
  reverts: 0,
  reopened: 1,
  reviews: 12,
  forecast: { tickets_resolved: [2, 6], prs_merged: [6, 12] },
};

// estimate-log.csv's one row.
const estimate = {
  task_id: "APP-104#S1",
  completion_date: "2026-11-16",
  task_name: "A tester installs the app on an Android phone",
  jira_key: "APP-104",
  estimate: "",
  actual: "1h",
  blocker_type: "none",
  storm_to_sun: 4,
  notes: "",
};

test("posting every work file's rows twice leaves D1 unchanged", async () => {
  const env = makeEnv();

  const postAll = async () => {
    await post(env, "days", [historyDay]);
    await post(env, "plans", PLAN_LOG);
    await post(env, "weeks", [week45]);
    await post(env, "estimates", [estimate]);
    await post(env, "retros", [{ period: "2026-W45", shipped: "Recipes" }]);
  };

  await postAll();
  const first = await snapshot(env);
  await postAll();

  assert.deepEqual(await snapshot(env), first);
  assert.ok(first.every((rows) => rows.length > 0));
});

test("each import fills its own columns of one Work day, and GET lists days newest first", async () => {
  const env = makeEnv();
  await post(env, "days", [historyDay, { day: "2026-11-03", included: 0, day_off: "sick" }]);
  await post(env, "days", [{ day: "2026-11-04", meeting_hours: 1.5, felt: 2 }]);

  const { days } = await list(env, "days");

  assert.deepEqual(
    days.map((d: { day: string }) => d.day),
    ["2026-11-04", "2026-11-03"],
  );
  assert.deepEqual(days[0], {
    ...historyDay,
    anchor: "",
    meeting_hours: 1.5,
    felt: 2,
  });
  assert.equal(days[1].prs_merged, null);
});

test("a null field clears the stored value", async () => {
  const env = makeEnv();
  await post(env, "days", [historyDay]);
  await post(env, "days", [{ day: "2026-11-04", prs_merged: null }]);

  assert.equal((await list(env, "days")).days[0].prs_merged, null);
});

test("a day posted with no other field is stored once and keeps what it had", async () => {
  const env = makeEnv();
  await post(env, "days", [{ day: "2026-11-05" }]);
  await post(env, "days", [{ day: "2026-11-05", anchor: "APP-101 review" }]);
  await post(env, "days", [{ day: "2026-11-05" }]);

  const { days } = await list(env, "days");

  assert.equal(days.length, 1);
  assert.equal(days[0].anchor, "APP-101 review");
});

test("GET plans rebuilds each Plan with its Hit rate, leaving out Blocked actions", async () => {
  const env = makeEnv();
  await post(env, "plans", PLAN_LOG);

  const { plans } = await list(env, "plans");

  assert.deepEqual(
    plans.map((p: { day: string; hit_rate: number | null }) => [p.day, p.hit_rate]),
    [
      ["2026-11-11", null],
      ["2026-11-10", 0],
    ],
  );
  assert.deepEqual(plans[1], { ...PLAN_LOG[0], hit_rate: 0 });
});

test("a done If time action is bonus and never moves the Hit rate", async () => {
  const env = makeEnv();

  await post(env, "plans", [
    plan("2026-11-06", [action("web#4177", "done"), action("web#4178", "missed")], {
      if_time: [action("web#4179", "done")],
    }),
  ]);
  const [stored] = (await list(env, "plans")).plans;

  assert.equal(stored.hit_rate, 0.5);
  assert.deepEqual(stored.if_time, [action("web#4179", "done")]);
});

test("re-posting a Plan replaces its actions, so a dropped one leaves D1", async () => {
  const env = makeEnv();
  const first = [action("web#4177", "pending"), action("web#4178", "pending")];

  await post(env, "plans", [plan("2026-11-06", first)]);
  await post(env, "plans", [plan("2026-11-06", [action("web#4178", "done")])]);

  assert.deepEqual((await list(env, "plans")).plans[0].actions, [action("web#4178", "done")]);
});

test("a scenario action with no PR yet stores a null pr and url", async () => {
  const env = makeEnv();

  const scenario = {
    id: "scenario:APP-105:2",
    kind: "scenario",
    ticket: "APP-105",
    pr: null,
    url: null,
    status: "pending",
  };

  await post(env, "plans", [plan("2026-11-17", [scenario])]);

  assert.deepEqual((await list(env, "plans")).plans[0].actions, [scenario]);
});

test("Plans and estimates add a Ticket row for each key they name", async () => {
  const env = makeEnv();
  await post(env, "plans", PLAN_LOG);
  await post(env, "estimates", [estimate]);

  const { results } = await env.DB.prepare("SELECT key FROM tickets ORDER BY key")
    .bind()
    .all<{ key: string }>();

  assert.deepEqual(
    results.map(({ key }) => key),
    ["APP-102", "APP-103", "APP-104"],
  );
});

test("GET weeks returns the forecast ranges as posted", async () => {
  const env = makeEnv();
  await post(env, "weeks", [week45]);

  assert.deepEqual((await list(env, "weeks")).weeks, [week45]);
});

test("a week posted with only its key keeps an empty forecast; a later post keeps the metrics", async () => {
  const env = makeEnv();
  await post(env, "weeks", [{ week: "2025-W10" }, week45]);
  await post(env, "weeks", [{ week: "2026-W45" }]);

  const { weeks } = await list(env, "weeks");

  assert.deepEqual(weeks[1].forecast, {});
  assert.equal(weeks[1].tickets, null);
  assert.deepEqual(weeks[0], week45);
});

test("a Ticket's title from Jira fills a bare row and comes back from GET", async () => {
  const env = makeEnv();
  await post(env, "plans", [plan("2026-11-06", [action("web#4177", "done", "APP-101")])]);
  await post(env, "tickets", [
    { key: "APP-101", title: "Recipe insights" },
    { key: "APP-1", title: "New" },
  ]);

  assert.deepEqual((await list(env, "tickets")).tickets, [
    { key: "APP-1", title: "New" },
    { key: "APP-101", title: "Recipe insights" },
  ]);
});

test("a work retro's fields are stored by period, and a re-post keeps the fields it omits", async () => {
  const env = makeEnv();
  await post(env, "retros", [{ period: "2026-W42", shipped: "Topics editing", goals: "Goal 1" }]);
  await post(env, "retros", [{ period: "2026-W42", learning: "Look first" }]);

  assert.deepEqual((await list(env, "retros")).retros, [
    {
      period: "2026-W42",
      shipped: "Topics editing",
      learning: "Look first",
      values_in_action: null,
      goals: "Goal 1",
    },
  ]);
});

test("GET estimates lists the rows as posted", async () => {
  const env = makeEnv();
  await post(env, "estimates", [estimate]);

  assert.deepEqual((await list(env, "estimates")).estimates, [{ ...estimate, check_in_id: null }]);
});

const addCheckIn = async (env: Env) =>
  (
    await env.DB.prepare(
      "INSERT INTO check_ins (checked_in_at, zone, score) VALUES ('2026-11-16T10:00:00Z', 'Cloud', 5)",
    )
      .bind()
      .run()
  ).meta.last_row_id;

test("an estimate keeps its Check-in when a re-import omits check_in_id", async () => {
  const env = makeEnv();
  const checkInId = await addCheckIn(env);

  await post(env, "estimates", [{ ...estimate, check_in_id: checkInId }]);
  await post(env, "estimates", [estimate]);

  assert.equal((await list(env, "estimates")).estimates[0].check_in_id, checkInId);
});

test("an estimate naming an unknown Check-in is rejected and stores nothing", async () => {
  const env = makeEnv();

  const res = await call(env, {
    method: "POST",
    path: "estimates",
    body: { rows: [{ ...estimate, check_in_id: 999 }] },
  });

  assert.equal(res.status, 400);
  assert.deepEqual((await list(env, "estimates")).estimates, []);
});

test.each(["days", "plans", "weeks", "estimates", "tickets", "retros"])(
  "GET and POST /api/work/%s reject a request without Access",
  async (path) => {
    const env = makeEnv();

    assert.equal((await call(env, { method: "GET", path, headers: {} })).status, 401);
    assert.equal(
      (await call(env, { method: "POST", path, body: { rows: [] }, headers: {} })).status,
      401,
    );
  },
);

const invalid: [path: string, rows: RequestBody[]][] = [
  ["days", []],
  ["days", [{ day: "11/04/2026" }]],
  ["days", [{ day: "2026-11-04", felt: 4 }]],
  ["plans", [plan("2026-11-06", [action("web#4177", "skipped")])]],
  ["plans", [plan("2026-11-06", [action("web#4177", "done", "app-1")])]],
  ["weeks", [{ week: "2026-45" }]],
  ["weeks", [{ ...week45, forecast: { prs_merged: [6] } }]],
  ["estimates", [{ ...estimate, storm_to_sun: 7 }]],
  ["tickets", [{ key: "app-1", title: "x" }]],
  ["tickets", [{ key: "APP-1", title: "" }]],
  ["retros", [{ period: "", shipped: "x" }]],
];

test.each(invalid)("POST /api/work/%s rejects %j and stores nothing", async (path, rows) => {
  const env = makeEnv();

  assert.equal((await call(env, { method: "POST", path, body: { rows } })).status, 400);
  assert.ok((await snapshot(env)).every((stored) => stored.length === 0));
});
