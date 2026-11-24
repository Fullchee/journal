import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import notifee, {
  AlarmType,
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  RepeatFrequency,
  TriggerType,
  type Notification,
  type TimestampTrigger,
} from "react-native-notify-kit";

import {
  CHANNEL,
  CHECK_IN_PROMPT_IDS,
  isLoggedToday,
  reschedulePlan,
  type AlarmAction,
  type AlarmSchedule,
  type Habit,
  type PlannedNotification,
  type TodayRecords,
} from "@/core";

import { useAlarmSound } from "@/lib/alarms/alarm-sound";
import { POSTPONE_ACTION, postponedId } from "@/lib/alarms/postponed";
import { useSilencedAlarms } from "@/lib/alarms/silenced-alarms";
import { connectionsQuery } from "@/lib/data/connections";
import { useTodayHabits } from "@/lib/data/habits";
import { askNotificationPermissionOnce } from "@/lib/notifications/ask-permission";
import { useHabitRecords, useRestPeriods } from "@/lib/data/streaks";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../modules/journal-android";

// Declared by the journal-android module's config plugin.
const ALARM_ACTIVITY = "expo.modules.journalandroid.AlarmActivity";

const REPEAT = { day: RepeatFrequency.DAILY, week: RepeatFrequency.WEEKLY } as const;

// Android keeps a channel's sound and importance once created, so changing either needs a new channel id.
// The alarm channel is native: notify-kit plays channel sounds at notification volume, not alarm volume.
const createPersistentChannel = () =>
  notifee.createChannel({
    id: CHANNEL.persistent,
    name: "Persistent",
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
  });

// An `alarm` kind Habit loops its sound and opens AlarmActivity over the lock screen until Dismiss or Open.
// AlarmActivity has no Done or Skip, so those buttons stop the ring only from the notification of an unlocked phone.
const ringing = (habitId: string): Partial<Notification> => ({
  data: { habitId },
  android: {
    loopSound: true,
    category: AndroidCategory.ALARM,
    fullScreenAction: { id: "alarm", launchActivity: ALARM_ACTIVITY },
  },
});

// No launchActivity: a button runs in the background (`alarm-actions`) without opening the app.
const buttons = (habitId: string, actions: AlarmAction[]): Partial<Notification> => ({
  data: { habit: habitId },
  android: {
    actions: [...actions.map(({ id, title }) => ({ title, pressAction: { id } })), POSTPONE_ACTION],
  },
});

function toNotifyKit({ notification, trigger }: PlannedNotification, alarmChannel: string) {
  const { id, habitId, actions = [], title, body, ongoing, autoCancel } = notification;

  const channelId =
    notification.channelId === CHANNEL.alarm ? alarmChannel : notification.channelId;

  const alarm =
    habitId !== undefined && notification.channelId === CHANNEL.alarm ? ringing(habitId) : {};

  const habit = habitId === undefined ? {} : buttons(habitId, actions);

  const shown: Notification = {
    id: String(id),
    title,
    body,
    data: { ...habit.data, ...alarm.data },
    android: {
      channelId,
      ...(ongoing !== undefined && { ongoing }),
      autoCancel,
      smallIcon: "ic_stat_alarm",
      pressAction: { id: "default" },
      ...habit.android,
      ...alarm.android,
    },
  };

  const timestamp: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: trigger.timestamp,
    ...(trigger.repeat !== null && { repeatFrequency: REPEAT[trigger.repeat] }),
    // The alarm-clock type wakes a sleeping phone, and a repeat re-arms with the same type.
    alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
  };

  return [shown, timestamp] as const;
}

/** A postponed reminder rings only while its Habit's Day is open: not logged, not silenced. */
const postponedToKeep = (habits: Habit[], today: TodayRecords, now: Date) =>
  habits.flatMap((habit) =>
    today.silenced.includes(habit.id) || isLoggedToday(habit, today, now)
      ? []
      : [postponedId(habit.id)],
  );

async function applySchedule({ notifications, widgetAlarms }: AlarmSchedule, keep: string[]) {
  // The ask comes with the first Alarm or reminder the owner sets, when the reason is plain, not at first launch.
  // Inside the queue, so a Connections load landing mid-ask waits for the answer instead of asking again.
  if (notifications.length > 0) await askNotificationPermissionOnce();
  await createPersistentChannel();
  const alarmChannel = JournalAndroid.createAlarmChannel();
  // Habits and Connections are the source of truth: Android drops exact alarms when the user revokes that setting.
  // The Check-in prompt plans its own triggers from the Check-ins, so they stay.
  const triggerIds = await notifee.getTriggerNotificationIds();
  await notifee.cancelTriggerNotifications(
    triggerIds.filter((id) => !CHECK_IN_PROMPT_IDS.includes(Number(id)) && !keep.includes(id)),
  );
  await Promise.all(
    notifications.map((planned) =>
      notifee.createTriggerNotification(...toNotifyKit(planned, alarmChannel)),
    ),
  );
  JournalAndroid.setAlarms(JSON.stringify(widgetAlarms));
}

// One reschedule at a time, so a Connections load landing mid-way can't interleave with a Habits one.
const queue = { latest: Promise.resolve() };

async function applyAfter(previous: Promise<void>, schedule: AlarmSchedule, keep: string[]) {
  await Promise.allSettled([previous]);
  await applySchedule(schedule, keep);
}

function reschedule(schedule: AlarmSchedule, keep: string[]) {
  queue.latest = applyAfter(queue.latest, schedule, keep);

  return queue.latest;
}

/**
 * Mount once inside the signed-in app. Reschedules on launch (from the persisted cache) and whenever
 * a save or a sync refetches the Habits, their history or Connections with different data, Rest mode starts or ends, or the owner picks
 * a new alarm sound.
 */
export function useAlarmSchedule() {
  const { data: habits } = useTodayHabits();
  const { data: connections } = useQuery(connectionsQuery);
  const restPeriods = useRestPeriods();
  const records = useHabitRecords(habits);
  const sound = useAlarmSound();
  const silenced = useSilencedAlarms();

  useEffect(() => {
    const now = new Date();
    const today = { ...habits, silenced };

    const schedule = reschedulePlan(habits?.habits, connections?.connections, now, {
      restPeriods,
      today,
      records,
    });

    if (schedule && habits) void reschedule(schedule, postponedToKeep(habits.habits, today, now));
    // A new sound means a new alarm channel, and every alarm must move onto it.
  }, [habits, connections, restPeriods, records, sound, silenced]);
}
