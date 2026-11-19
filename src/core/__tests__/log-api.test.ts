import assert from "node:assert/strict";
import { HabitDetails, LogDraft, Logged } from "@/core/log-api";

test("LogDraft parses proposed entries, one with no known Habit", () => {
  const draft = {
    type: "entries",
    entries: [
      { habit: "walk", minutes: 25 },
      { habit: null, date: "2026-11-07", count: 2 },
    ],
  };

  assert.deepEqual(LogDraft.parse(draft), draft);
});

test("LogDraft parses a new Habit with the entry it came with", () => {
  const draft = {
    type: "create",
    habit: {
      name: "Evening walk",
      kind: "good",
      record: "duration",
      target_minutes: 20,
      target_type: "weekly",
      target_count: 3,
      target_days: [],
    },
    entry: { minutes: 25 },
  };

  assert.deepEqual(LogDraft.parse(draft), draft);
});

test("LogDraft rejects a draft type this app doesn't know", () => {
  assert.equal(LogDraft.safeParse({ type: "ask", text: "?" }).success, false);
});

test("a new Habit from the model can't be a Reference Habit", () => {
  const habit = {
    name: "Read",
    kind: "good",
    record: "check",
    target_minutes: 0,
    target_type: "none",
    target_count: 0,
    target_days: [],
  };

  assert.equal(LogDraft.safeParse({ type: "create", habit, entry: {} }).success, false);
});

test("Logged parses a save's receipt", () => {
  assert.deepEqual(Logged.parse({ type: "logged", text: "Logged Floss.", action: 3 }), {
    type: "logged",
    text: "Logged Floss.",
    action: 3,
  });
});

test("LogDraft parses a One-off with its day", () => {
  const draft = {
    type: "one-off",
    one_off: { name: "Go portaging", date: "2026-11-14", why: "", usual_when: "" },
    text: "Go portaging on Saturday 14 Nov.",
  };

  assert.deepEqual(LogDraft.parse(draft), draft);
});

test("LogDraft parses a One-off with no day yet", () => {
  const draft = {
    type: "one-off",
    one_off: { name: "Call the clinic", why: "Refill", usual_when: "09:00" },
    text: "Which day is Call the clinic?",
  };

  assert.deepEqual(LogDraft.parse(draft), draft);
});

test("LogDraft refuses a One-off whose usual when isn't HH:MM", () => {
  const draft = {
    type: "one-off",
    one_off: { name: "Call the clinic", why: "", usual_when: "9am" },
    text: "Which day is Call the clinic?",
  };

  assert.equal(LogDraft.safeParse(draft).success, false);
});

test("HabitDetails parses a partial habit-loop guess", () => {
  const details = {
    why: "Calm mornings",
    cue_type: "stacked",
    stacked_after: "coffee",
    obstacles: ["no time"],
    goals: [2],
  };

  assert.deepEqual(HabitDetails.parse(details), details);
  assert.deepEqual(HabitDetails.parse({}), {});
  assert.equal(HabitDetails.safeParse({ cue_type: "smell" }).success, false);
});
