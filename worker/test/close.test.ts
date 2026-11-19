import assert from "node:assert/strict";
import { onRequestGet, onRequestPut } from "@worker/api/close";
import { onRequestPost } from "@worker/api/close/draft";
import type { Env, Json, SqlValue } from "@worker/lib/env";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";

const seed = (env: Env, sql: string, ...args: SqlValue[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .run();

const rows = async <Row>(env: Env, sql: string) =>
  (await env.DB.prepare(sql).bind().all<Row>()).results;

const url = (kind: string, period: string, tail = "") =>
  `https://x/api/close/${kind}/${period}${tail}`;

const get = (env: Env, kind: string, period: string, email: string | null = OWNER) =>
  onRequestGet({
    env,
    params: { kind, period },
    request: apiRequest("GET", url(kind, period), { email }),
  });

const draft = (env: Env, kind: string, period: string) =>
  onRequestPost({
    env,
    params: { kind, period },
    request: apiRequest("POST", url(kind, period, "/draft"), { email: OWNER }),
  });

const put = (env: Env, kind: string, period: string, body: Json) =>
  onRequestPut({
    env,
    params: { kind, period },
    request: apiRequest("PUT", url(kind, period), { email: OWNER, body }),
  });

/** A database with only the Goals a test adds, and a model that answers `reply`. */
async function envWith(
  reply: () => Promise<{ response?: string }> = () => Promise.resolve({ response: "" }),
) {
  const env = makeEnv();
  await seed(env, "DELETE FROM goal_habits");
  await seed(env, "DELETE FROM goals");
  await seed(env, "DELETE FROM reflections");
  env.AI = { run: reply };

  return env;
}

async function seedGoals(env: Env) {
  await seed(
    env,
    "INSERT INTO goals (id, title, why, state) VALUES (1, 'Cultivate Meditation', 'Calm', 'active'), (2, 'Run', '', 'active'), (3, 'Read', '', 'active'), (4, 'Swim', '', 'active'), (9, 'Old', '', 'retired')",
  );
  await seed(env, "INSERT INTO goal_habits (goal_id, habit_id) VALUES (1, 'sit')");
}

const carryAll = (ids: number[]) => ids.map((goalId) => ({ goalId, move: "carry", words: "" }));

test("a close needs sign-in, a stranger gets no sources and cannot save", async () => {
  const env = await envWith();

  assert.equal((await get(env, "quarter", "2026-Q4", null)).status, 401);
  assert.equal((await get(env, "quarter", "2026-Q4", STRANGER)).status, 403);

  const byStranger = await onRequestPut({
    env,
    params: { kind: "quarter", period: "2026-Q4" },
    request: apiRequest("PUT", url("quarter", "2026-Q4"), {
      email: STRANGER,
      body: { arc: "", answer: "", moves: [] },
    }),
  });

  assert.equal(byStranger.status, 403);
});

for (const [kind, period] of [
  ["month", "2026-10"],
  ["quarter", "2026-Q5"],
  ["year", "2026-Q4"],
  ["quarter", "2026"],
] as const)
  test(`${kind} ${period} is a 400`, async () => {
    const env = await envWith();

    assert.equal((await get(env, kind, period)).status, 400);
    assert.equal((await draft(env, kind, period)).status, 400);
    assert.equal((await put(env, kind, period, { arc: "", answer: "", moves: [] })).status, 400);
  });

test("a quarter reads its week and month rows as written, flags missing ones and reads signals fresh", async () => {
  const env = await envWith();
  await seedGoals(env);
  await seed(
    env,
    "INSERT INTO reflections (period_kind, period, body) VALUES ('week', '2026-W41', 'Week 41'), ('month', '2026-10', 'October'), ('week', '2026-W39', 'Before'), ('quarter', '2026-Q3', 'Last quarter')",
  );
  await seed(
    env,
    "INSERT INTO sleep (date, sleep_start, sleep_end, duration_min, sleep_score) VALUES ('2026-10-03', 'a', 'b', 420, 80), ('2026-09-30', 'a', 'b', 60, 10)",
  );

  const body = await (await get(env, "quarter", "2026-Q4")).json();
  const written = body.sources.filter((s: { body: string | null }) => s.body !== null);

  assert.deepEqual(written, [
    { kind: "week", period: "2026-W41", body: "Week 41" },
    { kind: "month", period: "2026-10", body: "October" },
  ]);
  assert.equal(body.sources.length, 17);
  // Only October's night counts; there is no activity, Check-in or Habit, so they get no line.
  assert.deepEqual(body.signals, ["- Sleep: 1 night, average 7h 00m"]);
  assert.deepEqual(
    body.goals.map((g: { title: string }) => g.title),
    ["Cultivate Meditation", "Read", "Run", "Swim"],
  );
  assert.equal(body.existing, null);
});

test("a year reads its four quarter rows", async () => {
  const env = await envWith();
  await seed(
    env,
    "INSERT INTO reflections (period_kind, period, body) VALUES ('quarter', '2026-Q2', 'Spring'), ('quarter', '2026', 'x')",
  );

  const body = await (await get(env, "year", "2026")).json();

  assert.deepEqual(body.sources, [
    { kind: "quarter", period: "2026-Q1", body: null },
    { kind: "quarter", period: "2026-Q2", body: "Spring" },
    { kind: "quarter", period: "2026-Q3", body: null },
    { kind: "quarter", period: "2026-Q4", body: null },
  ]);
});

test("a close reads neither work sources nor a work close as its own", async () => {
  const env = await envWith();
  await seed(
    env,
    "INSERT INTO reflections (track, period_kind, period, body) VALUES ('work', 'quarter', '2026-Q2', 'Work spring'), ('work', 'year', '2026', 'Work year')",
  );

  const body = await (await get(env, "year", "2026")).json();

  assert.deepEqual(
    body.sources.map((s: { body: string | null }) => s.body),
    [null, null, null, null],
  );
  assert.equal(body.existing, null);
});

test("saving a close beside a work close of the same period writes a growth row", async () => {
  const env = await envWith();
  await seedGoals(env);
  await seed(
    env,
    "INSERT INTO reflections (track, period_kind, period, body) VALUES ('work', 'quarter', '2026-Q4', 'Work')",
  );

  const saved = await put(env, "quarter", "2026-Q4", {
    arc: "Mine",
    answer: "",
    moves: carryAll([1, 2, 3, 4]),
  });

  assert.equal(saved.status, 200);
  assert.deepEqual(
    await rows(env, "SELECT track, substr(body, 1, 4) AS start FROM reflections ORDER BY id"),
    [
      { track: "work", start: "Work" },
      { track: "growth", start: "## T" },
    ],
  );
});

test("the draft gives exactly one review per active Goal", async () => {
  const env = await envWith(() =>
    Promise.resolve({
      response: JSON.stringify({
        arc: "Steady.",
        reviews: [{ goal: "Run", review: "Fewer runs.", move: "revise", revision: "Move daily" }],
        newGoals: [{ title: "Sleep by 11" }],
      }),
    }),
  );

  await seedGoals(env);

  const res = await draft(env, "quarter", "2026-Q4");
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.arc, "Steady.");
  assert.deepEqual(
    body.reviews.map((r: { move: string }) => r.move),
    ["carry", "carry", "revise", "carry"],
  );
  assert.deepEqual(body.newGoals, []);
});

for (const [name, reply] of [
  ["throws", () => Promise.reject(new Error("down"))],
  ["answers bad JSON", () => Promise.resolve({ response: "not json" })],
] as const)
  test(`when the AI ${name}, the draft is a 503 and a hand-written close still saves`, async () => {
    const env = await envWith(reply);
    await seed(
      env,
      "INSERT INTO reflections (period_kind, period, body) VALUES ('week', '2026-W41', 'Week 41')",
    );

    assert.equal((await draft(env, "quarter", "2026-Q4")).status, 503);
    assert.equal((await get(env, "quarter", "2026-Q4")).status, 200);

    const res = await put(env, "quarter", "2026-Q4", {
      arc: "By hand.",
      answer: "Sitting.",
      moves: [],
    });

    assert.equal(res.status, 200);
    assert.deepEqual(
      await rows(env, "SELECT period_kind AS kind, body FROM reflections WHERE period = '2026-Q4'"),
      [
        {
          kind: "quarter",
          body: "## The arc this quarter\n\nBy hand.\n\n## Goal review\n\nNo active Goals.\n\n## What shifted, and which practice stuck?\n\nSitting.\n",
        },
      ],
    );
  });

test("each move updates its Goal and adds a line to the quarter's reflection", async () => {
  const env = await envWith();
  await seedGoals(env);

  const res = await put(env, "quarter", "2026-Q3", {
    arc: "",
    answer: "",
    moves: [
      { goalId: 1, move: "achieve", words: "it stuck" },
      { goalId: 2, move: "revise", revision: " Move daily ", words: "" },
      { goalId: 3, move: "retire", words: "" },
      { goalId: 4, move: "carry", words: "still going" },
    ],
  });

  const saved = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(await rows(env, "SELECT id, title, state FROM goals ORDER BY id"), [
    { id: 1, title: "Cultivate Meditation", state: "achieved" },
    { id: 2, title: "Move daily", state: "active" },
    { id: 3, title: "Read", state: "retired" },
    { id: 4, title: "Swim", state: "active" },
    { id: 9, title: "Old", state: "retired" },
  ]);
  assert.match(
    saved.body,
    /## Goal review\n\n- 2026-09-30 — Cultivate Meditation achieved: it stuck\n- 2026-09-30 — Read retired\n- 2026-09-30 — Run revised to Move daily\n- Swim carried: still going\n/,
  );
});

const BAD_MOVES: [string, Json[]][] = [
  ["a Goal without a move", carryAll([1, 2, 3])],
  ["a Goal with two moves", [...carryAll([1, 2, 3, 4]), { goalId: 1, move: "achieve", words: "" }]],
  ["a move for a retired Goal", carryAll([1, 2, 3, 9])],
  [
    "a revise without wording",
    [...carryAll([1, 2, 3]), { goalId: 4, move: "revise", revision: " ", words: "" }],
  ],
];

for (const [name, moves] of BAD_MOVES)
  test(`${name} is a 400 and writes nothing`, async () => {
    const env = await envWith();
    await seedGoals(env);

    assert.equal(
      (await put(env, "quarter", "2026-Q4", { arc: "", answer: "", moves })).status,
      400,
    );
    assert.deepEqual(await rows(env, "SELECT id FROM reflections"), []);
  });

test("saving never overwrites a closed period unless asked to replace it", async () => {
  const env = await envWith();
  await seedGoals(env);
  await seed(
    env,
    "INSERT INTO reflections (period_kind, period, body) VALUES ('quarter', '2026-Q4', 'Mine')",
  );

  const first = await put(env, "quarter", "2026-Q4", {
    arc: "New",
    answer: "",
    moves: [{ goalId: 1, move: "achieve", words: "" }, ...carryAll([2, 3, 4])],
  });

  assert.equal(first.status, 409);
  assert.deepEqual(await rows(env, "SELECT body FROM reflections"), [{ body: "Mine" }]);
  assert.deepEqual(await rows(env, "SELECT state FROM goals WHERE id = 1"), [{ state: "active" }]);
  const reread = await get(env, "quarter", "2026-Q4");

  assert.equal((await reread.json()).existing.body, "Mine");

  const replaced = await put(env, "quarter", "2026-Q4", {
    arc: "New",
    answer: "",
    moves: carryAll([1, 2, 3, 4]),
    replace: true,
  });

  assert.equal(replaced.status, 200);
  assert.deepEqual(await rows(env, "SELECT id, period FROM reflections"), [
    { id: 1, period: "2026-Q4" },
  ]);
  assert.match(
    (await rows<{ body: string }>(env, "SELECT body FROM reflections"))[0]?.body ?? "",
    /^## The arc this quarter\n\nNew\n/,
  );
});

test("a year close creates only the picked Goals, active from the next January", async () => {
  const env = await envWith();

  const res = await put(env, "year", "2026", {
    arc: "Rebuilding.",
    answer: "Home.",
    moves: [],
    newGoals: [{ title: " Sleep by 11 " }, { title: "Write" }],
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await rows(env, "SELECT title, why, state, since FROM goals ORDER BY title"), [
    { title: "Sleep by 11", why: "", state: "active", since: "2027-01" },
    { title: "Write", why: "", state: "active", since: "2027-01" },
  ]);
  assert.match((await res.json()).body, /### Next year's Goals\n\n- Sleep by 11\n- Write\n$/);
});

test("a quarter cannot pick new Goals", async () => {
  const env = await envWith();

  assert.equal(
    (
      await put(env, "quarter", "2026-Q4", {
        arc: "",
        answer: "",
        moves: [],
        newGoals: [{ title: "X" }],
      })
    ).status,
    400,
  );
});

test("a picked or revised title that clashes is a 409 and nothing is written", async () => {
  const env = await envWith();
  await seedGoals(env);

  const res = await put(env, "year", "2026", {
    arc: "",
    answer: "",
    moves: [{ goalId: 1, move: "achieve", words: "" }, ...carryAll([2, 3, 4])],
    newGoals: [{ title: "Run" }],
  });

  assert.equal(res.status, 409);
  assert.deepEqual(await rows(env, "SELECT id FROM reflections"), []);
  assert.deepEqual(await rows(env, "SELECT state FROM goals WHERE id = 1"), [{ state: "active" }]);
});

test("replacing a close keeps the earlier lines of Goals it finished", async () => {
  const env = await envWith();
  await seedGoals(env);

  await put(env, "quarter", "2026-Q3", {
    arc: "",
    answer: "",
    moves: [{ goalId: 1, move: "achieve", words: "it stuck" }, ...carryAll([2, 3, 4])],
  });

  const res = await put(env, "quarter", "2026-Q3", {
    arc: "Again.",
    answer: "",
    moves: carryAll([2, 3, 4]),
    replace: true,
  });

  assert.equal(res.status, 200);
  assert.match(
    (await res.json()).body,
    /## Goal review\n\n- 2026-09-30 — Cultivate Meditation achieved: it stuck\n- Read carried\n- Run carried\n- Swim carried\n/,
  );
});

test("a Goal picked for next year is not active in this year's closes until its January", async () => {
  const env = await envWith();
  await seed(
    env,
    "INSERT INTO goals (id, title, state, since) VALUES (1, 'Now', 'active', '2026-03-15'), (2, 'Next', 'active', '2027-01')",
  );

  const titles = async (kind: string, period: string) =>
    (await (await get(env, kind, period)).json()).goals.map((g: { title: string }) => g.title);

  assert.deepEqual(await titles("quarter", "2026-Q4"), ["Now"]);
  assert.deepEqual(await titles("year", "2026"), ["Now"]);
  assert.deepEqual(await titles("quarter", "2025-Q4"), []);
  assert.deepEqual(await titles("quarter", "2027-Q1"), ["Next", "Now"]);
  assert.equal(
    (await put(env, "quarter", "2026-Q4", { arc: "", answer: "", moves: carryAll([1]) })).status,
    200,
  );
});
