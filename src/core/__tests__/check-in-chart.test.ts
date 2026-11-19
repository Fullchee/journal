import assert from "node:assert/strict";
import { torontoDate } from "./helpers/toronto";

import {
  STRIP_GAP,
  STRIP_HEIGHTS,
  ZONE_BANDS,
  layoutStrips,
  nearestPoint,
  sleepAxisLabels,
  stripDomain,
  stripsWithData,
} from "@/core/check-in-chart";
import { chartData, checkInWindow, pagesFor } from "@/core/check-in-view";

const NOW = torontoDate(2026, 10, 4, 15);

const checkIn = (
  day: number,
  score: number,
  ratings: { tense?: number; low?: number; tired?: number } = {},
) => ({
  id: day,
  score,
  checkedInAt: torontoDate(2026, 10, day, 9).toISOString(),
  ...ratings,
});

// Every night in these tests ends on the morning of Nov 3.
const night = (sleepStart = "2026-11-02T23:00", sleepEnd = "2026-11-03T07:00") => ({
  date: "2026-11-03",
  sleepStart,
  sleepEnd,
});

test("mood points keep their Check-in", () => {
  const { points } = chartData([checkIn(3, 6)], 7, NOW);

  assert.equal(points[0]?.checkIn.id, 3);
});

test("zone bands split the mood strip into four equal bands, Storm at the bottom", () => {
  assert.deepEqual(
    ZONE_BANDS.map((b) => [b.zone, b.to - b.from]),
    [
      ["Storm", 2],
      ["Rain", 2],
      ["Cloud", 2],
      ["Sun", 2],
    ],
  );
  assert.deepEqual(stripDomain("mood", { sleep: [] }), [ZONE_BANDS[0]?.from, ZONE_BANDS[3]?.to]);
});

test("Tense, Low and Tired run None (0) to A lot (2)", () => {
  assert.deepEqual(stripDomain("ratings", { sleep: [] }), [0, 2]);
});

test("the sleep strip runs from the earliest bedtime's hour down to the latest wake's next hour", () => {
  const data = chartData([], 7, NOW, [
    night("2026-11-02T22:13", "2026-11-03T06:00"),
    night("2026-11-03T00:40", "2026-11-03T08:20"),
  ]);

  // Bottom to top: 9 AM (900 past 18:00) up to 10 PM (240).
  assert.deepEqual(stripDomain("sleep", data), [900, 240]);
});

test("the sleep gutter labels its top and bottom hours on a 12-hour clock", () => {
  assert.deepEqual(sleepAxisLabels([900, 240]), [
    { value: 240, label: "10 PM" },
    { value: 900, label: "9 AM" },
  ]);
});

test("strips with no data in the range are hidden", () => {
  const moodOnly = chartData([checkIn(3, 6)], 7, NOW);
  const withLow = chartData([checkIn(3, 6, { low: 2 })], 7, NOW);
  const withTired = chartData([checkIn(3, 6, { tired: 0 })], 7, NOW);
  const withAll = chartData([checkIn(3, 6, { tense: 1 })], 7, NOW, [night()]);

  assert.deepEqual(stripsWithData(chartData([], 7, NOW)), []);
  assert.deepEqual(stripsWithData(moodOnly), ["mood"]);
  assert.deepEqual(stripsWithData(withLow), ["mood", "ratings"]);
  assert.deepEqual(stripsWithData(withTired), ["mood", "ratings"]);
  assert.deepEqual(stripsWithData(withAll), ["mood", "ratings", "sleep"]);
});

test("a night outside the range hides the sleep strip", () => {
  const data = chartData([checkIn(4, 6)], "day", NOW, [night()]);

  assert.deepEqual(stripsWithData(data), ["mood"]);
});

test("strips stack from the top with a gap between them", () => {
  const { boxes, height } = layoutStrips(["mood", "sleep"]);

  assert.deepEqual(boxes, [
    { id: "mood", top: 0, height: STRIP_HEIGHTS.mood },
    { id: "sleep", top: STRIP_HEIGHTS.mood + STRIP_GAP, height: STRIP_HEIGHTS.sleep },
  ]);
  assert.equal(height, STRIP_HEIGHTS.mood + STRIP_GAP + STRIP_HEIGHTS.sleep);
});

test("no strips take no height", () => {
  assert.deepEqual(layoutStrips([]), { boxes: [], height: 0 });
});

test("a tap picks the nearest point within reach", () => {
  const points = [{ x: 100 }, { x: 200 }, { x: 260 }];

  assert.equal(nearestPoint(points, 240, 50), points[2]);
  assert.equal(nearestPoint(points, 140, 50), points[0]);
  assert.equal(nearestPoint(points, 400, 50), undefined);
});

const on = (month: number, day: number) => ({
  ...checkIn(day, 5),
  checkedInAt: torontoDate(2026, month, day, 9).toISOString(),
});

describe("pagesFor", () => {
  const newestFirst = [on(10, 4), on(9, 22), on(9, 21)];

  test.each([
    ["the newest Check-in", 0, 1],
    ["the last day of the first two weeks", 1, 1],
    ["the day before them", 2, 2],
  ])("shows %s", (_name, index, pages) => {
    const target = newestFirst[index]!;

    assert.equal(pagesFor(newestFirst, target), pages);
    assert.ok(checkInWindow(newestFirst, pages).shown.includes(target));
  });
});
