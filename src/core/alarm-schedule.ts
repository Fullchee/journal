import {
  notificationsFor,
  widgetAlarms,
  type ScheduledNotification,
  type WidgetAlarm,
} from "./alarms";
import { connectionNotifications } from "./connection-notifications";
import type { Connection } from "./connections-view";
import { habitDayReader, type DayReading, type HabitRecords, type KnownRecords } from "./habit-day";
import { habitStage } from "./habit-stage";
import type { Habit } from "./habits-view";
import { shiftDay, torontoDay } from "./calendar";
import { isInSeason, nextSeasonDay } from "./season";
import { restPeriodOn, type RestPeriod } from "./rest-mode";
import { upcomingRings, type UpcomingRing } from "./upcoming-ring";

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
  /** A notice before each `alarm` kind ring. */
  upcoming: UpcomingRing[];
  widgetAlarms: WidgetAlarm[];
  /** The Habits whose Postpone still rings: today's Day is neither logged nor silenced. */
  postponesKept: string[];
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
 * Today's Day is logged: Done, a met count, Not done, or a Skip of either cause. A good count Habit with a weekly or
 * monthly target is still needed until its period reaches the target, so its ring waits for that.
 */
function isLogged(habit: Habit, today: DayReading) {
  if (today.skip !== null || today.notDone) return true;

  if (!today.done) return false;

  const byPeriod =
    habit.kind === "good" &&
    habit.record === "count" &&
    (habit.target.type === "weekly" || habit.target.type === "monthly");

  return !byPeriod || !today.needed;
}

/**
 * When a Habit's alarms first ring: from its next Season day (the phone's midnight), held back by Rest mode;
 * null when no Season is ahead. A Habit quiet today starts looking from tomorrow.
 */
function habitRingsFrom(habit: Habit, now: Date, quiet: Date | null, quietToday: boolean) {
  const today = torontoDay(now);
  const day = nextSeasonDay(habit.seasons, quietToday ? shiftDay(today, 1) : today);

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
 * Whether the last due day before `day` that counts was done. A Skip, a Rest mode day, a day off the schedule and a
 * day the period's target no longer needs are passed over. False at the Habit's start or its Season's start.
 */
function lastCountedDayDone(habit: Habit, records: HabitRecords, day: string) {
  const read = habitDayReader(habit, records);

  for (let previous = shiftDay(day, -1); ; previous = shiftDay(previous, -1)) {
    const reading = read(previous);

    if (reading.beforeStart || !reading.inSeason) return false;

    if (reading.needed && !reading.rest && reading.skip === null) return reading.done;
  }
}

/**
 * A plant holds back only its next ring, and only when its last due day was done (ADR 0016). Every later ring stays
 * scheduled, so a held-back day that passes unlogged is a miss and the ring after it fires without the app.
 */
function thinPlant(habit: Habit, planned: PlannedNotification[], records: HabitRecords, now: Date) {
  if (planned.length === 0 || habitStage(habit, records, now) !== "plant") return planned;
  const firstRing = Math.min(...planned.map(({ trigger }) => trigger.timestamp));
  const next = torontoDay(new Date(firstRing));

  if (!lastCountedDayDone(habit, records, next)) return planned;
  const after = new Date(`${shiftDay(next, 1)}T00:00`);

  return plan(notificationsFor([habit], records.restPeriods, after), after);
}

/** The Habits' records, and the Habits whose ring the owner silenced today. */
interface PlanContext extends KnownRecords {
  silenced: string[];
}

/** Today's Day is logged or its ring silenced, so the Habit rings from its next due day and a Postpone goes. */
const isQuietToday = (habit: Habit, now: Date, { records, silenced }: PlanContext) =>
  silenced.includes(habit.id) || isLogged(habit, habitDayReader(habit, records)(torontoDay(now)));

function habitPlan(habit: Habit, now: Date, context: PlanContext) {
  const { restPeriods } = context.records;
  const quietToday = isQuietToday(habit, now, context);
  const from = habitRingsFrom(habit, now, quietUntil(restPeriods, now), quietToday);

  if (from === null) return [];
  const planned = plan(notificationsFor([habit], restPeriods, from), from);

  return context.whole === null ? planned : thinPlant(habit, planned, context.whole, now);
}

const NOTHING_KNOWN: PlanContext = {
  records: { counts: {}, durations: {}, skips: {}, restPeriods: [] },
  whole: null,
  silenced: [],
};

/**
 * Everything one reschedule hands the phone. `undefined` means that list never loaded:
 * no Habits keeps the last schedule (null), so an offline launch still rings; no Connections drops only their reminders.
 * During Rest mode, Habit alarms first ring after it ends, and outside a Season after the next one starts;
 * a Habit whose Day is logged or silenced today first rings on its next due day, and its Postpone goes. Once the
 * `whole` records load, a plant that did its last due day skips its next ring. Connection reminders keep their times.
 */
export function reschedulePlan(
  habits: Habit[] | undefined,
  connections: Connection[] | undefined,
  now: Date,
  context: PlanContext = NOTHING_KNOWN,
): AlarmSchedule | null {
  if (!habits) return null;

  const habitNotifications = habits.flatMap((habit) => habitPlan(habit, now, context));

  return {
    notifications: [
      ...habitNotifications,
      ...plan(connectionNotifications(connections ?? [], now), now),
    ],
    upcoming: upcomingRings(habitNotifications, now),
    postponesKept: habits.flatMap((habit) => (isQuietToday(habit, now, context) ? [] : [habit.id])),
    widgetAlarms: widgetAlarms(
      habits.filter(({ seasons }) => isInSeason(seasons, torontoDay(now))),
      context.records.restPeriods,
      now,
    ),
  };
}

/**
 * The Habit's alarm rings again before the phone's midnight, as `reschedulePlan` schedules it, so the owner can
 * silence today's ring. A logged Day, Rest mode, a Season ahead and a plant's held-back ring all keep it quiet.
 */
export function ringsLaterToday(habit: Habit, now: Date, known: KnownRecords) {
  const midnight = new Date(now);

  midnight.setHours(24, 0, 0, 0);

  return habitPlan(habit, now, { ...known, silenced: [] }).some(
    ({ trigger }) => trigger.timestamp < midnight.getTime(),
  );
}
