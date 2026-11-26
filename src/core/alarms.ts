import { clockLabel, daysFrom, minutesOf, shiftDay, torontoDay } from "./calendar";
import { dueBySchedule, canMiss, MISSED } from "./habit-day";
import { isTree } from "./habit-tree";
import {
  dueDateLabel,
  isOneOff,
  isTimed,
  WEEKDAYS,
  type Alarm,
  type Habit,
  type Stage,
} from "./habits-view";
import type { RestPeriod } from "./rest-mode";
import type { SkipCause } from "./skip";

/** A Habit notification's buttons; a count Habit's Done adds one to the Day instead of marking it done. */
export const ALARM_ACTION_IDS = ["done", "add-one", "skip"] as const;

export type AlarmActionId = (typeof ALARM_ACTION_IDS)[number];

export interface AlarmAction {
  id: AlarmActionId;
  title: "Done" | "Skip";
}

/**
 * What the app hands its notification library; it keeps the Capacitor plugin's shape, so `weekday` 1 is Sunday.
 */
export interface ScheduledNotification {
  id: number;
  /** Set on a Habit alarm, so the ringing screen can open that Habit. */
  habitId?: string;
  /** The buttons under a Habit's notification; a Connection reminder has none. */
  actions?: AlarmAction[];
  title: string;
  body: string;
  channelId: string;
  ongoing?: boolean;
  autoCancel: boolean;
  schedule: {
    on?: { weekday?: number; hour: number; minute: number; second: number };
    at?: Date;
    allowWhileIdle: boolean;
  };
}

export const CHANNEL = { alarm: "alarms", persistent: "persistent" } as const;

/** FNV-1a turns text into a stable unsigned 32-bit number. */
export function hashText(text: string) {
  let hash = 0x81_1c_9d_c5;

  // oxlint-disable-next-line unicorn/prefer-code-point -- ids on the phone hash the first UTF-16 unit of each character
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01_00_01_93);

  return hash >>> 0;
}

/**
 * Habit alarm ids stay below 2,000,000,000 so other notifications can use the rest of a Java int.
 * Habit ids are text, and the last digit holds the weekday.
 */
export const notificationId = (habitId: string, weekday = 0) =>
  (hashText(habitId) % 200_000_000) * 10 + weekday;

// A tree rings no more: Rest periods decide whether it still is one.
const ringsOn = (
  habit: Habit,
  restPeriods: RestPeriod[],
  now: Date,
): habit is Habit & { alarm: Alarm } =>
  habit.alarm !== null &&
  habit.active &&
  habit.target.type !== "none" &&
  !isTree(habit, restPeriods, now);

// `weekday` follows the plugin's `Weekday` enum, where 1 is Sunday; a Habit's days use 0 for Sunday.
function notificationFor(habit: Habit & { alarm: Alarm }, weekday?: number): ScheduledNotification {
  const minutes = minutesOf(habit.alarm.time);
  // Without `second`, Android keeps the seconds of the moment the alarm was saved.
  const time = { hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0 };

  return {
    id: notificationId(habit.id, weekday),
    habitId: habit.id,
    actions: alarmActions(habit),
    title: habit.name,
    body: "",
    channelId: CHANNEL[habit.alarm.kind],
    ongoing: true,
    autoCancel: true,
    schedule: { on: weekday === undefined ? time : { weekday, ...time }, allowWhileIdle: true },
  };
}

// A One-off rings once, at its alarm time on its date, and never after; Android would fire a past moment at once.
function oneOffNotifications(habit: Habit & { alarm: Alarm }, now: Date): ScheduledNotification[] {
  const at = new Date(`${habit.startDate}T${habit.alarm.time}`);

  return at <= now ? [] : [{ ...notificationFor(habit), schedule: { at, allowWhileIdle: true } }];
}

/**
 * A timed Habit's Day needs minutes, so it has no Done; a bad Habit's log is never a Done.
 * Only a recurring Habit that can be missed has Skip: a One-off moves with a Reschedule instead.
 */
export function alarmActions(habit: Habit): AlarmAction[] {
  const doneId = habit.record === "count" ? "add-one" : "done";

  const done: AlarmAction[] =
    habit.kind === "good" && !isTimed(habit) ? [{ id: doneId, title: "Done" }] : [];

  const skip: AlarmAction[] =
    canMiss(habit) && !isOneOff(habit) ? [{ id: "skip", title: "Skip" }] : [];

  return [...done, ...skip];
}

