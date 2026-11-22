import assert from "node:assert/strict";
import {
  CARDIO_RULE,
  PULL_UP_RULE,
  SHEET_OWNER as OWNER,
  cardioRows,
  dateSerial,
  dedupeSheet,
  fitbitCardio,
  hevyCardio,
  hevyPullUps,
  hevySets,
  sheetDay,
  storedHevySets,
  skippedByDate,
  type CardioRow,
  type CardioSession,
  type FitbitSessionRow,
  type HevySet,
  type HevySetRow,
  type PullUpRow,
} from "@/core/team-challenge";

const cardio = (date: string, activity: string, quantity: number): CardioRow => ({
  date,
  activity,
  quantity,
});

const pullUps = (date: string, variation: string, reps: number): PullUpRow => ({
  date,
  variation,
  reps,
  assistance_kg: 0,
  added_kg: 0,
});

describe("dedupeSheet", () => {
  test("cardio within a tenth of a km is already logged", () => {
    const rows = [cardio("2026-10-26", "Running", 6.3), cardio("2026-10-27", "Running", 1.1)];

    const sheet = [
      ["2026-10-26", OWNER, "Running", "6.2"],
      ["2026-10-27", OWNER, "Running", 1],
    ];

    assert.deepEqual(dedupeSheet(CARDIO_RULE, sheet, rows), {
      to_log: [],
      already_logged: rows,
      ask: [],
    });
  });

  test("cardio more than a tenth off goes to ask", () => {
    const rows = [cardio("2026-10-26", "Running", 6.31)];
    const sheetRow = ["2026-10-26", OWNER, "Running", "6.2"];

    assert.deepEqual(dedupeSheet(CARDIO_RULE, [sheetRow], rows), {
      to_log: [],
      already_logged: [],
      ask: [{ new: rows[0], sheet_row: sheetRow }],
    });
  });

  test("another activity or Day is logged with its date serial", () => {
    const [walk, run] = [
      cardio("2026-10-26", "Walking", 6.2),
      cardio("2026-10-25", "Running", 6.2),
    ];

    const result = dedupeSheet(CARDIO_RULE, [["2026-10-26", OWNER, "Running", 6.2]], [walk, run]);

    assert.deepEqual(result.to_log, [
      { ...walk, date_serial: 46_321 },
      { ...run, date_serial: 46_320 },
    ]);
  });

  test("one sheet row covers only one new row", () => {
    const rows = [cardio("2026-10-26", "Running", 5), cardio("2026-10-26", "Running", 5)];
    const result = dedupeSheet(CARDIO_RULE, [["2026-10-26", OWNER, "Running", 5]], rows);

    assert.deepEqual(result.already_logged, [rows[0]]);
    assert.deepEqual(result.to_log, [{ ...rows[1], date_serial: 46_321 }]);
  });

  test("an ask reserves its sheet row, so it pairs only once", () => {
    const [first, second] = [
      cardio("2026-10-26", "Running", 7),
      cardio("2026-10-26", "Running", 8),
    ];

    const sheetRow = ["2026-10-26", OWNER, "Running", 5];
    const result = dedupeSheet(CARDIO_RULE, [sheetRow], [first, second]);

    assert.deepEqual(result.ask, [{ new: first, sheet_row: sheetRow }]);
    assert.deepEqual(result.to_log, [{ ...second, date_serial: 46_321 }]);
  });

  test("exact matches claim sheet rows before any ask", () => {
    const [far, exact] = [cardio("2026-10-26", "Running", 7), cardio("2026-10-26", "Running", 5)];
    const result = dedupeSheet(CARDIO_RULE, [["2026-10-26", OWNER, "Running", 5]], [far, exact]);

    assert.deepEqual(result, {
      to_log: [{ ...far, date_serial: 46_321 }],
      already_logged: [exact],
      ask: [],
    });
  });

  test("pull-ups with the same reps are already logged", () => {
    const rows = [pullUps("2026-10-28", "Bodyweight pull-up", 38)];
    const sheet = [["2026-10-28", OWNER, "Bodyweight pull-up", "38"]];

    assert.deepEqual(dedupeSheet(PULL_UP_RULE, sheet, rows).already_logged, rows);
  });

  test("pull-ups with other reps on the same Day go to ask", () => {
    const rows = [pullUps("2026-10-28", "Bodyweight pull-up", 38)];
    const sheetRow = ["2026-10-28", OWNER, "Bodyweight pull-up", "40"];
    const result = dedupeSheet(PULL_UP_RULE, [sheetRow], rows);

    assert.deepEqual(result.ask, [{ new: rows[0], sheet_row: sheetRow }]);
    assert.deepEqual(result.to_log, []);
  });

  test("another pull-up variation is logged", () => {
    const rows = [pullUps("2026-10-28", "Weighted pull-up", 38)];
    const sheet = [["2026-10-28", OWNER, "Bodyweight pull-up", 38]];

    assert.deepEqual(dedupeSheet(PULL_UP_RULE, sheet, rows).to_log, [
      { ...rows[0], date_serial: 46_323 },
    ]);
  });

  test("pull-ups at another load go to ask, and within half a kg are already logged", () => {
    const rows = [{ ...pullUps("2026-10-28", "Weighted pull-up", 10), added_kg: 20.41 }];
    const other = ["2026-10-28", OWNER, "Weighted pull-up", 10, 80, 0, 11.34];
    const close = ["2026-10-28", OWNER, "Weighted pull-up", 10, 80, "", "20"];

    assert.deepEqual(dedupeSheet(PULL_UP_RULE, [other], rows).ask, [
      { new: rows[0], sheet_row: other },
    ]);
    assert.deepEqual(dedupeSheet(PULL_UP_RULE, [close], rows).already_logged, rows);
  });

  test("teammates' rows never match", () => {
    const rows = [pullUps("2026-10-28", "Bodyweight pull-up", 38)];

    const sheet = [
      ["2026-10-28", "Alex Example", "Bodyweight pull-up", 38],
      ["2026-10-28", "Alex Example", "Bodyweight pull-up", 40],
    ];

    assert.deepEqual(dedupeSheet(PULL_UP_RULE, sheet, rows), {
      to_log: [{ ...rows[0], date_serial: 46_323 }],
      already_logged: [],
      ask: [],
    });
  });

  test("the header and short rows are ignored", () => {
    const sheet = [["Date", "Athlete", "Exercise variation", "Reps"], [], ["2026-10-28"]];
    const rows = [pullUps("2026-10-28", "Bodyweight pull-up", 38)];

    assert.equal(dedupeSheet(PULL_UP_RULE, sheet, rows).to_log.length, 1);
  });

  test("serial dates on the sheet match", () => {
    const rows = [cardio("2026-10-26", "Running", 6.2)];

    for (const serial of [46_321, 46_321.4, "46321"])
      assert.deepEqual(
        dedupeSheet(CARDIO_RULE, [[serial, OWNER, "Running", 6.2]], rows).already_logged,
        rows,
      );
  });
});

