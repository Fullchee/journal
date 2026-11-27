import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import notifee, {
  AlarmType,
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  type Notification,
} from "react-native-notify-kit";

import {
  CHANNEL,
  CHECK_IN_PROMPT_IDS,
  reschedulePlan,
  type AlarmAction,
  type AlarmSchedule,
  type PlannedNotification,
  type UpcomingRing,
  UPCOMING_LEAD_MS,
} from "@/core";

import { useAlarmSound } from "@/lib/alarms/alarm-sound";
import { POSTPONE_ACTION, postponedId } from "@/lib/alarms/postponed";
import { ringTrigger } from "@/lib/alarms/ring-trigger";
import {
  DISMISS_RING_ACTION,
  isUpcomingId,
  UPCOMING_CHANNEL,
  upcomingId,
} from "@/lib/alarms/upcoming";
import { useSilencedAlarms } from "@/lib/alarms/silenced-alarms";
import { connectionsQuery } from "@/lib/data/connections";
import { useTodayHabits } from "@/lib/data/habits";
import { askNotificationPermissionOnce } from "@/lib/notifications/ask-permission";
import { useHabitRecords } from "@/lib/data/streaks";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../modules/journal-android";

// Declared by the journal-android module's config plugin.
const ALARM_ACTIVITY = "expo.modules.journalandroid.AlarmActivity";

// Android keeps a channel's sound and importance once created, so changing either needs a new channel id.
// The alarm channel is native: notify-kit plays channel sounds at notification volume, not alarm volume.
// The upcoming-alarm notice is low importance: the ring after it is the loud part.
const createChannels = () =>
  notifee.createChannels([
    {
      id: CHANNEL.persistent,
      name: "Persistent",
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
    },
    {
      id: UPCOMING_CHANNEL,
      name: "Upcoming alarms",
      importance: AndroidImportance.LOW,
      visibility: AndroidVisibility.PUBLIC,
    },
  ]);

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
const actionButtons = (actions: AlarmAction[]) =>
  actions.map(({ id, title }) => ({ title, pressAction: { id } }));

const buttons = (habitId: string, actions: AlarmAction[]): Partial<Notification> => ({
  data: { habit: habitId },
  android: { actions: [...actionButtons(actions), POSTPONE_ACTION] },
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

  return [shown, ringTrigger(trigger)] as const;
}

// `ring` lets a button skip the ring itself; the notice leaves on its own once the ring is due.
const upcomingNotice = (
  { ringId, habitId, title, body, actions }: UpcomingRing,
  timeoutAfter: number,
): Notification => ({
  id: upcomingId(ringId),
  title,
  body,
  data: { habit: habitId, ring: String(ringId) },
  android: {
    channelId: UPCOMING_CHANNEL,
    smallIcon: "ic_stat_alarm",
    timeoutAfter,
    onlyAlertOnce: true,
    pressAction: { id: "default" },
    actions: [...actionButtons(actions), DISMISS_RING_ACTION],
  },
});

/** Shows the notices whose ring is inside the lead now, schedules the later ones, and clears the rest. */
async function applyUpcoming(upcoming: UpcomingRing[]) {
  const dueNow = upcoming.flatMap((ring) =>
    ring.showNowForMs === null ? [] : [upcomingNotice(ring, ring.showNowForMs)],
  );

  const keep = new Set(dueNow.map(({ id }) => id));
  const shown = await notifee.getDisplayedNotifications();

  await Promise.all(
    shown.flatMap(({ id }) =>
      id !== undefined && isUpcomingId(id) && !keep.has(id)
        ? [notifee.cancelDisplayedNotification(id)]
        : [],
    ),
  );
  await Promise.all([
    ...dueNow.map((notice) => notifee.displayNotification(notice)),
    // A notice needs no alarm-clock icon in the status bar, only an exact time.
    ...upcoming.flatMap(({ trigger, ...ring }) =>
      trigger === null
        ? []
        : [
            notifee.createTriggerNotification(
              upcomingNotice({ trigger, ...ring }, UPCOMING_LEAD_MS),
              ringTrigger(trigger, AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE),
            ),
          ],
    ),
  ]);
}

async function applySchedule({
  notifications,
  upcoming,
  widgetAlarms,
  postponesKept,
}: AlarmSchedule) {
  // The ask comes with the first Alarm or reminder the owner sets, when the reason is plain, not at first launch.
  // Inside the queue, so a Connections load landing mid-ask waits for the answer instead of asking again.
  if (notifications.length > 0) await askNotificationPermissionOnce();
  await createChannels();
  const alarmChannel = JournalAndroid.createAlarmChannel();
  // Habits and Connections are the source of truth: Android drops exact alarms when the user revokes that setting.
  // The Check-in prompt plans its own triggers from the Check-ins, so they stay.
  const keep = new Set(postponesKept.map((habitId) => postponedId(habitId)));
  const triggerIds = await notifee.getTriggerNotificationIds();
  await notifee.cancelTriggerNotifications(
    triggerIds.filter((id) => !CHECK_IN_PROMPT_IDS.includes(Number(id)) && !keep.has(id)),
  );
  await Promise.all(
    notifications.map((planned) =>
      notifee.createTriggerNotification(...toNotifyKit(planned, alarmChannel)),
    ),
  );
  await applyUpcoming(upcoming);
  JournalAndroid.setAlarms(JSON.stringify(widgetAlarms));
}

// One reschedule at a time, so a Connections load landing mid-way can't interleave with a Habits one.
const queue = { latest: Promise.resolve() };

async function applyAfter(previous: Promise<void>, schedule: AlarmSchedule) {
  await Promise.allSettled([previous]);
  await applySchedule(schedule);
}

function reschedule(schedule: AlarmSchedule) {
  queue.latest = applyAfter(queue.latest, schedule);

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
  const { records, whole } = useHabitRecords();
  const sound = useAlarmSound();
  const silenced = useSilencedAlarms();

  useEffect(() => {
    const schedule = reschedulePlan(habits?.habits, connections?.connections, new Date(), {
      records,
      whole,
      silenced,
    });

    if (schedule) void reschedule(schedule);
    // A new sound means a new alarm channel, and every alarm must move onto it.
  }, [habits, connections, records, whole, sound, silenced]);
}
