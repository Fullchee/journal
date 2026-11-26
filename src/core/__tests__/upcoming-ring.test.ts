import assert from "node:assert/strict";
import type { PlannedNotification } from "@/core/alarm-schedule";
import type { ScheduledNotification } from "@/core/alarms";
import { afterNextRing, UPCOMING_LEAD_MS, upcomingRings } from "@/core/upcoming-ring";

// A Friday at noon, local time.
const NOW = new Date(2026, 10, 6, 12, 0);

const at = (...parts: [number, number, number, number, number]) => new Date(...parts).getTime();

const ring = (over: Partial<ScheduledNotification> = {}): ScheduledNotification => ({
  id: 70,
  habitId: "out-of-bed",
  actions: [{ id: "done", title: "Done" }],
  title: "Out of bed",
  body: "",
  channelId: "alarms",
  autoCancel: true,
  schedule: { allowWhileIdle: true },
  ...over,
});

const planned = (
  timestamp: number,
  repeat: "day" | "week" | null,
  over: Partial<ScheduledNotification> = {},
): PlannedNotification => ({ notification: ring(over), trigger: { timestamp, repeat } });

test("an alarm ring gets a notice two hours ahead that repeats with it", () => {
  const sixPm = planned(at(2026, 10, 6, 18, 0), "day");

  assert.deepEqual(upcomingRings([sixPm], NOW), [
    {
      ringId: 70,
      habitId: "out-of-bed",
      title: "Out of bed",
      body: "Rings at 6:00 PM",
      actions: [{ id: "done", title: "Done" }],
      trigger: { timestamp: at(2026, 10, 6, 16, 0), repeat: "day" },
      showNowForMs: null,
    },
  ]);
});

test("a ring inside the lead shows its notice now and the next one on the following repeat", () => {
  const [notice] = upcomingRings([planned(at(2026, 10, 6, 13, 30), "week")], NOW);

  assert.deepEqual(
    [notice?.showNowForMs, notice?.trigger],
    [90 * 60_000, { timestamp: at(2026, 10, 13, 11, 30), repeat: "week" }],
  );
});

test("a ring at exactly the lead shows its notice now", () => {
  const [notice] = upcomingRings([planned(NOW.getTime() + UPCOMING_LEAD_MS, "day")], NOW);

  assert.equal(notice?.showNowForMs, UPCOMING_LEAD_MS);
});

test("a ring that never repeats, inside the lead, shows its notice now and schedules none", () => {
  const { actions: _, ...bare } = ring();
  const trigger = { timestamp: at(2026, 10, 6, 13, 0), repeat: null };
  const [notice] = upcomingRings([{ notification: bare, trigger }], NOW);

  assert.deepEqual([notice?.trigger, notice?.actions], [null, []]);
});

test("a quiet reminder and a Connection reminder get no notice", () => {
  const quiet = planned(at(2026, 10, 6, 18, 0), "day", { channelId: "persistent" });
  const { habitId: _, ...meetup } = ring();
  const trigger = { timestamp: at(2026, 10, 6, 18, 0), repeat: "week" } as const;

  assert.deepEqual(upcomingRings([quiet, { notification: meetup, trigger }], NOW), []);
});

test.each([
  [
    "today's ring still ahead moves to tomorrow",
    at(2026, 10, 6, 18, 0),
    "day",
    at(2026, 10, 7, 18, 0),
  ],
  [
    "a trigger left at a past ring skips the next one",
    at(2026, 10, 3, 18, 0),
    "day",
    at(2026, 10, 7, 18, 0),
  ],
  ["a weekly ring moves a week", at(2026, 10, 6, 18, 0), "week", at(2026, 10, 13, 18, 0)],
] as const)("afterNextRing: %s", (_name, timestamp, repeat, next) => {
  assert.deepEqual(afterNextRing({ timestamp, repeat }, NOW), { timestamp: next, repeat });
});

test("afterNextRing: a ring that never repeats has nothing after it", () => {
  assert.equal(afterNextRing({ timestamp: at(2026, 10, 6, 18, 0), repeat: null }, NOW), null);
});