test("a date serial counts days since 1899-12-30, and a sheet Day reads one back", () => {
  assert.equal(dateSerial("2026-10-26"), 46_321);
  assert.equal(sheetDay(46_321), "2026-10-26");
  assert.equal(sheetDay("2026-10-26"), "2026-10-26");
  assert.equal(sheetDay("Oct 26"), "Oct 26");
});

interface SessionFields {
  km?: number | null;
  minutes?: number | null;
  date?: string;
}

const session = (
  activity: string | null,
  { km = 5, minutes = 30, date = "2026-11-07" }: SessionFields = {},
): CardioSession => ({ date, exercise: `source ${activity}`, activity, km, minutes });

describe("cardioRows", () => {
  test.each([
    ["unmapped", session(null), "no matching sheet activity", null],
    ["no km", session("Running", { km: null }), "no distance", null],
    ["zero km", session("Running", { km: 0 }), "no distance", 0],
    ["no minutes", session("Stair climber", { minutes: null }), "no active minutes", null],
    ["a short ride", session("Outdoor cycling", { km: 6 }), "under 6 km minimum", 6],
  ])("skips %s with its reason", (_name, given, reason, quantity) => {
    assert.deepEqual(cardioRows([given]), {
      rows: [],
      skipped: [{ date: "2026-11-07", exercise: given.exercise, quantity, reason }],
    });
  });

  test("scores km, or minutes for Stair climber, and sorts by date", () => {
    assert.deepEqual(
      cardioRows([
        session("Outdoor cycling", { km: 6.014, date: "2026-11-09" }),
        session("Stair climber", { km: null, minutes: 20.56, date: "2026-11-08" }),
        session("Running", { km: 6.2154 }),
      ]),
      {
        rows: [
          { date: "2026-11-07", activity: "Running", quantity: 6.22 },
          { date: "2026-11-08", activity: "Stair climber", quantity: 20.6 },
          { date: "2026-11-09", activity: "Outdoor cycling", quantity: 6.01 },
        ],
        skipped: [],
      },
    );
  });
});

