import assert from "node:assert/strict";
import { onRequestDelete, onRequestGet, onRequestPost, onRequestPut } from "@worker/api/notes";
import { onRequestGet as getSearch } from "@worker/api/search";
import { onRequestGet as getSessionBrief } from "@worker/api/session-brief";
import { onRequestGet as getWeeklyReview } from "@worker/api/weekly-review";
import type { Env } from "@worker/lib/env";
import { apiRequest, makeEnv, OWNER, STRANGER, type RequestBody } from "./helpers/env";

const NOTES_URL = "https://x/api/notes/career";

const notes = (
  handler: typeof onRequestGet,
  env: Env,
  { id, body, email = OWNER }: { id?: number; body?: RequestBody; email?: string } = {},
) =>
  handler({
    env,
    params: id === undefined ? { type: "career" } : { type: "career", id: [String(id)] },
    request: apiRequest(body === undefined ? "GET" : "POST", NOTES_URL, { email, body }),
  });

const create = async (env: Env, title: string, body: string) => {
  const res = await notes(onRequestPost, env, { body: { title, body } });
  const created: { id: number } = await res.json();

  return created.id;
};

test("the owner creates a Career note and reads it back", async () => {
  const env = makeEnv();
  const id = await create(env, "promotions/2026 packet", "Led the launch");

  const { item } = await (await notes(onRequestGet, env, { id })).json();

  assert.deepEqual([item.title, item.body], ["promotions/2026 packet", "Led the launch"]);
});

test("Career notes list by title, without bodies", async () => {
  const env = makeEnv();
  await create(env, "skills/Writing", "a");
  await create(env, "Career", "b");

  const { items } = await (await notes(onRequestGet, env)).json();

  assert.deepEqual(
    items.map((item: { title: string }) => item.title),
    ["Career", "skills/Writing"],
  );
  assert.equal("body" in items[0], false);
});

test("a second Career note with the same title is a 409", async () => {
  const env = makeEnv();
  await create(env, "Career", "a");

  assert.equal((await notes(onRequestPost, env, { body: { title: "Career" } })).status, 409);
});

test("the owner replaces a Career note's body, then deletes it", async () => {
  const env = makeEnv();
  const id = await create(env, "Career", "old");

  const saved = await (await notes(onRequestPut, env, { id, body: { body: "new" } })).json();

  assert.equal(saved.item.body, "new");
  assert.equal((await notes(onRequestDelete, env, { id })).status, 204);
  assert.equal((await notes(onRequestGet, env, { id })).status, 404);
});

test("a stranger can neither read nor write Career notes", async () => {
  const env = makeEnv();
  const id = await create(env, "Career", "mine");

  assert.equal((await notes(onRequestGet, env, { id, email: STRANGER })).status, 403);
  assert.equal(
    (await notes(onRequestPost, env, { body: { title: "X" }, email: STRANGER })).status,
    403,
  );
});

const MARKER = "Zephyrine";

/** An owner's env holding a Career note with MARKER, and a model that records every prompt it gets. */
async function envWithCareerNote() {
  const env = makeEnv();
  const prompts: string[] = [];
  env.AI = {
    run: (_model, input) => {
      prompts.push(JSON.stringify(input));

      return Promise.resolve({ response: "" });
    },
  };
  await create(env, MARKER, `${MARKER} promotion story`);
  await env.DB.prepare(
    "INSERT INTO check_ins (checked_in_at, zone, score, note) VALUES ('2026-11-04T15:00:00Z', 'Rain', 4, 'calm')",
  )
    .bind()
    .run();

  return { env, prompts };
}

const viewOf = (url: string) => apiRequest("GET", url, { email: OWNER });

test("Career notes stay out of the Session brief, Weekly review and search", async () => {
  const { env, prompts } = await envWithCareerNote();

  const responses = await Promise.all([
    getSessionBrief({
      env,
      params: {},
      request: viewOf("https://x/api/session-brief?start=2026-11-02"),
    }),
    getWeeklyReview({
      env,
      params: {},
      request: viewOf("https://x/api/weekly-review?week=2026-W45"),
    }),
    getSearch({ env, params: {}, request: viewOf("https://x/api/search") }),
    getSearch({ env, params: {}, request: viewOf(`https://x/api/search?q=${MARKER}`) }),
  ]);

  const texts = await Promise.all(responses.map((res) => res.text()));

  assert.deepEqual(
    responses.map((res) => res.status),
    [200, 200, 200, 200],
  );
  assert.equal(texts[2]?.includes("calm"), true, "unfiltered search returns the Check-in");

  for (const text of [...texts, ...prompts]) assert.equal(text.includes(MARKER), false, text);
});
