// Typed fixtures for app tests: each factory returns a valid row and takes the fields a test cares about.
import {
  blankCheckIn,
  torontoDay,
  type CheckIn,
  type Connection,
  type Habit,
  type TimedHabit,
} from "@/core";
import { makeHabit } from "@/core/__tests__/helpers/habit";

export const habit = (over: Partial<Habit> = {}): Habit =>
  makeHabit({ id: "walk", name: "Walk", startDate: "2026-01-01", ...over });

export const timedHabit = (over: Partial<TimedHabit> = {}): TimedHabit => ({
  ...habit(over),
  targetMinutes: 30,
  ...over,
  record: "duration",
});

export const checkIn = (over: Partial<CheckIn> = {}): CheckIn => ({
  ...blankCheckIn(8, new Date().toISOString()),
  id: 1,
  ...over,
});

const daysAgo = (days: number) => {
  const at = new Date();

  at.setDate(at.getDate() - days);

  return at;
};

export const connection = (over: Partial<Connection> = {}): Connection => ({
  id: 3,
  name: "Mom",
  closeness: "",
  circles: ["Family"],
  cadenceDays: 7,
  lastContactedOn: torontoDay(daysAgo(30)),
  followUps: "",
  howWeMet: "",
  metThrough: null,
  introduced: [],
  links: [],
  meetups: [],
  dates: [],
  growCloser: false,
  planCheckedAt: null,
  contactId: null,
  ...over,
});