interface FitbitFields {
  distanceM?: number | null;
  title?: string | null;
  durationS?: number;
}

const fitbit = (
  exerciseType: number,
  { distanceM = 5000, title = null, durationS = 1800 }: FitbitFields = {},
): FitbitSessionRow => ({
  exercise_type: exerciseType,
  title,
  start_date: "2026-11-07",
  duration_s: durationS,
  distance_m: distanceM,
});

describe("fitbitCardio", () => {
  test.each([
    ["a run in km", fitbit(56, { distanceM: 6215.4 }), "Running", 6.22],
    ["stairs in minutes", fitbit(68, { distanceM: null, durationS: 1234 }), "Stair climber", 20.6],
    ["an outdoor ride", fitbit(8, { distanceM: 12_000 }), "Outdoor cycling", 12],
    ["a stationary ride", fitbit(9, { distanceM: 12_000 }), "Indoor cycling", 12],
  ])("maps %s to its sheet row", (_name, row, activity, quantity) => {
    const { sessions, skipped } = fitbitCardio([row]);

    assert.deepEqual(cardioRows(sessions).rows, [{ date: "2026-11-07", activity, quantity }]);
    assert.deepEqual(skipped, []);
  });

  test("skips the rowing machine and assault bike as logged from Hevy, and an unmapped type for want of an activity", () => {
    const { sessions, skipped } = fitbitCardio([
      fitbit(54),
      fitbit(0, { title: "Assault bike" }),
      fitbit(70, { title: "Lift" }),
    ]);

    assert.deepEqual(
      [...skipped, ...cardioRows(sessions).skipped].map(({ exercise, reason }) => [
        exercise,
        reason,
      ]),
      [
        ["exercise type 54", "logged from Hevy"],
        ["Assault bike", "logged from Hevy"],
        ["Lift", "no matching sheet activity"],
      ],
    );
  });
});

const HEADER = "exercise_title,start_time,exercise_notes,reps,weight_lbs,distance_km";

const csvLine = (cells: string[]) => cells.map((cell) => `"${cell}"`).join(",");

interface SetFields {
  start?: string;
  notes?: string;
  reps?: string;
  lbs?: string;
  km?: string;
}

const hevySet = (
  title: string,
  { start = "5 Nov 2026, 17:48", notes = "", reps = "", lbs = "", km = "" }: SetFields = {},
) => csvLine([title, start, notes, reps, lbs, km]);

function sets(...lines: string[]): HevySet[] {
  const parsed = hevySets([HEADER, ...lines].join("\n"));

  assert.ok(parsed);

  return parsed;
}

const RANGE = { since: "2026-10-25", until: "2026-11-08" };

