import assert from "node:assert/strict";
import { MISSED, type Habit } from "@/core";
import { makeHabit } from "@/core/__tests__/helpers/habit";
import type { Env } from "@worker/lib/env";
import {
  addDurations,
  applyWrite,
  clearCheck,
  deleteHabitRecords,
  insertHabit,
  MAX_COUNT,
  readRecords,
  removeDurations,
  writeCheck,
  writeSkip,
  type EntrySource,
  type RecordWrite,
} from "@worker/lib/habit-records";
import { freezeDate } from "./helpers/clock";
import { makeEnv } from "./helpers/env";

// A Saturday; 15:00 UTC is 10:00 in Toronto, an hour after the Opt-out practice starts.
const SATURDAY = "2026-11-14";
const LAST_SATURDAY = "2026-11-07";
const DAY = "2026-11-13";

beforeEach(() => freezeDate(Date.parse(`${SATURDAY}T15:00:00Z`)));

afterEach(() => jest.useRealTimers());

const floss = makeHabit({ id: "floss", name: "Floss" });
const pushups = makeHabit({ id: "pushups", name: "Push-ups", record: "count" });
const run = makeHabit({ id: "run", name: "Run", record: "duration", targetMinutes: 30 });

const practice = {
  startDate: "2026-11-01",
  optOutFrom: "2026-11-01",
  target: { type: "days", count: 7, days: [6] },
  alarm: { time: "09:00", kind: "alarm" },
} satisfies Partial<Habit>;

const boat = makeHabit({
  ...practice,
  id: "boat",
  name: "Dragon boat",
  record: "duration",
  targetMinutes: 60,
  usualMinutes: 120,
});

const drills = makeHabit({
  ...practice,
  id: "drills",
  name: "Paddle drills",
  optOutFrom: LAST_SATURDAY,
});

async function envWith(...habits: Habit[]) {
  const env = makeEnv();

  for (const habit of habits) await insertHabit(env, habit);

  return env;
}

const write = (env: Env, statements: RecordWrite) => applyWrite(env.DB, statements);

/** What the one read says about a Habit's Day. */
async function dayOf(env: Env, habit: string, date = DAY) {
  const { counts, durations, skips } = await readRecords(env, date, new Date());

  return {
    count: counts[date]?.[habit],
    minutes: durations[date]?.[habit]?.map(({ minutes }) => minutes),
    skip: skips[date]?.[habit],
  };
}

const skip =
  (habit: string, mode: "set" | "fill" = "set", cause?: "outside" | "avoidance") =>
  (env: Env) =>
    write(env, writeSkip(env.DB, { habit, date: DAY, mode, cause, note: "tired" }));

const entry = { date: DAY, startTime: "07:00", minutes: 30, id: "event-1" };

describe("readRecords", () => {
  test("stores each passed Opt-out Day once: a check, or one entry of the usual length", async () => {
    const env = await envWith(boat, drills);
    await readRecords(env, LAST_SATURDAY, new Date());
    const { counts, durations } = await readRecords(env, LAST_SATURDAY, new Date());

    assert.deepEqual(
      [
        durations[LAST_SATURDAY]?.["boat"]?.map(({ minutes }) => minutes),
        durations[SATURDAY]?.["boat"]?.map(({ minutes }) => minutes),
        counts[LAST_SATURDAY]?.["drills"],
        counts[SATURDAY]?.["drills"],
      ],
      [[120], [120], 1, 1],
    );
  });

  test("an Opt-out Day already answered keeps its answer", async () => {
    const env = await envWith(boat, drills);
    await write(env, writeSkip(env.DB, { habit: "boat", date: LAST_SATURDAY, mode: "set" }));
    await write(env, writeSkip(env.DB, { habit: "drills", date: SATURDAY, mode: "set" }));

    assert.deepEqual(
      [
        (await dayOf(env, "boat", LAST_SATURDAY)).minutes,
        (await dayOf(env, "drills", SATURDAY)).count,
      ],
      [undefined, MISSED],
    );
  });

  test("reads every One-off answer however old, each Skip, and the Rest periods that reach `since`", async () => {
    const env = await envWith(
      floss,
      makeHabit({
        id: "visa",
        startDate: "2026-10-01",
        target: { type: "once", count: 1, days: [] },
      }),
    );

    await write(
      env,
      writeCheck(env.DB, { habit: "visa", date: "2026-10-02", count: 1, mode: "set" }),
    );
    await write(
      env,
      writeCheck(env.DB, { habit: "floss", date: "2026-10-02", count: 1, mode: "set" }),
    );
    await skip("floss", "set", "outside")(env);
    await env.DB.prepare(
      "INSERT INTO rest_periods (start_date, end_date) VALUES ('2026-10-01', '2026-10-05'), ('2026-11-10', '2026-11-20')",
    )
      .bind()
      .run();

    const { counts, skips, restPeriods } = await readRecords(env, DAY, new Date());

    assert.deepEqual(
      { counts, skips, restPeriods },
      {
        counts: { "2026-10-02": { visa: 1 }, [DAY]: { floss: MISSED } },
        skips: { [DAY]: { floss: { cause: "outside", note: "tired" } } },
        restPeriods: [{ start: "2026-11-10", end: "2026-11-20" }],
      },
    );
  });
});

