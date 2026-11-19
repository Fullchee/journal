import assert from "node:assert/strict";
import { draftOf } from "@worker/lib/log-draft";
import { ASK_AGAIN, type LogContext } from "@worker/lib/log-plan";
import { ModelReply } from "@worker/lib/log-thread";

const TODAY = "2026-11-06";

const ctx: LogContext = {
  habits: [
    { id: "youtube", name: "YouTube", kind: "bad", record: "duration", targetMinutes: 60 },
    { id: "pushups", name: "Push-ups", kind: "good", record: "count", targetMinutes: null },
  ],
  today: TODAY,
  time: "10:00",
};

const unclear = { type: "unclear", text: ASK_AGAIN.text };

const create = {
  name: "Reading",
  kind: "good",
  record: "duration",
  target_type: "weekly",
  target_count: 3,
};

const reading = {
  name: "Reading",
  kind: "good",
  record: "duration",
  target_minutes: 60,
  target_type: "weekly",
  target_count: 3,
  target_days: [],
};

test("a log reply keeps each known Habit and every valid field, with times as HH:MM", () => {
  const reply: ModelReply = {
    action: "log",
    log: [
      { habit: "youtube", date: "2026-11-05", start_time: "8:05", minutes: 30 },
      { habit: "pushups", count: 20 },
    ],
  };

  assert.deepEqual(draftOf(reply, ctx), {
    type: "entries",
    entries: [
      { habit: "youtube", date: "2026-11-05", start_time: "08:05", minutes: 30 },
      { habit: "pushups", count: 20 },
    ],
  });
});

test("a log reply leaves an unknown Habit null for the owner to pick", () => {
  const reply: ModelReply = { action: "log", log: [{ habit: "reading", minutes: 20 }] };

  assert.deepEqual(draftOf(reply, ctx), {
    type: "entries",
    entries: [{ habit: null, minutes: 20 }],
  });
});

test("a log reply drops each invalid field silently", () => {
  const reply: ModelReply = {
    action: "log",
    log: [
      { habit: "youtube", date: "2026-11-07", start_time: "25:00", minutes: 0, count: 0 },
      { habit: "youtube", date: "2026-02-30", start_time: "8am", minutes: 1441, count: 1.5 },
      { habit: "youtube", date: "yesterday", minutes: 2.5 },
    ],
  };

  assert.deepEqual(draftOf(reply, ctx), {
    type: "entries",
    entries: [{ habit: "youtube" }, { habit: "youtube" }, { habit: "youtube" }],
  });
});

test("a log reply skips items that aren't objects", () => {
  const reply: ModelReply = { action: "log", log: [null, { habit: "pushups" }] };

  assert.deepEqual(draftOf(reply, ctx), { type: "entries", entries: [{ habit: "pushups" }] });
});

test("a log reply without items is unclear", () => {
  assert.deepEqual(draftOf({ action: "log", log: [] }, ctx), unclear);
  assert.deepEqual(draftOf({ action: "log", log: [null] }, ctx), unclear);
  assert.deepEqual(draftOf({ action: "log" }, ctx), unclear);
});

test("an ask reply picks the first known candidate and keeps the entry's valid fields", () => {
  const reply: ModelReply = {
    action: "ask",
    question: "Which Habit was that?",
    habits: ["reading", " YouTube "],
    entry: { start_time: "7:30", minutes: 45, date: "2026-11-09" },
  };

  assert.deepEqual(draftOf(reply, ctx), {
    type: "entries",
    entries: [{ habit: "youtube", start_time: "07:30", minutes: 45 }],
  });
});

test("an ask reply reads candidate ids from options when habits is missing", () => {
  const reply: ModelReply = { action: "ask", options: ["pushups"], entry: { count: 5 } };

  assert.deepEqual(draftOf(reply, ctx), {
    type: "entries",
    entries: [{ habit: "pushups", count: 5 }],
  });
});

test("an ask reply with no known candidate drafts its proposed Habit with the entry", () => {
  const reply: ModelReply = {
    action: "ask",
    question: "Which Habit was that?",
    habits: ["reading"],
    entry: { minutes: 20, start_time: "9:00", date: "2026-11-30" },
    create,
  };

  assert.deepEqual(draftOf(reply, ctx), {
    type: "create",
    habit: reading,
    entry: { minutes: 20, start_time: "09:00" },
  });
});

test("an ask reply with nothing to draft shows the model's question", () => {
  const reply: ModelReply = {
    action: "ask",
    question: "How long did you read?",
    options: ["10 min", "30 min"],
    create: { name: "" },
  };

  assert.deepEqual(draftOf(reply, ctx), { type: "unclear", text: "How long did you read?" });
});

test("an ask reply without a question field is unclear", () => {
  assert.deepEqual(draftOf({ action: "ask" }, ctx), unclear);
});

test("an ask reply with no question is unclear", () => {
  assert.deepEqual(draftOf({ action: "ask", question: " " }, ctx), unclear);
});

test("a create reply drafts the Habit with readCreate's defaults and the valid entry fields", () => {
  const reply: ModelReply = {
    action: "create",
    create: { ...create, target_type: "monthly", minutes: 30, count: -1 },
  };

  assert.deepEqual(draftOf(reply, ctx), {
    type: "create",
    habit: { ...reading, target_type: "daily", target_count: 7 },
    entry: { minutes: 30 },
  });
});

test("an invalid create reply is unclear", () => {
  assert.deepEqual(draftOf({ action: "create", create: { ...create, kind: "meh" } }, ctx), unclear);
  assert.deepEqual(draftOf({ action: "create" }, ctx), unclear);
});

test("any other reply is unclear", () => {
  assert.deepEqual(draftOf(null, ctx), unclear);
  assert.deepEqual(draftOf(ModelReply.parse({ action: "chat" }), ctx), unclear);
  assert.deepEqual(draftOf({}, ctx), unclear);
});
