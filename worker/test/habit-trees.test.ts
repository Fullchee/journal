import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "@worker/api/habits";
import type { Json } from "@worker/lib/env";
import { daysFrom, shiftDay, torontoDay, type Habit } from "@/core";
import { makeD1 } from "./helpers/d1";
import { apiRequest, makeEnv, OWNER } from "./helpers/env";
import { readJson } from "./helpers/json";

const TODAY = torontoDay(new Date());
const START = shiftDay(TODAY, -80);

// "up" done every day for 80 days: Strength near 99% and past the 66-day floor, so its card asks the tree question.
async function steadyEnv() {
  const env = { ...makeEnv(), DB: makeD1() };
  const days = daysFrom(START, shiftDay(TODAY, -1));

  await env.DB.exec(`
    UPDATE habits SET start_date = '${START}' WHERE id = 'up';
    INSERT INTO habit_checks (habit, date, count) VALUES ${days.map((day) => `('up', '${day}', 1)`).join(", ")};
  `);

  return env;
}

type Env = Awaited<ReturnType<typeof steadyEnv>>;

const answer = async (env: Env, habit: string, value: Json) =>
  (
    await onRequestPost({
      env,
      params: {},
      request: apiRequest("POST", "https://x/api/habits", {
        body: { type: "tree", habit, answer: value },
        email: OWNER,
      }),
    })
  ).status;

async function up(env: Env) {
  const res = await onRequestGet({
    env,
    params: {},
    request: apiRequest("GET", "https://x/api/habits?view=tracker", { email: OWNER }),
  });

  const habit = (await readJson<{ habits: Habit[] }>(res)).habits.find(({ id }) => id === "up");

  assert.ok(habit);

  return { trees: habit.trees, treeAskFrom: habit.treeAskFrom };
}

test("yes makes a steady Habit a tree from today, and Slipped ends it today", async () => {
  const env = await steadyEnv();

  assert.equal(await answer(env, "up", "yes"), 204);
  assert.deepEqual(await up(env), { trees: [{ start: TODAY, end: null }], treeAskFrom: null });

  assert.equal(await answer(env, "up", "slipped"), 204);
  assert.deepEqual(await up(env), { trees: [{ start: TODAY, end: TODAY }], treeAskFrom: null });
});

test("Not yet hides the question for 30 days, so a second answer is refused", async () => {
  const env = await steadyEnv();

  assert.equal(await answer(env, "up", "not-yet"), 204);
  assert.deepEqual(await up(env), { trees: [], treeAskFrom: shiftDay(TODAY, 30) });
  assert.equal(await answer(env, "up", "yes"), 400);
});

test("refuses an answer the card wouldn't offer, an unknown Habit or an unknown answer", async () => {
  const env = await steadyEnv();

  assert.equal(await answer(env, "up", "slipped"), 400);
  assert.equal(await answer(env, "noscroll", "yes"), 400);
  assert.equal(await answer(env, "missing", "yes"), 400);
  assert.equal(await answer(env, "up", "maybe"), 400);
  assert.deepEqual(await up(env), { trees: [], treeAskFrom: null });
});