describe("hevySets", () => {
  test("reads each set with its start Day, in kg and km", () => {
    assert.deepEqual(
      sets(
        hevySet("Pull Up", { reps: "9", start: "28 Oct 2026, 07:05", lbs: "10" }),
        hevySet("Rowing Machine", { km: "2.5", notes: "easy" }),
      ),
      [
        {
          workout: "28 Oct 2026, 07:05",
          day: "2026-10-28",
          exercise_title: "Pull Up",
          exercise_notes: "",
          reps: 9,
          weight_kg: 4.536,
          distance_km: null,
        },
        {
          workout: "5 Nov 2026, 17:48",
          day: "2026-11-05",
          exercise_title: "Rowing Machine",
          exercise_notes: "easy",
          reps: 0,
          weight_kg: 0,
          distance_km: 2.5,
        },
      ],
    );
  });

  test("an empty export has no sets", () => {
    assert.deepEqual(hevySets(""), []);
  });

  test("text that isn't Hevy's export is null", () => {
    assert.equal(hevySets("Date,Distance\n2026-11-05,5"), null);
    assert.equal(hevySets([HEADER, hevySet("Pull Up", { start: "2026-11-05" })].join("\n")), null);
    assert.equal(
      hevySets([HEADER, hevySet("Pull Up", { start: "5 Foo 2026, 17:48" })].join("\n")),
      null,
    );
  });
});

const storedRow = (fields: Partial<HevySetRow> = {}): HevySetRow => ({
  workout_id: "w-1",
  start_time: "2026-11-06T02:30:00.000Z",
  exercise_title: "Pull Up",
  exercise_notes: null,
  reps: null,
  weight_kg: null,
  distance_m: null,
  ...fields,
});

describe("storedHevySets", () => {
  test("puts each synced set on its workout's Toronto Day, in kg and km", () => {
    assert.deepEqual(
      storedHevySets([
        storedRow(),
        storedRow({
          workout_id: "w-2",
          start_time: "2026-11-06T15:00:00.000Z",
          exercise_title: "Rowing Machine",
          exercise_notes: "steady",
          reps: 3,
          weight_kg: 5,
          distance_m: 2100,
        }),
      ]),
      [
        {
          workout: "w-1",
          day: "2026-11-05",
          exercise_title: "Pull Up",
          exercise_notes: "",
          reps: 0,
          weight_kg: 0,
          distance_km: null,
        },
        {
          workout: "w-2",
          day: "2026-11-06",
          exercise_title: "Rowing Machine",
          exercise_notes: "steady",
          reps: 3,
          weight_kg: 5,
          distance_km: 2.1,
        },
      ],
    );
  });
});

describe("hevyPullUps", () => {
  test("sums pull-ups, chin-ups and warm-ups into one bodyweight row", () => {
    const given = sets(
      hevySet("Pull Up", { reps: "10" }),
      hevySet("Chin Up", { reps: "5" }),
      hevySet("Pull Up", { reps: "3" }),
    );

    assert.deepEqual(hevyPullUps(given, RANGE), {
      rows: [pullUps("2026-11-05", "Bodyweight pull-up", 18)],
      skipped: [],
    });
  });

  test("splits weighted sets by load in kg", () => {
    const given = sets(
      hevySet("Pull Up (Weighted)", { reps: "6", lbs: "45" }),
      hevySet("Pull Up (Weighted)", { reps: "4", lbs: "45" }),
      hevySet("Pull Up (Weighted)", { reps: "3", lbs: "25" }),
    );

    assert.deepEqual(
      hevyPullUps(given, RANGE).rows.map((row) => [row.variation, row.added_kg, row.reps]),
      [
        ["Weighted pull-up", 11.34, 3],
        ["Weighted pull-up", 20.41, 10],
      ],
    );
  });

  test("puts an assisted set's weight in assistance, and sorts by variation", () => {
    const given = sets(
      hevySet("Pull Up (Assisted)", { reps: "8", lbs: "30" }),
      hevySet("Pull Up (Assisted)", { reps: "2", lbs: "20" }),
      hevySet("Pull Up", { reps: "5" }),
    );

    assert.deepEqual(hevyPullUps(given, RANGE).rows, [
      pullUps("2026-11-05", "Bodyweight pull-up", 5),
      { ...pullUps("2026-11-05", "Machine-assisted pull-up", 2), assistance_kg: 9.07 },
      { ...pullUps("2026-11-05", "Machine-assisted pull-up", 8), assistance_kg: 13.61 },
    ]);
  });

  test("takes the band tier from the notes", () => {
    const given = sets(
      hevySet("Pull Up (Band)", { reps: "10", notes: "Medium band" }),
      hevySet("Pull Up (Band)", { reps: "4" }),
    );

    assert.deepEqual(hevyPullUps(given, RANGE), {
      rows: [pullUps("2026-11-05", "Banded pull-up — medium assist", 10)],
      skipped: [
        {
          date: "2026-11-05",
          exercise: "Pull Up (Band)",
          quantity: 4,
          reason: "band tier missing from notes",
        },
      ],
    });
  });

  test("skips an unknown pull-up title and ignores other exercises", () => {
    const given = sets(
      hevySet("Negative Pull Up", { reps: "5" }),
      hevySet("Push Up", { reps: "20" }),
      hevySet("Bench Press (Barbell)"),
    );

    assert.deepEqual(hevyPullUps(given, RANGE), {
      rows: [],
      skipped: [
        {
          date: "2026-11-05",
          exercise: "Negative Pull Up",
          quantity: 5,
          reason: "no matching sheet variation",
        },
      ],
    });
  });

  test("drops sets outside the range and sorts rows by date", () => {
    const given = sets(
      hevySet("Pull Up", { reps: "7" }),
      hevySet("Pull Up", { reps: "6", start: "28 Oct 2026, 18:00" }),
      hevySet("Pull Up", { reps: "9", start: "7 Oct 2026, 18:00" }),
    );

    assert.deepEqual(
      hevyPullUps(given, RANGE).rows.map((row) => [row.date, row.reps]),
      [
        ["2026-10-28", 6],
        ["2026-11-05", 7],
      ],
    );
  });
});

