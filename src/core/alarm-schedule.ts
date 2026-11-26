import {
  notificationsFor,
  widgetAlarms,
  type ScheduledNotification,
  type WidgetAlarm,
} from "./alarms";
import { connectionNotifications } from "./connection-notifications";
import type { Connection } from "./connections-view";
import { habitDays, type StreakRecords } from "./habit-day";
import { habitStage } from "./habit-stage";
import type { Counts, Durations, Habit, Skips } from "./habits-view";
import { isoAt, shiftDay, torontoDay } from "./calendar";
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
 * The Habits' recent Days, as the Habits list carries them (absent before it loads), and the Habits whose ring the
 * owner silenced today.
 */
export interface TodayRecords {
  counts?: Counts | undefined;
  durations?: Durations | undefined;
  skips?: Skips | undefined;
  silenced: string[];
}

/**
 * Today's Day is answered: Done, Not done, or a Skip of either cause. A good count Habit with a weekly or monthly
 * target stays due until its period reaches the target, so its ring waits for that.
 */
export function isLoggedToday(
  habit: Habit,
  { counts = {}, durations = {}, skips = {} }: Omit<TodayRecords, "silenced">,
  now: Date,
) {
  if (Object.hasOwn(skips[torontoDay(now)] ?? {}, habit.id)) return true;
  const day = habitDays(habit, { counts, durations }).on(now);

  if (day.status !== "done") return day.status === "missed";

  const byPeriod =
    habit.kind === "good" &&
    habit.record === "count" &&
    (habit.target.type === "weekly" || habit.target.type === "monthly");

  return !byPeriod || !day.due;
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

const NOTHING_LOGGED: TodayRecords = { silenced: [] };

/**
 * Whether the last due day before `day` that counts was done. A Skip, a Rest mode day, a day off the schedule and a
 * day the period's target no longer needs are passed over. False at the Habit's start or its Season's start.
 */
function lastCountedDayDone(habit: Habit, records: StreakRecords, day: string) {
  const days = habitDays(habit, records);

  for (
    let previous = shiftDay(day, -1);
    previous >= habit.startDate && isInSeason(habit.seasons, previous);
    previous = shiftDay(previous, -1)
  ) {
    const reading = days.on(new Date(isoAt(previous)));

    const passedOver =
      Object.hasOwn(records.skips[previous] ?? {}, habit.id) ||
      restPeriodOn(records.restPeriods, previous) !== null ||
      !reading.due;

    if (!passedOver) return reading.status === "done";
  }

  return false;
}

/**
 * A plant holds back only its next ring, and only when its last due day was done (ADR 0016). Every later ring stays
 * scheduled, so a held-back day that passes unlogged is a miss and the ring after it fires without the app.
 */
function thinPlant(
  habit: Habit,
  planned: PlannedNotification[],
  { records, restPeriods, now }: { records: StreakRecords; restPeriods: RestPeriod[]; now: Date },
) {
  if (planned.length === 0 || habitStage(habit, records, now) !== "plant") return planned;
  const firstRing = Math.min(...planned.map(({ trigger }) => trigger.timestamp));
  const next = torontoDay(new Date(firstRing));

  if (!lastCountedDayDone(habit, records, next)) return planned;
  const after = new Date(`${shiftDay(next, 1)}T00:00`);

  return plan(notificationsFor([habit], restPeriods, after), after);
}

interface PlanContext {
  restPeriods: RestPeriod[];
  today: TodayRecords;
  records: StreakRecords | null;
}

function habitPlan(habit: Habit, now: Date, { restPeriods, today, records }: PlanContext) {
  const quietToday = today.silenced.includes(habit.id) || isLoggedToday(habit, today, now);
  const from = habitRingsFrom(habit, now, quietUntil(restPeriods, now), quietToday);

  if (from === null) return [];
  const planned = plan(notificationsFor([habit], restPeriods, from), from);

  return records === null ? planned : thinPlant(habit, planned, { records, restPeriods, now });
}

/**
 * Everything one reschedule hands the phone. `undefined` means that list never loaded:
 * no Habits keeps the last schedule (null), so an offline launch still rings; no Connections drops only their reminders.
 * During Rest mode, Habit alarms first ring after it ends, and outside a Season after the next one starts;
 * a Habit whose Day is logged or silenced today first rings on its next due day. With every Habit's `records`, a plant
 * that did its last due day skips its next ring. Connection reminders keep their times.
 */
export function reschedulePlan(
  habits: Habit[] | undefined,
  connections: Connection[] | undefined,
  now: Date,
  {
    restPeriods = [],
    today = NOTHING_LOGGED,
    records = null,
  }: { restPeriods?: RestPeriod[]; today?: TodayRecords; records?: StreakRecords | null } = {},
): AlarmSchedule | null {
  if (!habits) return null;

  const habitNotifications = habits.flatMap((habit) =>
    habitPlan(habit, now, { restPeriods, today, records }),
  );

  return {
    notifications: [
      ...habitNotifications,
      ...plan(connectionNotifications(connections ?? [], now), now),
    ],
    upcoming: upcomingRings(habitNotifications, now),
    widgetAlarms: widgetAlarms(
      habits.filter(({ seasons }) => isInSeason(seasons, torontoDay(now))),
      restPeriods,
      now,
    ),
  };
}

/**
 * The Habit's alarm rings again before the phone's midnight, as `reschedulePlan` schedules it, so the owner can
 * silence today's ring. A logged Day, Rest mode, a Season ahead and a plant's held-back ring all keep it quiet.
 */
export function ringsLaterToday(
  habit: Habit,
  now: Date,
  {
    restPeriods,
    logged,
    records,
  }: {
    restPeriods: RestPeriod[];
    logged: Omit<TodayRecords, "silenced">;
    records: StreakRecords | null;
  },
) {
  const midnight = new Date(now);

  midnight.setHours(24, 0, 0, 0);
  const today = { ...logged, silenced: [] };

  return habitPlan(habit, now, { restPeriods, today, records }).some(
    ({ trigger }) => trigger.timestamp < midnight.getTime(),
  );
}
