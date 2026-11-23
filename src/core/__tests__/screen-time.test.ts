import assert from "node:assert/strict";
import { lastDays, screenMinutes, windowAfter, type ScreenEvent } from "@/core/screen-time";

// November in Toronto is UTC-5.
const at = (stamp: string) => Date.parse(`${stamp}:00-05:00`);

const on = (stamp: string): ScreenEvent => ({ at: at(stamp), on: true });
const off = (stamp: string): ScreenEvent => ({ at: at(stamp), on: false });

const FROM = at("2026-11-10T00:00");

const until = (stamp: string) => ({ from: FROM, to: at(stamp) });

test("an on and off pair counts its minutes on its Day, and a quiet Day counts 0", () => {
  assert.deepEqual(
    screenMinutes([on("2026-11-10T09:00"), off("2026-11-10T09:45")], until("2026-11-12T00:00")),
    [
      { day: "2026-11-10", minutes: 45 },
      { day: "2026-11-11", minutes: 0 },
    ],
  );
});

test("a session that crosses Toronto midnight splits its minutes between the two Days", () => {
  assert.deepEqual(
    screenMinutes([off("2026-11-11T00:20"), on("2026-11-10T23:30")], until("2026-11-12T00:00")),
    [
      { day: "2026-11-10", minutes: 30 },
      { day: "2026-11-11", minutes: 20 },
    ],
  );
});

test("an off first means the screen was on when the window opened; an on last, that it is still on", () => {
  assert.deepEqual(
    screenMinutes([off("2026-11-10T00:10"), on("2026-11-10T21:50")], until("2026-11-10T22:00")),
    [{ day: "2026-11-10", minutes: 20 }],
  );
});

test("a repeated on or off adds nothing, and a span before the window is dropped", () => {
  assert.deepEqual(
    screenMinutes(
      [
        off("2026-11-09T23:00"),
        on("2026-11-10T08:00"),
        on("2026-11-10T08:30"),
        off("2026-11-10T09:00"),
        off("2026-11-10T09:30"),
      ],
      until("2026-11-11T00:00"),
    ),
    [{ day: "2026-11-10", minutes: 60 }],
  );
});

test("an empty window has no Days", () => {
  assert.deepEqual(screenMinutes([], { from: FROM, to: FROM }), []);
});

test("lastDays opens at midnight so it holds whole Days, today included", () => {
  const now = at("2026-11-10T15:00");

  assert.deepEqual(lastDays(now, 3), { from: at("2026-11-08T00:00"), to: now });
});

test("windowAfter skips the Day a log starts on, since the log misses its start", () => {
  const now = at("2026-11-12T22:30");

  assert.deepEqual(windowAfter(at("2026-11-10T13:05"), now), {
    from: at("2026-11-11T00:00"),
    to: now,
  });
});

test("the fall-back Day holds 25 hours", () => {
  const midnight = Date.parse("2026-11-01T04:00:00Z");
  const nextMidnight = Date.parse("2026-11-02T05:00:00Z");

  assert.deepEqual(
    screenMinutes([{ at: midnight, on: true }], { from: midnight, to: nextMidnight }),
    [{ day: "2026-11-01", minutes: 1500 }],
  );
});
