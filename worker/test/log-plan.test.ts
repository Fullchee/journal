import assert from "node:assert/strict";
import { MAX_COUNT } from "@worker/lib/habit-records";
import {
  ASK_AGAIN,
  capCount,
  dayLabel,
  earliestDate,
  readCreate,
  receiptLine,
  resolveItems,
  type LogContext,
  type LogHabit,
  type Plan,
  type Write,
} from "@worker/lib/log-plan";
import type { ModelCreate } from "@worker/lib/log-thread";

const youtube: LogHabit = {
  id: "youtube",
  name: "YouTube",
  kind: "bad",
  record: "duration",
  targetMinutes: 60,
};

const pushups: LogHabit = {
  id: "pushups",
  name: "Push-ups",
  kind: "good",
  record: "count",
  targetMinutes: null,
};

const floss: LogHabit = {
  id: "floss",
  name: "Floss",
  kind: "good",
  record: "check",
  targetMinutes: null,
};

const ctx: LogContext = {
  habits: [youtube, pushups, floss],
  today: "2026-11-06",
  time: "10:00",
};

const writesOf = (plan: Plan) => {
  assert.ok(plan.type === "write");

  return plan.writes;
};

const askOf = (plan: Plan) => {
  assert.ok(plan.type === "ask");

  return plan;
};

test("dayLabel names today, yesterday and older days", () => {
  assert.equal(dayLabel("2026-11-06", "2026-11-06"), "today");
  assert.equal(dayLabel("2026-11-05", "2026-11-06"), "yesterday");
  assert.equal(dayLabel("2026-11-03", "2026-11-06"), "Tue, Nov 3");
});

test("a duration entry with a start time is written as given", () => {
  const [write] = writesOf(
    resolveItems([{ habit: "youtube", start_time: "08:00", minutes: 30 }], ctx),
  );

  assert.deepEqual(write, {
    record: "duration",
    habit: youtube,
    date: "2026-11-06",
    startTime: "08:00",
    minutes: 30,
    endedNow: false,
  });
});

test("a one-digit hour is padded", () => {
  const [write] = writesOf(
    resolveItems([{ habit: "youtube", start_time: "8:15", minutes: 30 }], ctx),
  );

  assert.equal(write?.record === "duration" && write.startTime, "08:15");
});

test("a missing start time means the entry ended just now", () => {
  const [write] = writesOf(resolveItems([{ habit: "youtube", minutes: 30 }], ctx));

  assert.equal(write?.record === "duration" && write.startTime, "09:30");
  assert.equal(write?.record === "duration" && write.endedNow, true);
});

test("an entry that ended just now but started before midnight is logged on the day before", () => {
  const [write] = writesOf(
    resolveItems([{ habit: "youtube", minutes: 45 }], { ...ctx, time: "00:20" }),
  );

  assert.deepEqual(write, {
    record: "duration",
    habit: youtube,
    date: "2026-11-05",
    startTime: "23:35",
    minutes: 45,
    endedNow: true,
  });
});

test("a start time later today asks when it started", () => {
  const plan = resolveItems([{ habit: "youtube", start_time: "21:00", minutes: 30 }], ctx);

  assert.equal(askOf(plan).text, "9:00 PM today hasn't come yet. What time did YouTube start?");
});

test("a late start time on a past day is written", () => {
  const plan = resolveItems(
    [{ habit: "youtube", date: "2026-11-05", start_time: "21:00", minutes: 30 }],
    ctx,
  );

  assert.equal(writesOf(plan).length, 1);
});

test("a past day without a start time asks when it started", () => {
  const plan = resolveItems([{ habit: "youtube", date: "2026-11-05", minutes: 30 }], ctx);

  assert.equal(askOf(plan).text, "What time did YouTube start?");
});

for (const start of ["25:00", "8am", "08:60"])
  test(`a start time of "${start}" asks when it started`, () => {
    const plan = resolveItems([{ habit: "youtube", start_time: start, minutes: 30 }], ctx);

    assert.equal(askOf(plan).text, "What time did YouTube start?");
  });

for (const minutes of [undefined, 0, 1441, 2.5])
  test(`a duration entry of ${minutes} minutes asks how many`, () => {
    const plan = resolveItems([{ habit: "youtube", minutes }], ctx);

    assert.equal(askOf(plan).text, "How many minutes of YouTube?");
  });

test("a missing date means today", () => {
  const [write] = writesOf(resolveItems([{ habit: "floss" }], ctx));

  assert.equal(write?.date, "2026-11-06");
});

test("a given past date is kept", () => {
  const [write] = writesOf(resolveItems([{ habit: "floss", date: "2026-11-01" }], ctx));

  assert.equal(write?.date, "2026-11-01");
});

for (const date of ["2026-11-07", "yesterday", "2026-02-30"])
  test(`the date "${date}" asks which day`, () => {
    const ask = askOf(resolveItems([{ habit: "floss", date }], ctx));

    assert.deepEqual(ask, { type: "ask", text: "Which day was Floss?" });
  });

test("a check Habit always logs a count of 1", () => {
  const [write] = writesOf(resolveItems([{ habit: "floss", count: 5 }], ctx));

  assert.deepEqual(write, { record: "check", habit: floss, date: "2026-11-06", count: 1 });
});

