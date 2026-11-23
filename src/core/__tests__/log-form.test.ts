import assert from "node:assert/strict";
import { torontoDate } from "./helpers/toronto";
import { blankHabit, type Draft, type Durations } from "@/core/habits-view";
import type { DraftEntry } from "@/core/log-api";
import {
  blankEntry,
  draftOfNewHabit,
  logForm,
  loggableHabits,
  openEntries,
  withDetails,
  type FormEntry,
} from "@/core/log-form";
import { makeHabit } from "./helpers/habit";

// 2026-11-08 09:00 local.
const now = torontoDate(2026, 10, 8, 9, 0);

const walk = makeHabit({ id: "walk", name: "Walk", record: "duration", targetMinutes: 30 });
const water = makeHabit({ id: "water", name: "Water", record: "count" });
const floss = makeHabit({ id: "floss", name: "Floss", record: "check" });
const habits = [walk, water, floss];

const row = (over: Partial<FormEntry> = {}): FormEntry => ({
  habit: "walk",
  date: "2026-11-08",
  startTime: "08:00",
  minutes: "30",
  count: "1",
  note: "",
  ...over,
});

describe("loggableHabits", () => {
  test("drops Backlog and Reference Habits", () => {
    const backlog = makeHabit({ id: "b", active: false });
    const reference = makeHabit({ id: "r", target: { type: "none", count: 0, days: [] } });

    assert.deepEqual(loggableHabits([walk, backlog, reference]), [walk]);
  });
});

const formOf = (entries: FormEntry[], durations: Durations = {}) =>
  logForm(entries, { habits, durations, now });

const problems = (entries: FormEntry[]) => formOf(entries).rows.map((r) => r.problem);

const overlaps = (entries: FormEntry[], durations: Durations) =>
  formOf(entries, durations).rows.map((r) => r.overlap);

const open = (entries: DraftEntry[]) => openEntries(JSON.stringify(entries), now);

describe("openEntries", () => {
  test("a timed entry today with no start ended just now", () => {
    assert.deepEqual(open([{ habit: "walk", minutes: 25 }]), [
      row({ startTime: "08:35", minutes: "25" }),
    ]);
  });

  test("keeps the model's day, start and count", () => {
    assert.deepEqual(open([{ habit: null, date: "2026-11-07", start_time: "18:00", count: 3 }]), [
      row({ habit: null, date: "2026-11-07", startTime: "18:00", minutes: "", count: "3" }),
    ]);
  });

  test("keeps the model's note", () => {
    assert.deepEqual(
      open([{ habit: "walk", start_time: "08:00", minutes: 30, note: "Lakeshore" }]),
      [row({ note: "Lakeshore" })],
    );
  });

  test("an earlier day or a run past midnight leaves the start blank", () => {
    const opened = open([
      { habit: "walk", date: "2026-11-07", minutes: 20 },
      { habit: "walk", minutes: 600 },
    ]);

    assert.deepEqual(
      opened.map((e) => e.startTime),
      ["", ""],
    );
  });

  test("a missing, empty, malformed or non-JSON draft opens one blank row", () => {
    const blank = [row({ habit: null, startTime: "", minutes: "" })];

    assert.deepEqual(openEntries(undefined, now), blank);
    assert.deepEqual(open([]), blank);
    assert.deepEqual(openEntries('[{ "minutes": 5 }]', now), blank);
    assert.deepEqual(openEntries("not json", now), blank);
  });
});

describe("blankEntry", () => {
  test("is today with no Habit and a count of one", () => {
    assert.deepEqual(blankEntry(now), row({ habit: null, startTime: "", minutes: "" }));
  });
});

