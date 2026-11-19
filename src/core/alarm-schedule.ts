import {
  notificationsFor,
  widgetAlarms,
  type ScheduledNotification,
  type WidgetAlarm,
} from "./alarms";
import { connectionNotifications } from "./connection-notifications";
import type { Connection } from "./connections-view";
import type { Habit } from "./habits-view";
import { shiftDay, torontoDay } from "./calendar";
import { isInSeason, nextSeasonDay } from "./season";
import { restPeriodOn, type RestPeriod } from "./rest-mode";

/** When a notification first shows, in ms since 1970, and how often it repeats after that. */
export interface AlarmTrigger {
  timestamp: number;
  repeat: "day" | "week" | null;
}

export interface PlannedNotification {
  notification: ScheduledNotification;
  trigger: AlarmTrigger;
}

export interface AlarmSchedule {
  notifications: PlannedNotification[];
  widgetAlarms: WidgetAlarm[];
}

/** The next moment after `now` that a schedule fires; `on.weekday` follows the plugin's 1-is-Sunday enum. */
export function firstTrigger(schedule: ScheduledNotification["schedule"], now: Date): AlarmTrigger {
  if (!schedule.on) return { timestamp: schedule.at?.getTime() ?? now.getTime(), repeat: null };

  const { weekday, hour, minute, second } = schedule.on;
  const at = new Date(now);

  at.setHours(hour, minute, second, 0);

  if (weekday !== undefined) at.setDate(at.getDate() + ((weekday - 1 - at.getDay() + 7) % 7));

  // setDate keeps the wall-clock time across a daylight saving change, unlike adding milliseconds.
  if (at <= now) at.setDate(at.getDate() + (weekday === undefined ? 1 : 7));

  return { timestamp: at.getTime(), repeat: weekday === undefined ? "day" : "week" };
}

/** Habit alarms stay quiet until the phone's midnight after the Rest mode period that covers today; null outside Rest mode. */
function quietUntil(restPeriods: RestPeriod[], now: Date) {
  const period = restPeriodOn(restPeriods, torontoDay(now));

  // Alarms ring by the phone's clock (ADR 0013), so the quiet ends at its midnight, not Toronto's.
  return period === null ? null : new Date(`${shiftDay(period.end, 1)}T00:00`);
}

/**
 * When a Habit's alarms first ring: from its next Season day (the phone's midnight), held back by Rest mode;
 * null when no Season is ahead.
 */
function habitRingsFrom(habit: Habit, now: Date, quiet: Date | null) {
  const today = torontoDay(now);
  const day = nextSeasonDay(habit.seasons, today);

  if (day === null) return null;
  const from = day === today ? now : new Date(`${day}T00:00`);

  return quiet !== null && quiet > from ? quiet : from;
}

const plan = (notifications: ScheduledNotification[], from: Date): PlannedNotification[] =>
  notifications.map((notification) => ({
    notification,
    trigger: firstTrigger(notification.schedule, from),
  }));

/**
 * Everything one reschedule hands the phone. `undefined` means that list never loaded:
 * no Habits keeps the last schedule (null), so an offline launch still rings; no Connections drops only their reminders.
 * During Rest mode, Habit alarms first ring after it ends, and outside a Season after the next one starts;
 * Connection reminders keep their times.
 */
export function reschedulePlan(
  habits: Habit[] | undefined,
  connections: Connection[] | undefined,
  now: Date,
  restPeriods: RestPeriod[] = [],
): AlarmSchedule | null {
  if (!habits) return null;
  const quiet = quietUntil(restPeriods, now);

  const habitNotifications = habits.flatMap((habit) => {
    const from = habitRingsFrom(habit, now, quiet);

    return from === null ? [] : plan(notificationsFor([habit], from), from);
  });

  return {
    notifications: [
      ...habitNotifications,
      ...plan(connectionNotifications(connections ?? [], now), now),
    ],
    widgetAlarms: widgetAlarms(
      habits.filter(({ seasons }) => isInSeason(seasons, torontoDay(now))),
    ),
  };
}
