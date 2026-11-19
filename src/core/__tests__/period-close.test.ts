import assert from "node:assert/strict";
import {
  assembleCloseBody,
  closeSignals,
  closingQuestion,
  closeSources,
  currentPeriod,
  draftFor,
  goalMoveLine,
  hasCloseContent,
  isClosePeriod,
  nextYearStart,
  parseCloseDraft,
  periodRange,
  savedMoveLines,
  shiftClosePeriod,
  type CloseGoal,
  type CloseSourcesBody,
} from "@/core/period-close";

describe("isClosePeriod", () => {
  for (const [kind, period, valid] of [
    ["quarter", "2026-Q4", true],
    ["quarter", "2026-Q1", true],
    ["quarter", "2026-Q5", false],
    ["quarter", "2026-Q0", false],
    ["quarter", "2026", false],
    ["year", "2026", true],
    ["year", "2026-Q4", false],
    ["year", "26", false],
  ] as const)
    test(`${kind} ${period} is ${valid ? "valid" : "invalid"}`, () => {
      assert.equal(isClosePeriod(kind, period), valid);
    });
});

describe("periodRange", () => {
  test("a quarter runs from its first month's 1st to its last month's last day", () => {
    assert.deepEqual(periodRange("quarter", "2026-Q4"), { from: "2026-10-01", to: "2026-12-31" });
    assert.deepEqual(periodRange("quarter", "2026-Q1"), { from: "2026-01-01", to: "2026-03-31" });
    assert.deepEqual(periodRange("quarter", "2024-Q1"), { from: "2024-01-01", to: "2024-03-31" });
    assert.deepEqual(periodRange("quarter", "2026-Q3"), { from: "2026-07-01", to: "2026-09-30" });
  });

  test("a year runs from 1 January to 31 December", () => {
    assert.deepEqual(periodRange("year", "2026"), { from: "2026-01-01", to: "2026-12-31" });
  });
});

describe("closeSources", () => {
  test("a quarter reads the ISO weeks whose Thursday falls in it, then its three months", () => {
    const sources = closeSources("quarter", "2026-Q4");
    const weeks = sources.filter((s) => s.kind === "week").map((s) => s.period);

    // 2026-W40 starts Mon Sep 28; its Thursday is Oct 1. 2026-W53 starts Mon Dec 28; its Thursday is Dec 31.
    assert.equal(weeks[0], "2026-W40");
    assert.equal(weeks.at(-1), "2026-W53");
    assert.equal(weeks.length, 14);
    assert.deepEqual(
      sources.filter((s) => s.kind === "month"),
      [
        { kind: "month", period: "2026-10" },
        { kind: "month", period: "2026-11" },
        { kind: "month", period: "2026-12" },
      ],
    );
  });

  test("a quarter leaves out a week whose Thursday falls in the quarter before", () => {
    // 2026-W53's Thursday is Dec 31, so Q1 starts at 2027-W01. 2027-W13's Thursday is Apr 1, so it ends at W12.
    const weeks = closeSources("quarter", "2027-Q1").filter((s) => s.kind === "week");

    assert.deepEqual(weeks[0], { kind: "week", period: "2027-W01" });
    assert.deepEqual(weeks.at(-1), { kind: "week", period: "2027-W12" });
    assert.equal(weeks.length, 12);
  });

  test("a year reads its four quarters", () => {
    assert.deepEqual(closeSources("year", "2026"), [
      { kind: "quarter", period: "2026-Q1" },
      { kind: "quarter", period: "2026-Q2" },
      { kind: "quarter", period: "2026-Q3" },
      { kind: "quarter", period: "2026-Q4" },
    ]);
  });
});

describe("shiftClosePeriod and currentPeriod", () => {
  test("quarters step across years", () => {
    assert.equal(shiftClosePeriod("quarter", "2026-Q4", 1), "2027-Q1");
    assert.equal(shiftClosePeriod("quarter", "2026-Q1", -1), "2025-Q4");
    assert.equal(shiftClosePeriod("quarter", "2026-Q2", 0), "2026-Q2");
  });

  test("years step by one", () => {
    assert.equal(shiftClosePeriod("year", "2026", -1), "2025");
  });

  test("the current period is the one holding Toronto today", () => {
    // 03:00 UTC on 1 January is still 31 December in Toronto.
    const now = new Date("2027-01-01T03:00:00Z");

    assert.equal(currentPeriod("quarter", now), "2026-Q4");
    assert.equal(currentPeriod("year", now), "2026");
  });

  test("next year starts in January after the closed year", () => {
    assert.equal(nextYearStart("2026"), "2027-01");
  });
});