describe("logForm problems", () => {
  test("a complete row of each record style saves", () => {
    assert.deepEqual(
      problems([
        row(),
        row({ habit: "water", count: "2" }),
        row({ habit: "floss", minutes: "", startTime: "" }),
      ]),
      [null, null, null],
    );
  });

  test("asks for a Habit and a past day", () => {
    assert.deepEqual(problems([row({ habit: null }), row({ date: "2026-11-09" })]), [
      "Pick a Habit.",
      "Pick a day that isn't in the future.",
    ]);
  });

  test("a timed row needs minutes and a start that has come", () => {
    assert.deepEqual(
      problems([
        row({ minutes: "0" }),
        row({ startTime: "8am" }),
        row({ startTime: "10:00" }),
        row({ date: "2026-11-07", startTime: "22:00" }),
      ]),
      [
        "Enter minutes for Walk, 1 to 1440.",
        "Enter when Walk started, like 08:30.",
        "10:00 today hasn't come yet.",
        null,
      ],
    );
  });

  test("a count row needs a whole number", () => {
    assert.deepEqual(problems([row({ habit: "water", count: "1.5" })]), [
      "Enter how many times for Water.",
    ]);
  });

  test("each row carries its Habit", () => {
    assert.deepEqual(
      formOf([row(), row({ habit: null })]).rows.map((r) => r.habit),
      [walk, undefined],
    );
  });
});

describe("logForm items", () => {
  test("sends only the fields each record style takes", () => {
    assert.deepEqual(
      formOf([
        row({ startTime: "8:05" }),
        row({ habit: "water", count: "2" }),
        row({ habit: "floss" }),
      ]).items,
      [
        { habit: "walk", date: "2026-11-08", start_time: "08:05", minutes: 30 },
        { habit: "water", date: "2026-11-08", count: 2 },
        { habit: "floss", date: "2026-11-08" },
      ],
    );
  });

  test("sends a note on one trimmed line, and none when it is blank", () => {
    assert.deepEqual(
      formOf([row({ note: " Android\n wrapper " }), row({ habit: "floss", note: "  " })]).items,
      [
        {
          habit: "walk",
          date: "2026-11-08",
          start_time: "08:00",
          minutes: 30,
          note: "Android wrapper",
        },
        { habit: "floss", date: "2026-11-08" },
      ],
    );
  });

  test("is null while any row has a problem", () => {
    assert.equal(formOf([row(), row({ habit: null })]).items, null);
    assert.equal(formOf([row(), row({ minutes: "" })]).items, null);
  });

  test("an overlap still saves", () => {
    assert.equal(formOf([row(), row({ startTime: "08:15" })]).items?.length, 2);
  });
});

describe("logForm overlaps", () => {
  const logged = [{ id: 1, startTime: "07:45", minutes: 30 }];
  const durations = { "2026-11-08": { walk: logged } };

  test("warns when a timed row overlaps a logged entry", () => {
    assert.deepEqual(overlaps([row()], durations), [
      "Overlaps Walk 7:45 AM–8:15 AM, already logged.",
    ]);
  });

  test("an entry from the day before can run past midnight into the row", () => {
    const lateNight = { "2026-11-07": { walk: [{ id: 2, startTime: "23:30", minutes: 60 }] } };

    assert.deepEqual(overlaps([row({ startTime: "00:10", minutes: "10" })], lateNight), [
      "Overlaps Walk 11:30 PM–12:30 AM, already logged.",
    ]);
  });

  test("warns on a later row that overlaps an earlier one", () => {
    assert.deepEqual(overlaps([row(), row({ startTime: "08:15" })], {}), [
      null,
      "Overlaps another Walk row.",
    ]);
  });

  test("touching entries, other Habits and untimed rows don't warn", () => {
    const rows = [
      row({ startTime: "08:15", minutes: "15" }),
      row({ habit: "water" }),
      row({ startTime: "" }),
    ];

    assert.deepEqual(overlaps(rows, durations), [null, null, null]);
  });

  test("a row with a problem shows its problem, not an overlap", () => {
    assert.deepEqual(overlaps([row({ date: "2026-11-09" })], { "2026-11-09": { walk: logged } }), [
      null,
    ]);
  });
});

describe("draftOfNewHabit", () => {
  const proposed = {
    name: "Evening walk",
    kind: "good",
    record: "duration",
    target_minutes: 20,
    target_type: "days",
    target_count: 7,
    target_days: [1, 3],
  } as const;

  test("fills the Habit form with the model's guesses", () => {
    const draft = draftOfNewHabit({ ...proposed, target_days: [...proposed.target_days] });

    assert.equal(draft.name, "Evening walk");
    assert.equal(draft.usualWhen, "");
    assert.equal(draft.targetMinutes, 20);
    assert.deepEqual(draft.target, { type: "days", count: 7, days: [1, 3] });
    assert.equal(draft.id, undefined);
  });

  test("an untimed Habit has no minutes", () => {
    assert.equal(
      draftOfNewHabit({ ...proposed, record: "check", target_days: [] }).targetMinutes,
      null,
    );
  });
});