describe("writeCheck", () => {
  test("`set` stores the owner's count over the Day's", async () => {
    const env = await envWith(pushups);
    await write(env, writeCheck(env.DB, { habit: "pushups", date: DAY, count: 3, mode: "set" }));
    await write(env, writeCheck(env.DB, { habit: "pushups", date: DAY, count: 2, mode: "set" }));

    assert.equal((await dayOf(env, "pushups")).count, 2);
  });

  test.each(["set", "add", "fill"] as const)(
    "`%s` gives a duration Habit no count",
    async (mode) => {
      const env = await envWith(run);

      assert.equal(
        await write(env, writeCheck(env.DB, { habit: "run", date: DAY, count: 1, mode })),
        0,
      );
      assert.equal((await dayOf(env, "run")).count, undefined);
    },
  );

  test("`add` adds to a count Habit's Day up to MAX_COUNT, and a check Habit is just done", async () => {
    const env = await envWith(pushups, floss);

    const add = (habit: string, count: number) =>
      write(env, writeCheck(env.DB, { habit, date: DAY, count, mode: "add" }));

    await add("pushups", 2);
    await add("pushups", 3);
    const added = (await dayOf(env, "pushups")).count;
    await add("pushups", MAX_COUNT);
    await add("floss", 1);
    await add("floss", 1);

    assert.deepEqual(
      [added, (await dayOf(env, "pushups")).count, (await dayOf(env, "floss")).count],
      [5, MAX_COUNT, 1],
    );
  });

  test.each(["set", "add"] as const)("`%s` on a Skipped Day replaces the Skip", async (mode) => {
    const env = await envWith(pushups);
    await skip("pushups", "set", "avoidance")(env);
    await write(env, writeCheck(env.DB, { habit: "pushups", date: DAY, count: 2, mode }));

    assert.deepEqual(await dayOf(env, "pushups"), {
      count: 2,
      minutes: undefined,
      skip: undefined,
    });
  });

  test("`fill` stores only on an unanswered Day of a Habit that exists", async () => {
    const env = await envWith(floss, pushups, makeHabit({ id: "read" }));

    const fill = (habit: string) =>
      write(env, writeCheck(env.DB, { habit, date: DAY, count: 1, mode: "fill" }));

    await write(env, writeCheck(env.DB, { habit: "pushups", date: DAY, count: 5, mode: "set" }));
    await skip("read", "set", "outside")(env);

    assert.deepEqual(
      [await fill("floss"), await fill("pushups"), await fill("read"), await fill("gone")],
      [1, 0, 0, 0],
    );
    assert.deepEqual(
      [(await dayOf(env, "pushups")).count, await dayOf(env, "read")],
      [5, { count: MISSED, minutes: undefined, skip: { cause: "outside", note: "tired" } }],
    );
  });
});

describe("writeSkip", () => {
  test("the owner's Skip stores the Day as MISSED with its cause and drops its Duration entries", async () => {
    const env = await envWith(boat);
    await write(env, addDurations(env.DB, "boat", [entry], "owner"));
    await skip("boat", "set", "outside")(env);

    assert.deepEqual(await dayOf(env, "boat"), {
      count: MISSED,
      minutes: undefined,
      skip: { cause: "outside", note: "tired" },
    });
  });

  test("a Skip without a cause keeps the cause the Day has", async () => {
    const env = await envWith(floss);
    await skip("floss", "set", "outside")(env);
    await skip("floss")(env);

    assert.deepEqual((await dayOf(env, "floss")).skip, { cause: "outside", note: "tired" });
  });

  test("a duration Habit can be Skipped only when it is Opt-out", async () => {
    const env = await envWith(run, boat);

    assert.deepEqual(
      [
        await skip("run", "set", "outside")(env),
        await skip("run", "fill", "outside")(env),
        await skip("boat")(env),
      ],
      [0, 0, 1],
    );
    assert.deepEqual(await dayOf(env, "run"), {
      count: undefined,
      minutes: undefined,
      skip: undefined,
    });
  });

  test("an automatic Skip lands only on an unanswered Day of a Habit that exists", async () => {
    const env = await envWith(floss, pushups, boat, makeHabit({ id: "read" }));
    await write(env, writeCheck(env.DB, { habit: "pushups", date: DAY, count: 2, mode: "set" }));
    await write(env, addDurations(env.DB, "boat", [entry], "owner"));
    await skip("read")(env);

    for (const habit of ["floss", "pushups", "boat", "read", "gone"])
      await skip(habit, "fill", "avoidance")(env);
    const { counts, durations, skips } = await readRecords(env, DAY, new Date());

    assert.deepEqual(
      [counts[DAY], durations[DAY]?.["boat"]?.length, skips[DAY]],
      [
        { floss: MISSED, pushups: 2, read: MISSED },
        1,
        { floss: { cause: "avoidance", note: "tired" } },
      ],
    );
  });
});