describe("goalMoveLine", () => {
  test("a non-carry move is a dated line in the owner's words", () => {
    assert.equal(
      goalMoveLine(
        "2026-09-30",
        "Cultivate Meditation",
        { move: "achieve" },
        "it stuck  every\nmorning",
      ),
      "2026-09-30 — Cultivate Meditation achieved: it stuck every morning",
    );
    assert.equal(
      goalMoveLine("2026-12-31", "Run", { move: "retire" }, ""),
      "2026-12-31 — Run retired",
    );
    assert.equal(
      goalMoveLine("2026-12-31", "Run", { move: "revise", revision: "Move daily" }, "broader"),
      "2026-12-31 — Run revised to Move daily: broader",
    );
  });

  test("a carry is undated", () => {
    assert.equal(
      goalMoveLine("2026-12-31", "Run", { move: "carry" }, "still going"),
      "Run carried: still going",
    );
  });
});

describe("assembleCloseBody", () => {
  test("a quarter uses its three fixed headings", () => {
    assert.equal(
      assembleCloseBody("quarter", {
        arc: "A slow start.",
        goalLines: ["2026-12-31 — Run achieved"],
        answer: "Sitting stuck.",
        newGoals: [],
      }),
      [
        "## The arc this quarter",
        "",
        "A slow start.",
        "",
        "## Goal review",
        "",
        "- 2026-12-31 — Run achieved",
        "",
        "## What shifted, and which practice stuck?",
        "",
        "Sitting stuck.",
        "",
      ].join("\n"),
    );
  });

  test("a year puts its answer under the through-line and lists the picked Goals", () => {
    assert.equal(
      assembleCloseBody("year", {
        arc: "Rebuilding.",
        goalLines: ["Run carried"],
        answer: "Coming home to myself.",
        newGoals: ["Sleep by 11"],
      }),
      [
        "## The through-line this year",
        "",
        "Rebuilding.",
        "",
        "Coming home to myself.",
        "",
        "## Goal movement this year",
        "",
        "- Run carried",
        "",
        "### Next year's Goals",
        "",
        "- Sleep by 11",
        "",
      ].join("\n"),
    );
  });

  test("a year with no picked Goals has no next-year heading", () => {
    const body = assembleCloseBody("year", { arc: "", goalLines: [], answer: "", newGoals: [] });

    assert.equal(body.includes("Next year's Goals"), false);
  });

  test("each rung asks its own closing question", () => {
    assert.match(closingQuestion("quarter"), /this quarter/);
    assert.match(closingQuestion("year"), /this year/);
  });

  test("empty sections keep their headings and blank text drops out", () => {
    const body = assembleCloseBody("quarter", {
      arc: "  ",
      goalLines: [],
      answer: "",
      newGoals: [],
    });

    assert.equal(
      body,
      "## The arc this quarter\n\n## Goal review\n\nNo active Goals.\n\n## What shifted, and which practice stuck?\n",
    );
  });
});

describe("closeSignals", () => {
  const EMPTY = { sleep: [], activity: [], checkIns: [], habitsDone: [] };

  test("a signal with no data gets no line", () => {
    assert.deepEqual(closeSignals(EMPTY, "2026-10-01", "2026-12-31"), []);
  });

  test("it summarizes each signal over the period", () => {
    const lines = closeSignals(
      {
        sleep: [
          { date: "2026-10-01", durationMin: 420, sleepScore: 80 },
          { date: "2026-10-02", durationMin: 480, sleepScore: null },
        ],
        activity: [
          {
            date: "2026-10-01",
            steps: 8000,
            moderateMin: null,
            vigorousMin: null,
            restingHr: null,
            avgStress: 30,
          },
        ],
        checkIns: [
          { checkedInAt: "2026-10-01T12:00:00Z", zone: "Sun" },
          { checkedInAt: "2026-10-02T12:00:00Z", zone: "Sun" },
          { checkedInAt: "2026-10-03T12:00:00Z", zone: "Storm" },
          // 01:00 UTC on 1 Jan is still 31 Dec in Toronto; 03:00 UTC on 1 Oct is still 30 Sep.
          { checkedInAt: "2027-01-01T01:00:00Z", zone: "Rain" },
          { checkedInAt: "2026-10-01T03:00:00Z", zone: "Rain" },
        ],
        habitsDone: [
          { date: "2026-10-01", name: "Sit" },
          { date: "2026-10-01", name: "Walk" },
          { date: "2026-10-02", name: "Walk" },
          { date: "2026-10-02", name: "Hike" },
        ],
      },
      "2026-10-01",
      "2026-12-31",
    );

    assert.deepEqual(lines, [
      "- Sleep: 2 nights, average 7h 30m",
      "- Activity: average 8,000 steps, average stress 30",
      "- Check-ins: 4 (Storm 1, Rain 1, Sun 2)",
      "- Habits done: Walk on 2 days, Hike on 1 day, Sit on 1 day",
    ]);
  });
});

