import assert from "node:assert/strict";
import { askLogModel, LOG_MODEL, type ModelContext } from "@worker/lib/log-model";
import type { ModelReply } from "@worker/lib/log-thread";

const context: ModelContext = { habits: [], today: "2026-11-06", time: "10:00", entries: {} };

const textAi = (response: string | undefined) => ({ run: () => Promise.resolve({ response }) });

test("askLogModel reads a reply Workers AI already parsed", async () => {
  const reply: ModelReply = { action: "ask", question: "?" };
  const models: string[] = [];

  const ai = {
    run: (model: string) => {
      models.push(model);

      return Promise.resolve({ response: reply });
    },
  };

  assert.deepEqual(await askLogModel(ai, context, "x"), reply);
  assert.deepEqual(models, [LOG_MODEL]);
});

test("askLogModel reads JSON wrapped in text, and returns null for no JSON", async () => {
  assert.deepEqual(await askLogModel(textAi('Sure: {"action":"ask"}'), context, "x"), {
    action: "ask",
  });
  assert.equal(await askLogModel(textAi("no json"), context, "x"), null);
  assert.equal(await askLogModel(textAi(undefined), context, "x"), null);
});

test("askLogModel returns null for a parsed reply that is not an object", async () => {
  const ai = { run: () => Promise.resolve({ response: [] }) };

  assert.equal(await askLogModel(ai, context, "x"), null);
});