describe("withDetails", () => {
  const details = {
    description: "Ten minutes on the mat",
    why: "Less back pain",
    usual_when: "07:30",
    usual_where: "Living room",
    cue: "I finish my coffee",
    cue_type: "action",
    routine: "stretch for ten minutes",
    reward: "feel loose",
    obstacles: ["no time"],
    goals: [2],
  } as const;

  const filled = () =>
    withDetails(blankHabit("good"), { ...details, obstacles: ["no time"], goals: [2] });

  test("fills every blank field from the model's details", () => {
    const draft = filled();

    assert.equal(draft.description, "Ten minutes on the mat");
    assert.equal(draft.why, "Less back pain");
    assert.equal(draft.usualWhen, "07:30");
    assert.equal(draft.usualWhere, "Living room");
    assert.equal(draft.cue, "I finish my coffee");
    assert.equal(draft.cueType, "action");
    assert.equal(draft.routine, "stretch for ten minutes");
    assert.equal(draft.reward, "feel loose");
    assert.deepEqual(draft.obstacles, ["no time"]);
    assert.deepEqual(draft.goals, [2]);
    assert.equal(draft.stackedAfter, null);
  });

  test("keeps what the owner already typed", () => {
    const typed: Draft = {
      ...blankHabit("good"),
      why: "For my kids",
      cueType: "emotion",
      obstacles: ["too tired"],
      goals: [5],
    };

    const draft = withDetails(typed, { ...details, obstacles: ["no time"], goals: [2] });

    assert.equal(draft.why, "For my kids");
    assert.equal(draft.cueType, "emotion");
    assert.equal(draft.cue, "I finish my coffee");
    assert.deepEqual(draft.obstacles, ["too tired"]);
    assert.deepEqual(draft.goals, [5]);
  });

  test("treats a field of only spaces as blank", () => {
    assert.equal(
      withDetails({ ...blankHabit("good"), why: "  " }, { why: "Less back pain" }).why,
      "Less back pain",
    );
  });

  test("leaves a field the model left out as it was", () => {
    assert.deepEqual(withDetails(blankHabit("bad"), {}), blankHabit("bad"));
  });

  test("a stacked cue fills the Habit it comes after, not the free-text cue", () => {
    const draft = withDetails(blankHabit("good"), {
      cue_type: "stacked",
      stacked_after: "coffee",
      cue: "after coffee",
    });

    assert.equal(draft.cueType, "stacked");
    assert.equal(draft.stackedAfter, "coffee");
    assert.equal(draft.cue, "");
  });

  test("a stacked cue with no Habit named leaves the Habit it follows empty", () => {
    const draft = withDetails(blankHabit("good"), { cue_type: "stacked" });

    assert.equal(draft.stackedAfter, null);
  });

  test("a non-stacked cue the owner picked ignores the model's stacked Habit", () => {
    const draft = withDetails(
      { ...blankHabit("good"), cueType: "people" },
      { cue_type: "stacked", stacked_after: "coffee" },
    );

    assert.equal(draft.cueType, "people");
    assert.equal(draft.stackedAfter, null);
  });

  test("a cue the owner typed before picking a type keeps the text field, not the model's stacked cue", () => {
    const draft = withDetails(
      { ...blankHabit("good"), cue: "I get home" },
      { cue_type: "stacked", stacked_after: "coffee" },
    );

    assert.equal(draft.cueType, "");
    assert.equal(draft.cue, "I get home");
    assert.equal(draft.stackedAfter, null);
  });

  test("a cue the owner typed before picking a type takes the model's non-stacked type", () => {
    const draft = withDetails(
      { ...blankHabit("good"), cue: "I get home" },
      { cue_type: "action", cue: "I park" },
    );

    assert.equal(draft.cueType, "action");
    assert.equal(draft.cue, "I get home");
  });

  test("passes the fields it doesn't fill through unchanged", () => {
    const draft = withDetails(
      { ...blankHabit("good"), name: "Stretch", autoLogged: true },
      { why: "Less back pain" },
    );

    assert.equal(draft.name, "Stretch");
    assert.equal(draft.autoLogged, true);
  });
});
