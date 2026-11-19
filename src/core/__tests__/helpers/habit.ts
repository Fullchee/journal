import type { Habit } from "@/core/habits-view";

/**
 * A tracked daily good Habit with every field filled, so a test overrides only what it checks.
 * The app and ui fixtures build on it, so a new Habit field is added here once.
 */
export const makeHabit = (over: Partial<Habit> = {}): Habit => ({
  id: "up",
  name: "Up",
  description: "",
  why: "",
  usualWhen: "",
  usualWhere: "",
  places: [],
  kind: "good",
  stage: "seed",
  priority: "normal",
  active: true,
  autoLogged: false,
  optOutFrom: null,
  usualMinutes: null,
  startDate: "",
  cue: "",
  cueType: "",
  routine: "",
  reward: "",
  obstacles: [],
  replaces: null,
  stackedAfter: null,
  record: "check",
  targetMinutes: null,
  goals: [],
  alarm: null,
  seasons: [],
  seasonQuietUntil: null,
  tinyVersion: "",
  target: { type: "daily", count: 7, days: [] },
  ...over,
});
