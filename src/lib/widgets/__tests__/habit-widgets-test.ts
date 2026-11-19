import { isoAt, shiftDay, torontoDay, type Habit } from "@/core";

import type { HabitsBody } from "@/lib/data/habits";
import { habitWidgets, tileEntry } from "@/lib/widgets/habit-widgets";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit, timedHabit } from "../../../../jest/fixtures";

const NOW = new Date();
const TODAY = torontoDay(NOW);
const YESTERDAY = shiftDay(TODAY, -1);

const body = (habits: Habit[], over: Partial<HabitsBody> = {}): HabitsBody => ({
  habits,
  counts: {},
  durations: {},
  ...over,
});

const entry = (startTime: string) => ({ id: 1, startTime, minutes: 10 });

describe("habitWidgets", () => {
  it("lists today's open Habits with a tick, leaving out the done ones", () => {
    const walk = habit({ id: "walk", name: "Walk" });
    const meds = habit({ id: "meds", name: "Meds" });

    expect(habitWidgets(body([walk, meds], { counts: { [TODAY]: { meds: 1 } } }), NOW)).toEqual({
      date: TODAY,
      due: [{ id: "walk", name: "Walk", tick: true }],
      timed: null,
    });
  });

  it("gives a timed Habit no tick, since it logs minutes", () => {
    const read = timedHabit({ id: "read", name: "Read" });

    expect(habitWidgets(body([read]), NOW).due).toEqual([
      { id: "read", name: "Read", tick: false },
    ]);
  });

  it("reads a list fetched without checks as nothing done yet", () => {
    const walk = habit({ id: "walk", name: "Walk" });

    expect(habitWidgets({ habits: [walk] }, NOW).due).toHaveLength(1);
  });
});

describe("the Quick Settings tile's Habit", () => {
  const read = timedHabit({ id: "read", name: "Read" });
  const meditate = timedHabit({ id: "meditate", name: "Meditate" });

  it("is the timed Habit logged most recently", () => {
    const durations = {
      [YESTERDAY]: { read: [entry("21:00")] },
      [TODAY]: { meditate: [entry("06:30")], read: [entry("07:15")] },
    };

    expect(habitWidgets(body([meditate, read], { durations }), NOW).timed).toEqual({
      id: "read",
      name: "Read",
    });
  });

  it("is the first timed Habit when none was logged this week", () => {
    expect(habitWidgets(body([meditate, read]), NOW).timed).toEqual({
      id: "meditate",
      name: "Meditate",
    });
  });

  it("skips Auto-logged, Backlog and untimed Habits, even when logged", () => {
    const hevy = timedHabit({ id: "hevy", name: "Lift", autoLogged: true });
    const shelved = timedHabit({ id: "shelved", name: "Draw", active: false });
    const walk = habit({ id: "walk", name: "Walk" });
    const durations = { [TODAY]: { hevy: [entry("08:00")], shelved: [entry("09:00")] } };

    expect(habitWidgets(body([hevy, shelved, walk, read], { durations }), NOW).timed).toEqual({
      id: "read",
      name: "Read",
    });
  });

  it("is none without a timed Habit", () => {
    expect(habitWidgets({ habits: [habit()] }, NOW).timed).toBeNull();
  });
});

describe("tileEntry", () => {
  const start = Date.parse(isoAt("2026-11-03", 23 * 60 + 50));

  it("logs the session on the Toronto Day and time it started, in whole minutes", () => {
    expect(tileEntry("read", start, start + 24.6 * 60_000)).toEqual({
      habit: "read",
      date: "2026-11-03",
      startTime: "23:50",
      minutes: 25,
    });
  });

  it("logs at least a minute", () => {
    expect(tileEntry("read", start, start + 5000).minutes).toBe(1);
  });
});