const GOALS: CloseGoal[] = [
  { id: 1, title: "Cultivate Meditation", why: "Calm", habits: ["Sit"] },
  { id: 2, title: "Run", why: "", habits: [] },
];

describe("parseCloseDraft and draftFor", () => {
  test("a reply that is not the draft's JSON is null", () => {
    assert.equal(parseCloseDraft("no"), null);
    assert.equal(parseCloseDraft('{"arc": 1}'), null);
  });

  test("every active Goal gets exactly one review, carry when the model skipped it", () => {
    const reply = parseCloseDraft(
      JSON.stringify({
        arc: "Steady.",
        reviews: [
          { goal: "cultivate meditation ", review: "Most mornings.", move: "achieve" },
          { goal: "Cultivate Meditation", review: "Twice.", move: "retire" },
          { goal: "Unknown", review: "x", move: "retire" },
        ],
        newGoals: [{ title: "Sleep by 11" }],
      }),
    );

    assert.notEqual(reply, null);
    assert.deepEqual(draftFor("quarter", GOALS, reply ?? assert.fail()), {
      arc: "Steady.",
      reviews: [
        { goalId: 1, review: "Most mornings.", move: "achieve", revision: "" },
        { goalId: 2, review: "", move: "carry", revision: "" },
      ],
      newGoals: [],
    });
  });

  test("a year keeps the proposed Goals and an unknown move becomes carry", () => {
    const reply = parseCloseDraft(
      JSON.stringify({
        arc: "A year.",
        reviews: [{ goal: "Run", review: "Less.", move: "grade it", revision: "" }],
        newGoals: [{ title: "Sleep by 11", why: "Mornings" }],
      }),
    );

    const draft = draftFor("year", GOALS, reply ?? assert.fail());

    assert.deepEqual(draft.reviews[1], { goalId: 2, review: "Less.", move: "carry", revision: "" });
    // A felt why is the owner's to write, so the model's is dropped.
    assert.deepEqual(draft.newGoals, [{ title: "Sleep by 11" }]);
  });
});

const sourcesBody = (fields: Partial<CloseSourcesBody>): CloseSourcesBody => ({
  kind: "quarter",
  period: "2026-Q4",
  sources: [],
  signals: [],
  goals: [],
  existing: null,
  ...fields,
});

describe("hasCloseContent", () => {
  const body = sourcesBody;

  test("blank or missing sources and no signals are no content", () => {
    assert.equal(
      hasCloseContent(
        body({
          sources: [
            { kind: "week", period: "2026-W40", body: null },
            { kind: "month", period: "2026-10", body: " " },
          ],
        }),
      ),
      false,
    );
  });

  test("a written source or a signal is content", () => {
    assert.equal(
      hasCloseContent(body({ sources: [{ kind: "week", period: "2026-W40", body: "x" }] })),
      true,
    );
    assert.equal(hasCloseContent(body({ signals: ["- Sleep: 1 night"] })), true);
  });
});

describe("savedMoveLines", () => {
  test("keeps each dated move line and drops carries and prose", () => {
    const body = assembleCloseBody("quarter", {
      arc: "- 2026 was odd",
      goalLines: [
        "2026-09-30 — Meditate achieved: it stuck",
        "Run carried",
        "2026-09-30 — Read revised to Read daily",
      ],
      answer: "",
      newGoals: [],
    });

    assert.deepEqual(savedMoveLines(body), [
      "2026-09-30 — Meditate achieved: it stuck",
      "2026-09-30 — Read revised to Read daily",
    ]);
  });
});