describe("hevyCardio", () => {
  const start = "29 Oct 2026, 17:53";

  test("sums a workout's rowing sets as one Indoor rowing row", () => {
    const given = sets(
      hevySet("Rowing Machine", { km: "1", start }),
      hevySet("Rowing Machine", { km: "2", start }),
    );

    assert.deepEqual(cardioRows(hevyCardio(given, RANGE)), {
      rows: [{ date: "2026-10-29", activity: "Indoor rowing", quantity: 3 }],
      skipped: [],
    });
  });

  test("keeps two workouts on one Day as two rows", () => {
    const given = sets(
      hevySet("Rowing Machine", { km: "1", start: "29 Oct 2026, 07:00" }),
      hevySet("Rowing Machine", { km: "2", start }),
    );

    assert.deepEqual(
      cardioRows(hevyCardio(given, RANGE)).rows.map((row) => row.quantity),
      [1, 2],
    );
  });

  test("reads the Air Bike's distance from the notes, and skips a set without one", () => {
    const given = sets(
      hevySet("Air Bike", { notes: "3k", start }),
      hevySet("Air Bike", { notes: "hard", start: "30 Oct 2026, 17:00" }),
    );

    assert.deepEqual(cardioRows(hevyCardio(given, RANGE)), {
      rows: [{ date: "2026-10-29", activity: "Indoor cycling", quantity: 3 }],
      skipped: [
        { date: "2026-10-30", exercise: "Air Bike", quantity: null, reason: "no distance" },
      ],
    });
  });

  test("ignores other exercises and sets outside the range", () => {
    const given = sets(
      hevySet("Rowing Machine", { km: "1" }),
      hevySet("Seated Cable Row - V Grip (Cable)"),
      hevySet("Rowing Machine", { km: "0.65", start: "21 Oct 2026, 17:53" }),
      hevySet("Rowing Machine", { km: "1", start: "28 Oct 2026, 17:45" }),
    );

    assert.deepEqual(
      cardioRows(hevyCardio(given, RANGE)).rows.map((row) => row.date),
      ["2026-10-28", "2026-11-05"],
    );
  });
});

const skip = (date: string) => ({ date, exercise: date, quantity: null, reason: "x" });

test("skipped workouts sort by date", () => {
  assert.deepEqual(skippedByDate([skip("2026-11-02"), skip("2026-11-01")]), [
    skip("2026-11-01"),
    skip("2026-11-02"),
  ]);
});
