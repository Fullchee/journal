import assert from "node:assert/strict";
import { MODEL_DOWN } from "@worker/lib/log-model";
import { onRequestPost as postDetails } from "@worker/api/habits/draft";
import type { Ai, Env, Json } from "@worker/lib/env";
import { insertHabit } from "@worker/lib/habit-records";
import worker from "@worker/index";
import { makeHabit } from "@/core/__tests__/helpers/habit";
import { makeD1 } from "./helpers/d1";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";
import { readJson } from "./helpers/json";

const coffee = makeHabit({ id: "coffee", name: "Morning coffee" });
const backlog = makeHabit({ id: "old", name: "Old habit", active: false });

async function makeDetailsEnv(answer: () => Promise<{ response: string }>) {
  const inputs: Parameters<Ai["run"]>[1][] = [];

  const env: Env & { DB: ReturnType<typeof makeD1>; inputs: typeof inputs } = {
    ...makeEnv(),
    DB: makeD1(),
    inputs,
    AI: {
      run: (_model, input) => {
        inputs.push(input);

        return answer();
      },
    },
  };

  // The test seed holds example Habits and Goals; these tests want only their own.
  await env.DB.exec(
    "DELETE FROM goal_habits; DELETE FROM habit_checks; DELETE FROM habits; DELETE FROM goals;",
  );
  await Promise.all([coffee, backlog].map((habit) => insertHabit(env, habit)));
  await env.DB.exec(
    "INSERT INTO goals (id, title, state) VALUES (2, 'Feel strong', 'active'), (3, 'Old goal', 'retired');",
  );

  return env;
}

const replying = (reply: Json) =>
  makeDetailsEnv(() => Promise.resolve({ response: JSON.stringify(reply) }));

const STRETCH = {
  name: "Stretch",
  kind: "good",
  record: "duration",
  text: "started stretching after coffee",
};

const details = (env: Env, body: Json = STRETCH, email: string | null = OWNER) =>
  postDetails({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/habits/draft", { email, body }),
  });

test("returns the model's Habit details, trimmed", async () => {
  const env = await replying({
    description: " Ten minutes on the mat ",
    usual_when: "7:30",
    cue_type: "stacked",
    stacked_after: "coffee",
    goals: [2],
  });

  const res = await details(env);

  assert.equal(res.status, 200);
  assert.deepEqual(await readJson(res), {
    description: "Ten minutes on the mat",
    usual_when: "07:30",
    cue_type: "stacked",
    stacked_after: "coffee",
    goals: [2],
  });
});

test("sends the Habit, the sentence, and the active Habits and Goals", async () => {
  const env = await replying({});

  await details(env);

  const [system, user] = env.inputs[0]?.messages ?? [];
  const context = JSON.parse(system?.content.split("Context: ", 2)[1] ?? "");

  assert.equal(system?.content.startsWith("You fill in the details of one new Habit"), true);
  assert.deepEqual(context, {
    habits: [{ id: "coffee", name: "Morning coffee" }],
    goals: [{ id: 2, title: "Feel strong" }],
  });
  assert.deepEqual(JSON.parse(user?.content ?? ""), {
    name: "Stretch",
    kind: "good",
    record: "duration",
    sentence: "started stretching after coffee",
  });
  assert.equal(env.inputs[0]?.response_format?.type, "json_schema");
});

test("drops an unknown stacked Habit, an unknown Goal and a cue type the form doesn't offer", async () => {
  const env = await replying({
    cue_type: "stacked",
    stacked_after: "made-up",
    goals: [2, 3, 99, 2],
  });

  assert.deepEqual(await readJson(await details(env)), { goals: [2] });

  const timed = await replying({
    cue_type: "time",
    stacked_after: "coffee",
    usual_when: "morning",
  });

  assert.deepEqual(await readJson(await details(timed)), {});
});

test("a cue other than stacked drops the stacked Habit", async () => {
  const emotion = await replying({ cue_type: "emotion", stacked_after: "coffee" });

  assert.deepEqual(await readJson(await details(emotion)), { cue_type: "emotion" });
});

test("caps the description's length, and drops blank fields and the fields the form no longer has", async () => {
  const env = await replying({
    description: "d".repeat(3000),
    usual_when: " ".repeat(3),
    why: "Less back pain",
    routine: "stretch",
    obstacles: ["no time"],
  });

  const body = await readJson<{ description: string }>(await details(env));

  assert.deepEqual(Object.keys(body), ["description"]);
  assert.equal(body.description.length, 2000);
});

test("keeps the fields that check out when others have the wrong type", async () => {
  const env = await replying({ description: 5, goals: ["2"], cue_type: "people" });

  assert.deepEqual(await readJson(await details(env)), { cue_type: "people" });
});

test("a reply that isn't JSON fills nothing", async () => {
  const env = await makeDetailsEnv(() => Promise.resolve({ response: "Sorry, I can't." }));

  assert.deepEqual(await readJson(await details(env)), {});
});

test("returns 502 when the model can't be reached", async () => {
  const env = await makeDetailsEnv(() => Promise.reject(new Error("AI down")));
  const res = await details(env);

  assert.equal(res.status, 502);
  assert.deepEqual(await readJson(res), { error: MODEL_DOWN });
});

test("refuses anyone but the owner, and a body without a name", async () => {
  const env = await replying({});

  assert.equal((await details(env, STRETCH, STRANGER)).status, 403);
  assert.equal((await details(env, { ...STRETCH, name: " " })).status, 400);
  assert.deepEqual(env.inputs, []);
});

test("is routed at POST /api/habits/draft", async () => {
  const env = await replying({ usual_when: "07:00" });

  const res = await worker.fetch(
    apiRequest("POST", "https://journal.fullchee.workers.dev/api/habits/draft", {
      email: OWNER,
      body: STRETCH,
    }),
    env,
  );

  assert.deepEqual(await readJson(res), { usual_when: "07:00" });
});