/** The check a notification button writes for a Habit on a Day. */
export interface AlarmCheck {
  date: string;
  habit: string;
  count: number;
  cause?: SkipCause;
  note?: string;
}

/**
 * Done marks the Day as one tap would, from its stored `count`; Skip records an outside Skip, since a notification
 * can't ask for a cause.
 */
export function alarmActionCheck(
  action: AlarmActionId,
  { date, habit, count }: Pick<AlarmCheck, "date" | "habit" | "count">,
): AlarmCheck {
  if (action === "skip") return { date, habit, count: MISSED, cause: "outside", note: "" };

  return { date, habit, count: action === "add-one" ? Math.max(0, count) + 1 : 1 };
}

// Android repeats only daily or weekly, so an Every N days Habit rings once on each due day in the next
// INTERVAL_DAYS, and the next reschedule (each launch or sync) adds the days after.
const INTERVAL_DAYS = 30;

// The id's last digit holds the ring's index; past ten, two rings would share an id.
const MAX_INTERVAL_RINGS = 10;

function intervalNotifications(habit: Habit & { alarm: Alarm }, now: Date) {
  const today = torontoDay(now);

  return daysFrom(today, shiftDay(today, INTERVAL_DAYS))
    .filter((day) => dueBySchedule(habit, day))
    .map((day) => new Date(`${day}T${habit.alarm.time}`))
    .filter((at) => at > now)
    .slice(0, MAX_INTERVAL_RINGS)
    .map((at, index) => ({
      ...notificationFor(habit, index),
      schedule: { at, allowWhileIdle: true },
    }));
}

/**
 * Fixed-weekday Habits ring on their days and Every N days Habits on each due day; daily, N× a week and N× a month
 * Habits ring every day.
 */
export const notificationsFor = (
  habits: Habit[],
  restPeriods: RestPeriod[],
  now = new Date(),
): ScheduledNotification[] =>
  habits.flatMap((habit) => {
    if (!ringsOn(habit, restPeriods, now)) return [];

    if (isOneOff(habit)) return oneOffNotifications(habit, now);

    if (habit.target.type === "interval") return intervalNotifications(habit, now);

    return habit.target.type === "days"
      ? habit.target.days.map((day) => notificationFor(habit, day + 1))
      : [notificationFor(habit)];
  });

/** The hint under the alarm control in the Habit form; `stage` is the Habit's Stage today. */
export function alarmNote(
  {
    active,
    target,
    startDate,
    alarm,
  }: Pick<Habit, "active" | "target" | "startDate"> & { alarm: Alarm },
  stage: Stage | null,
) {
  if (stage === "tree") return "Tree Habits don't ring.";

  if (!active) return "Backlog Habits don't ring.";

  const days = {
    once: `on ${dueDateLabel(startDate)}`,
    days: `on ${target.days.map((d) => WEEKDAYS[d]).join(", ")}`,
    daily: "every day",
    weekly: "every day",
    monthly: "every day",
    interval: `every ${target.count} days`,
    none: "every day",
  }[target.type];

  const verb = alarm.kind === "alarm" ? "Rings" : "Shows quietly";

  const plant = stage === "plant" ? " Plant Habits notify only after a missed day." : "";

  return `${verb} at ${clockLabel(alarm.time)} ${days}, in the Android app.${plant}`;
}

/**
 * One row the Android alarms widget can show; `days` use 0 for Sunday and list all seven for a Habit that rings daily.
 */
export interface WidgetAlarm {
  id: string;
  name: string;
  time: string;
  days: number[];
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/**
 * The widget has no WebView, so it gets the ringing Habits as plain rows, earliest first; its rows repeat weekly,
 * so a One-off and an Every N days Habit have none.
 */
export const widgetAlarms = (
  habits: Habit[],
  restPeriods: RestPeriod[],
  now: Date,
): WidgetAlarm[] =>
  habits
    .flatMap((habit) =>
      ringsOn(habit, restPeriods, now) && !isOneOff(habit) && habit.target.type !== "interval"
        ? {
            id: habit.id,
            name: habit.name,
            time: habit.alarm.time,
            days: habit.target.type === "days" ? habit.target.days : EVERY_DAY,
          }
        : [],
    )
    .toSorted((a, b) => a.time.localeCompare(b.time));
