import assert from "node:assert/strict";
import {
  canSkip,
  defaultAnswer,
  reviewNoteLine,
  reviewOutcomes,
  suggestedCause,
  type ReviewEvent,
} from "@/core/evening-review";

const event = (over: Partial<ReviewEvent>): ReviewEvent => ({
  eventId: "e1",
  habit: "gym",
  habitName: "Gym",
  record: "check",
  summary: "120 Parl workout",
  startTime: "19:00",
  minutes: 90,
  removed: false,
  assumeDone: true,
  ownCalendar: true,
  ...over,
});

test("an assume done event starts done; an ask or removed one starts not done", () => {
  assert.deepEqual(
    [
      defaultAnswer(event({})),
      defaultAnswer(event({ assumeDone: false })),
      defaultAnswer(event({ removed: true })),
    ].map((answer) => answer.done),
    [true, false, false],
  );
});

test("only a removed event on someone else's calendar suggests an outside Skip", () => {
  assert.deepEqual(
    [
      suggestedCause(event({ removed: true, ownCalendar: false })),
      suggestedCause(event({ removed: true })),
      suggestedCause(event({ ownCalendar: false })),
    ],
    ["outside", undefined, undefined],
  );
});

test("a Duration Habit has no Skip", () => {
  assert.deepEqual([canSkip(event({})), canSkip(event({ record: "duration" }))], [true, false]);
});

test("unanswered events take their defaults", () => {
  const sit = event({ eventId: "zoom", habit: "sit", assumeDone: false });

  assert.deepEqual(reviewOutcomes([event({}), sit], []), [
    { kind: "done", habit: "gym", record: "check", events: [event({})] },
  ]);
});

test("any done event makes its Habit's day done, with every done event in start order", () => {
  const late = event({ eventId: "late", startTime: "20:00" });
  const early = event({ eventId: "early", startTime: "07:00" });
  const skipped = event({ eventId: "skipped", startTime: "12:00" });

  assert.deepEqual(
    reviewOutcomes(
      [late, skipped, early],
      [{ eventId: "skipped", done: false, cause: "avoidance" }],
    ),
    [{ kind: "done", habit: "gym", record: "check", events: [early, late] }],
  );
});

test("with nothing done, the first cause by start time makes a Skip", () => {
  const morning = event({ eventId: "am", startTime: "08:00" });
  const evening = event({ eventId: "pm", startTime: "18:00" });

  assert.deepEqual(
    reviewOutcomes(
      [evening, morning],
      [
        { eventId: "pm", done: false, cause: "avoidance" },
        { eventId: "am", done: false },
      ],
    ),
    [{ kind: "skip", habit: "gym", cause: "avoidance" }],
  );
});

test("a cause on a Duration Habit's event logs nothing", () => {
  assert.deepEqual(
    reviewOutcomes(
      [event({ record: "duration" })],
      [{ eventId: "e1", done: false, cause: "outside" }],
    ),
    [],
  );
});

test("a removed event answered done logs nothing", () => {
  assert.deepEqual(reviewOutcomes([event({ removed: true })], [{ eventId: "e1", done: true }]), []);
});

test("a note reads under its Habit's name", () => {
  assert.equal(
    reviewNoteLine({ name: "Side projects", note: "Android wrapper" }),
    "Side projects: Android wrapper",
  );
});