for (const [given, added] of [
  [3, 3],
  [undefined, 1],
  [0, 1],
  [-2, 1],
  [1.5, 1],
] as const)
  test(`a count Habit given ${given} adds ${added}`, () => {
    const [write] = writesOf(resolveItems([{ habit: "pushups", count: given }], ctx));

    assert.deepEqual(write, { record: "count", habit: pushups, date: "2026-11-06", count: added });
  });

test("capCount stops at MAX_COUNT", () => {
  assert.equal(capCount(MAX_COUNT + 5), MAX_COUNT);
  assert.equal(capCount(4), 4);
});

test("an unknown Habit id becomes a question naming it", () => {
  const ask = askOf(resolveItems([{ habit: "youtube-shorts", minutes: 5 }], ctx));

  assert.equal(ask.text, 'Which Habit is "youtube-shorts"?');
});

test("a missing Habit id asks which Habit", () => {
  const ask = askOf(resolveItems([{ minutes: 5 }], ctx));

  assert.equal(ask.text, "Which Habit was that?");
});

test("one bad item stops the whole log", () => {
  const plan = resolveItems([{ habit: "floss" }, { habit: "nope" }], ctx);

  assert.equal(plan.type, "ask");
});

test("several Habits resolve together", () => {
  const writes = writesOf(resolveItems([{ habit: "floss" }, { habit: "pushups", count: 2 }], ctx));

  assert.deepEqual(
    writes.map((w) => w.habit.id),
    ["floss", "pushups"],
  );
});

test("an empty, missing or non-object log asks again", () => {
  assert.equal(resolveItems([], ctx), ASK_AGAIN);
  assert.equal(resolveItems(undefined, ctx), ASK_AGAIN);
  assert.equal(resolveItems([null], ctx), ASK_AGAIN);
});

test("a create proposal keeps a valid bar, or guesses an hour, and keeps the entry", () => {
  assert.deepEqual(
    readCreate({
      name: " Read ",
      kind: "good",
      record: "duration",
      target_minutes: 30,
      minutes: 20,
    }),
    {
      habit: {
        name: "Read",
        kind: "good",
        record: "duration",
        target_minutes: 30,
        target_type: "daily",
        target_count: 7,
        target_days: [],
      },
      entry: { minutes: 20 },
    },
  );
  assert.equal(
    readCreate({ name: "Water", kind: "good", record: "count", target_minutes: -1 })?.habit
      .target_minutes,
    60,
  );
});

const water = { name: "Water", kind: "good", record: "count" };

const scheduleOf = (extra: ModelCreate) => {
  const habit = readCreate({ ...water, ...extra })?.habit;

  return [habit?.target_type, habit?.target_count, habit?.target_days];
};

const guesses: [string, ModelCreate, ReturnType<typeof scheduleOf>][] = [
  ["weekly with a count", { target_type: "weekly", target_count: 3 }, ["weekly", 3, []]],
  [
    "set weekdays, sorted without repeats",
    { target_type: "days", target_days: [4, 1, 4] },
    ["days", 7, [1, 4]],
  ],
  [
    "weekly with a count out of range falls back to daily",
    { target_type: "weekly", target_count: 9 },
    ["daily", 7, []],
  ],
  [
    "days with a bad weekday falls back to daily",
    { target_type: "days", target_days: [7] },
    ["daily", 7, []],
  ],
];

for (const [name, extra, expected] of guesses)
  test(`a create proposal guesses its schedule: ${name}`, () => {
    assert.deepEqual(scheduleOf(extra), expected);
  });

test("an invalid create proposal is null", () => {
  assert.equal(readCreate(null), null);
  assert.equal(readCreate({ name: "", kind: "good", record: "check" }), null);
  assert.equal(readCreate({ name: "x".repeat(201), kind: "good", record: "check" }), null);
  assert.equal(readCreate({ name: "X", kind: "neutral", record: "check" }), null);
  assert.equal(readCreate({ name: "X", kind: "good", record: "hours" }), null);
});

const at = (startTime: string): Extract<Write, { record: "duration" }> => ({
  record: "duration",
  habit: youtube,
  date: "2026-11-06",
  startTime,
  minutes: 30,
  endedNow: false,
});

test("earliestDate picks the first date written, or the fallback", () => {
  assert.equal(
    earliestDate([at("08:00"), { ...at("08:00"), date: "2026-11-02" }], "x"),
    "2026-11-02",
  );
  assert.equal(earliestDate([], "x"), "x");
});

test("receiptLine reads each Record style", () => {
  assert.equal(
    receiptLine(at("08:00"), 90, "2026-11-06"),
    "Logged YouTube: 30 min at 8:00 AM (today 1 h 30 min of 1 h).",
  );
  assert.equal(
    receiptLine({ ...at("09:30"), endedNow: true }, 30, "2026-11-06"),
    "Logged YouTube: 30 min at 9:30 AM, ended just now (today 30 min of 1 h).",
  );
  assert.equal(
    receiptLine({ ...at("09:30"), habit: { ...youtube, targetMinutes: null } }, 30, "2026-11-06"),
    "Logged YouTube: 30 min at 9:30 AM (today 30 min).",
  );
  assert.equal(
    receiptLine({ record: "count", habit: pushups, date: "2026-11-05", count: 2 }, 5, "2026-11-06"),
    "Logged Push-ups: +2 (yesterday 5).",
  );
  assert.equal(
    receiptLine({ record: "check", habit: floss, date: "2026-11-06", count: 1 }, 1, "2026-11-06"),
    "Logged Floss for today.",
  );
});
