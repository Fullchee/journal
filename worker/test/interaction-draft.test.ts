import assert from "node:assert/strict";
import { shiftDay, torontoDay } from "@/core";
import {
  INTERACTION_MODEL_DOWN,
  NOBODY_NAMED,
  onRequestPost as postDraft,
} from "@worker/api/interactions/draft";
import type { Ai, Env, Json } from "@worker/lib/env";
import { matchesOf, proposalOf, type InteractionContext } from "@worker/lib/interaction-model";
import { makeD1 } from "./helpers/d1";
import { apiRequest, makeEnv, OWNER, STRANGER } from "./helpers/env";
import { readJson } from "./helpers/json";

const CINDY = { id: 1, name: "Cindy" };
const RAJ = { id: 2, name: "Raj Patel" };
const RAJ_K = { id: 3, name: "Raj Kumar" };
const LO = { id: 4, name: "Mei Lo" };

const PEOPLE = [CINDY, RAJ, RAJ_K, LO];

const TODAY = "2026-11-11";

const ctx: InteractionContext = { today: TODAY, people: PEOPLE };

test("matchesOf prefers the exact name, then a name that starts with it, then a name holding it as a word", () => {
  assert.deepEqual(matchesOf("cindy", PEOPLE), [CINDY]);
  assert.deepEqual(matchesOf("Raj", PEOPLE), [RAJ, RAJ_K]);
  assert.deepEqual(matchesOf("Raj Patel", PEOPLE), [RAJ]);
  assert.deepEqual(matchesOf("Lo", PEOPLE), [LO]);
  assert.deepEqual(matchesOf("Priya", PEOPLE), []);
  assert.deepEqual(matchesOf("  ", PEOPLE), []);
});

test("proposalOf keeps the model's fields and resolves each name to its Connections", () => {
  const reply = {
    people: ["Cindy", "Raj", "Priya", "Cindy", ""],
    date: "2026-11-10",
    kind: "call",
    note: "  Went to\nTaiwan last week ",
    follow_up: "Ask about the Taiwan photos",
  };

  assert.deepEqual(proposalOf(reply, ctx), {
    people: [
      { said: "Cindy", matches: [CINDY] },
      { said: "Raj", matches: [RAJ, RAJ_K] },
      { said: "Priya", matches: [] },
    ],
    day: "2026-11-10",
    kind: "call",
    note: "Went to Taiwan last week",
    followUp: "Ask about the Taiwan photos",
  });
});

test("proposalOf falls back to today, a message and empty text for fields that don't check out", () => {
  for (const date of ["2026-11-12", "2026-02-30", "yesterday", undefined]) {
    const reply = { people: ["Cindy"], date, kind: "email", note: undefined, follow_up: undefined };

    assert.deepEqual(proposalOf(reply, ctx), {
      people: [{ said: "Cindy", matches: [CINDY] }],
      day: TODAY,
      kind: "message",
      note: "",
      followUp: "",
    });
  }
});

async function makeDraftEnv(answer: () => Promise<{ response: string }>) {
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

  await env.DB.exec("INSERT INTO connections (id, name) VALUES (1, 'Cindy'), (2, 'Raj Patel');");

  return env;
}

const replying = (reply: Json) =>
  makeDraftEnv(() => Promise.resolve({ response: JSON.stringify(reply) }));

const draft = (env: Env, body: Json, email: string | null = OWNER) =>
  postDraft({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/interactions/draft", { email, body }),
  });

const CINDY_SENTENCE = { text: "Today I talked to Cindy about how she went to Taiwan last week" };

test("the Cindy sentence proposes an Interaction with her, today, and a follow-up", async () => {
  const env = await replying({
    people: ["Cindy"],
    kind: "in-person",
    note: "Went to Taiwan last week",
    follow_up: "Ask about the Taiwan photos",
  });

  const res = await draft(env, CINDY_SENTENCE);

  assert.equal(res.status, 200);
  assert.deepEqual(await readJson(res), {
    people: [{ said: "Cindy", matches: [CINDY] }],
    day: torontoDay(new Date()),
    kind: "in-person",
    note: "Went to Taiwan last week",
    followUp: "Ask about the Taiwan photos",
  });
});

test("sends the sentence, today and the Connections' names, never their ids", async () => {
  const yesterday = shiftDay(torontoDay(new Date()), -1);
  const env = await replying({ people: ["Cindy"], date: yesterday });

  await draft(env, { text: "Called Cindy yesterday" });

  const [system, user] = env.inputs[0]?.messages ?? [];
  const context = JSON.parse(system?.content.split("Context: ", 2)[1] ?? "");

  assert.deepEqual(context.connections, ["Cindy", "Raj Patel"]);
  assert.equal(context.today, torontoDay(new Date()));
  assert.equal(user?.content, "Called Cindy yesterday");
  assert.equal(env.inputs[0]?.response_format?.type, "json_schema");
});

test("a reply naming nobody asks for a name", async () => {
  const env = await replying({ people: [] });
  const res = await draft(env, { text: "Had a nice day" });

  assert.equal(res.status, 422);
  assert.deepEqual(await readJson(res), { error: NOBODY_NAMED });
});

test("answers 502 when Workers AI fails or replies with no JSON", async () => {
  const down = await makeDraftEnv(() => Promise.reject(new Error("down")));
  const garbled = await makeDraftEnv(() => Promise.resolve({ response: "Sure! Cindy." }));

  for (const env of [down, garbled]) {
    const res = await draft(env, CINDY_SENTENCE);

    assert.equal(res.status, 502);
    assert.deepEqual(await readJson(res), { error: INTERACTION_MODEL_DOWN });
  }
});

test("refuses a stranger and a blank sentence", async () => {
  const env = await replying({ people: ["Cindy"] });

  assert.equal((await draft(env, CINDY_SENTENCE, STRANGER)).status, 403);
  assert.equal((await draft(env, { text: "  " })).status, 400);
  assert.equal(env.inputs.length, 0);
});
