import assert from "node:assert/strict";
import { amountLabel, isTiredButWired, moodLines } from "@/core/check-in-mood";
import { briefRowOf } from "@/core/session-brief";
import { blankCheckIn, type CheckIn } from "@/core/check-in-view";

const checkIn = (rows: Partial<Pick<CheckIn, "tense" | "low" | "tired">>): CheckIn => ({
  ...blankCheckIn(4, "2026-11-04T15:00:00Z"),
  ...rows,
});

for (const [value, label] of [
  [null, ""],
  [0, "None"],
  [1, "Some"],
  [2, "A lot"],
  [3, ""],
] as const)
  test(`amountLabel reads ${String(value)} as ${JSON.stringify(label)}`, () => {
    assert.equal(amountLabel(value), label);
  });

for (const [tense, tired, expected] of [
  [2, 2, true],
  [1, 2, false],
  [2, 1, false],
  [null, 2, false],
  [2, null, false],
] as const)
  test(`isTiredButWired is ${String(expected)} for Tense ${String(tense)} and Tired ${String(tired)}`, () => {
    assert.equal(isTiredButWired({ tense, tired }), expected);
  });

test("briefRowOf names each row's amount and flags tired but wired", () => {
  const row = briefRowOf(checkIn({ tense: 2, low: 0, tired: 2 }));

  assert.deepEqual(
    [row.tense, row.low, row.tired, row.tiredButWired],
    ["A lot", "None", "A lot", true],
  );
});

test("moodLines counts each row over the Check-ins that answered it, most first", () => {
  const rows = [
    checkIn({ tense: 2, tired: 2 }),
    checkIn({ tense: 2, low: 1, tired: 2 }),
    checkIn({ tense: 1, low: 0 }),
    checkIn({ tense: 0 }),
    checkIn({}),
  ].map((c) => briefRowOf(c));

  assert.deepEqual(moodLines(rows), [
    "Tense: A lot on 2 of 4 Check-ins, Some on 1, None on 1",
    "Low: Some on 1 of 2 Check-ins, None on 1",
    "Tired: A lot on 2 of 2 Check-ins",
    "Tired but wired (Tense and Tired both A lot): 2 Check-ins",
  ]);
});

test("moodLines is empty when no Check-in answered a row", () => {
  const unanswered = briefRowOf(checkIn({}));

  assert.deepEqual(moodLines([unanswered]), []);
});