test("clearCheck clears the Day's check and Skip", async () => {
  const env = await envWith(floss);
  await skip("floss", "set", "outside")(env);
  await env.DB.batch(clearCheck(env.DB, { habit: "floss", date: DAY }));

  assert.deepEqual(await dayOf(env, "floss"), {
    count: undefined,
    minutes: undefined,
    skip: undefined,
  });
});

describe("addDurations", () => {
  test.each(["owner", "import"] satisfies EntrySource[])(
    "a `%s` entry on a Skipped Day replaces the Skip",
    async (source) => {
      const env = await envWith(boat);
      await skip("boat", "set", "avoidance")(env);
      await write(env, addDurations(env.DB, "boat", [entry], source));

      assert.deepEqual(await dayOf(env, "boat"), {
        count: undefined,
        minutes: [30],
        skip: undefined,
      });
    },
  );

  test("a calendar event never replaces a Skip", async () => {
    const env = await envWith(boat);
    await skip("boat", "set", "avoidance")(env);

    assert.equal(await write(env, addDurations(env.DB, "boat", [entry], "calendar")), 0);
    assert.deepEqual((await dayOf(env, "boat")).minutes, undefined);
  });

  test("only a duration Habit takes entries", async () => {
    const env = await envWith(floss);

    assert.equal(await write(env, addDurations(env.DB, "floss", [entry], "owner")), 0);
  });

  test("an import skips an entry whose date and start the Habit has, and keeps the longest of repeats", async () => {
    const env = await envWith(run);
    await write(env, addDurations(env.DB, "run", [entry], "owner"));

    const added = await write(
      env,
      addDurations(
        env.DB,
        "run",
        [
          entry,
          { ...entry, startTime: "18:00", minutes: 20 },
          { ...entry, startTime: "18:00", minutes: 40 },
        ],
        "import",
      ),
    );

    assert.deepEqual([added, (await dayOf(env, "run")).minutes], [1, [30, 40]]);
  });

  test("a calendar event logs one entry however often it is confirmed", async () => {
    const env = await envWith(run);
    await write(env, addDurations(env.DB, "run", [entry], "calendar"));
    await write(env, addDurations(env.DB, "run", [entry], "calendar"));

    assert.deepEqual((await dayOf(env, "run")).minutes, [30]);
  });
});

test("removeDurations removes one entry by id, or one of several identical ones", async () => {
  const env = await envWith(run);
  await write(env, addDurations(env.DB, "run", [entry, entry, { ...entry, minutes: 45 }], "owner"));
  const { durations } = await readRecords(env, DAY, new Date());
  const longest = durations[DAY]?.["run"]?.find(({ minutes }) => minutes === 45);

  await write(env, removeDurations(env.DB, { id: longest?.id ?? 0 }));
  const match = { habit: "run", date: DAY, startTime: "07:00", minutes: 30 };

  assert.equal(await write(env, removeDurations(env.DB, { entry: match })), 1);
  assert.deepEqual((await dayOf(env, "run")).minutes, [30]);
});

test("deleteHabitRecords deletes only that Habit's checks, entries and Skips", async () => {
  const env = await envWith(floss, boat);
  await skip("floss", "set", "outside")(env);
  await write(env, addDurations(env.DB, "boat", [entry], "owner"));
  await skip("boat", "set", "outside")(env);
  await write(env, addDurations(env.DB, "boat", [{ ...entry, date: SATURDAY }], "owner"));
  await env.DB.batch(deleteHabitRecords(env.DB, "boat"));
  const { counts, durations, skips } = await readRecords(env, DAY, new Date());

  // The read stores today's Opt-out practice again, as for any Habit with no answer.
  assert.deepEqual(
    [counts, Object.keys(durations[SATURDAY] ?? {}), skips],
    [
      { [DAY]: { floss: MISSED } },
      ["boat"],
      { [DAY]: { floss: { cause: "outside", note: "tired" } } },
    ],
  );
});
