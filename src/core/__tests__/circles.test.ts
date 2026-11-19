import assert from "node:assert/strict";
import { circleNameFor, followingCircle, newSeasonCircle, type Circle } from "@/core/circles";

const circle = (
  id: number,
  name: string,
  habitId: string | null,
  followsFrom: string | null = "2026-04-01",
): Circle => ({
  id,
  name,
  habitId,
  followsFrom,
  members: [{ id: 1, name: "Ana" }],
});

const team2026 = circle(1, "Shockwave dragon boat 2026", "boat");

const boat = (seasons: { start: string; end: string | null }[]) => ({ id: "boat", seasons });

describe("followingCircle", () => {
  test("a Habit follows the newest Circle linked to it", () => {
    const team2027 = circle(3, "Shockwave dragon boat 2027", "boat", "2027-04-20");

    assert.equal(
      followingCircle([team2026, circle(2, "Mahjong", "mahjong"), team2027], "boat"),
      team2027,
    );
  });

  test("a Habit no Circle follows has none", () => {
    assert.equal(followingCircle([team2026], "run"), null);
  });
});

describe("circleNameFor", () => {
  test.each([
    ["swaps last year for this year", "Shockwave dragon boat 2026", "Shockwave dragon boat 2027"],
    ["adds the year to a name without one", "Shockwave dragon boat", "Shockwave dragon boat 2027"],
  ])("%s", (_name, name, expected) => {
    assert.equal(circleNameFor(name, "2027"), expected);
  });
});

describe("newSeasonCircle", () => {
  const started = boat([
    { start: "2026-04-01", end: "2026-10-18" },
    { start: "2027-04-20", end: null },
  ]);

  test("a Season that opened after the Circle began offers this year's Circle from last year's", () => {
    assert.deepEqual(newSeasonCircle(started, [team2026], "2027-04-22"), {
      from: team2026,
      name: "Shockwave dragon boat 2027",
    });
  });

  test("off-season there is no offer", () => {
    assert.equal(newSeasonCircle(started, [team2026], "2027-03-01"), null);
  });

  test("once this year's Circle exists there is no offer", () => {
    const team2027 = circle(2, "Shockwave dragon boat 2027", "boat", "2027-04-20");

    assert.equal(newSeasonCircle(started, [team2026, team2027], "2027-04-22"), null);
  });

  test("a Habit no Circle follows has no offer", () => {
    assert.equal(newSeasonCircle(started, [], "2027-04-22"), null);
  });

  test("a Circle that already has this year's name has no offer", () => {
    const named = circle(1, "Shockwave dragon boat 2027", "boat", "2026-12-01");

    assert.equal(newSeasonCircle(started, [named], "2027-04-22"), null);
  });

  test("a Circle with no start day has no offer", () => {
    assert.equal(newSeasonCircle(started, [circle(1, "Team", "boat", null)], "2027-04-22"), null);
  });

  test("withinDays keeps the offer to the Season's first days", () => {
    assert.deepEqual(
      [
        newSeasonCircle(started, [team2026], "2027-04-26", 7)?.name,
        newSeasonCircle(started, [team2026], "2027-04-27", 7),
      ],
      ["Shockwave dragon boat 2027", null],
    );
  });
});
