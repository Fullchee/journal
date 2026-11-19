import assert from "node:assert/strict";
import { onRequestGet, onRequestPut } from "@worker/api/notes";
import type { Env } from "@worker/lib/env";
import { isNoteType } from "@/core";
import { apiRequest, makeEnv, OWNER } from "./helpers/env";

const RECORDS_URL = "https://x/api/notes/health-records";

const seededEnv = async () => {
  const env = makeEnv();
  await env.DB.prepare(
    "INSERT INTO health_records (id, title, body) VALUES (1, 'Visit Prep', 'a'), (2, 'Medical History', 'b')",
  )
    .bind()
    .run();

  return env;
};

const list = async (env: Env) =>
  (
    await onRequestGet({
      env,
      params: { type: "health-records" },
      request: apiRequest("GET", RECORDS_URL, { email: OWNER }),
    })
  ).json();

test("health records are a note type the view accepts", () => {
  assert.equal(isNoteType("health-records"), true);
});

test("health records list by title", async () => {
  const { items } = await list(await seededEnv());
  assert.deepEqual(
    items.map((i: { title: string }) => i.title),
    ["Medical History", "Visit Prep"],
  );
});

test("the owner saves a health record's body", async () => {
  const saved = await (
    await onRequestPut({
      env: await seededEnv(),
      params: { type: "health-records", id: ["2"] },
      request: apiRequest("PUT", RECORDS_URL, { email: OWNER, body: { body: "c" } }),
    })
  ).json();

  assert.equal(saved.item.title, "Medical History");
  assert.equal(saved.item.body, "c");
});
