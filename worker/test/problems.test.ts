import assert from "node:assert/strict";
import {
  onRequestPatch as patchCheckIn,
  onRequestPost as postCheckIn,
} from "@worker/api/check-ins";
import { onRequestPost as postHabit } from "@worker/api/habits";
import { onRequestGet as search } from "@worker/api/search";
import type { Env, Json, PagesContext } from "@worker/lib/env";
import type { CheckIn, Habit } from "@/core";
import { apiRequest, makeEnv, OWNER } from "./helpers/env";
import { readJson } from "./helpers/json";

interface CheckInBody {
  id: number;
}

interface SearchBody {
  habits: Habit[];
  checkIns: CheckIn[];
}

// eslint-disable-next-line max-params -- a test helper mirrors the handler call it wraps; grouping its arguments only adds noise
const send = (
  handler: (context: PagesContext) => Promise<Response>,
  env: Env,
  email: string,
  method: string,
  body?: Json,
  url = "https://x/api",
) =>
  handler({
    env,
    params: {},
    request: apiRequest(method, url, { body, email }),
  });

const HYPERFOCUS = {
  type: "habit",
  name: "Hyperfocus on the wrong thing",
  description: "Locks me onto a non-priority.",
  usualWhere: "Work piles up",
  places: ["Library"],
  kind: "bad",
};

const findAll = async (env: Env, qs: string) =>
  readJson<SearchBody>(
    await send(search, env, OWNER, "GET", undefined, `https://x/api/search?${qs}`),
  );

test("search by text matches Check-in notes and habit descriptions", async () => {
  const env = makeEnv();

  const ci = await readJson<CheckInBody>(
    await send(postCheckIn, env, OWNER, "POST", { score: 2, note: "stuck building dashboard" }),
  );

  await send(postHabit, env, OWNER, "POST", HYPERFOCUS);

  assert.deepEqual(
    (await findAll(env, "q=dashboard")).checkIns.map((c) => c.id),
    [ci.id],
  );
  assert.equal((await findAll(env, "q=non-priority")).habits.length, 1);
});

const HABIT_QUERIES: [string, string, string[]][] = [
  ["name_any_case", "HYPERFOCUS", [HYPERFOCUS.name]],
  ["usual_where", "piles up", [HYPERFOCUS.name]],
  ["places", "library", [HYPERFOCUS.name]],
  ["wildcard_is_literal", "%", []],
];

for (const [id, q, names] of HABIT_QUERIES) {
  test(`search filters habits by text: ${id}`, async () => {
    const env = makeEnv();
    await send(postHabit, env, OWNER, "POST", HYPERFOCUS);
    const { habits } = await findAll(env, new URLSearchParams({ q }).toString());
    assert.deepEqual(
      habits.map((h) => h.name),
      names,
    );
  });
}

test("search matches non-ASCII letters only in the same case", async () => {
  const env = makeEnv();
  await send(postHabit, env, OWNER, "POST", { ...HYPERFOCUS, name: "École run" });
  const { habits } = await findAll(env, new URLSearchParams({ q: "école" }).toString());
  assert.deepEqual(habits, []);
});

test("search returns a Check-in with its Tense and Low amounts", async () => {
  const env = makeEnv();

  const ci = await readJson<CheckInBody>(
    await send(postCheckIn, env, OWNER, "POST", { score: 4, note: "edgy" }),
  );

  await send(patchCheckIn, env, OWNER, "PATCH", { id: ci.id, tense: 2, low: 0 });

  const [hit] = (await findAll(env, "q=edgy")).checkIns;
  assert.deepEqual([hit?.tense, hit?.low], [2, 0]);
});

test("search matches a Check-in by its Parts' current names and by Self", async () => {
  const env = makeEnv();

  const named = await readJson<CheckInBody>(
    await send(postCheckIn, env, OWNER, "POST", { score: 4 }),
  );

  const self = await readJson<CheckInBody>(
    await send(postCheckIn, env, OWNER, "POST", { score: 5 }),
  );

  // The test seed adds Doer as Part 2.
  await send(patchCheckIn, env, OWNER, "PATCH", { id: named.id, parts: [{ id: 2, name: "Doer" }] });
  await send(patchCheckIn, env, OWNER, "PATCH", { id: self.id, inControl: "Self" });
  await env.DB.prepare("UPDATE parts SET name = 'Achiever' WHERE id = 2").bind().run();

  const ids = async (q: string) => (await findAll(env, `q=${q}`)).checkIns.map((c) => c.id);

  assert.deepEqual(await ids("achiever"), [named.id]);
  assert.deepEqual(await ids("doer"), []);
  assert.deepEqual(await ids("self"), [self.id]);
});

test("an empty search lists every habit", async () => {
  const env = makeEnv();
  await send(postHabit, env, OWNER, "POST", HYPERFOCUS);
  assert.ok((await findAll(env, "q=")).habits.length > 1);
});
