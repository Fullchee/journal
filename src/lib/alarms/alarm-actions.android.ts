import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from "@tanstack/react-query-persist-client";
import { useEffect } from "react";
import notifee, {
  AlarmType,
  EventType,
  TriggerType,
  type Event,
  type Notification,
} from "react-native-notify-kit";
import * as z from "zod/mini";

import { afterNextRing, ALARM_ACTION_IDS, alarmActionCheck, torontoDay } from "@/core";

import { WRITE_DELAY_MS } from "@/lib/data/cache-persister";
import { persistOptions } from "@/lib/data/data-provider";
import { queueHabitCheck, storedCount } from "@/lib/data/habits";
import { createQueryClient, resumeQueuedMutations } from "@/lib/data/query-client";
import { POSTPONE_ACTION, POSTPONE_MS, postponedId } from "@/lib/alarms/postponed";
import { alarmTrigger, ringTrigger } from "@/lib/alarms/ring-trigger";
import { silenceToday } from "@/lib/alarms/silenced-alarms";
import { DISMISS_RING_ACTION } from "@/lib/alarms/upcoming";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../modules/journal-android";

/**
 * A Done or Skip tap on a Habit notification; `use-alarm-schedule` puts the Habit's id in its `data`, and on an
 * upcoming-alarm notice the id of the ring it comes before.
 */
const HabitData = z.object({ habit: z.string(), ring: z.optional(z.string()) });

const PressedAction = z.object({
  pressAction: z.object({ id: z.enum(ALARM_ACTION_IDS) }),
  notification: z.object({ id: z.string(), data: HabitData }),
});

type PressedAction = z.infer<typeof PressedAction>;

function pressedAction({ type, detail }: Event): PressedAction | null {
  if (type !== EventType.ACTION_PRESS) return null;

  return PressedAction.safeParse(detail).data ?? null;
}

const PostponePress = z.object({
  pressAction: z.object({ id: z.literal(POSTPONE_ACTION.pressAction.id) }),
  notification: z.object({ id: z.string(), data: HabitData }),
});

interface Postponed {
  shown: Notification;
  id: string;
  habit: string;
}

function postponePress({ type, detail }: Event): Postponed | null {
  if (type !== EventType.ACTION_PRESS || detail.notification === undefined) return null;
  const pressed = PostponePress.safeParse(detail).data;

  return pressed === undefined
    ? null
    : {
        shown: detail.notification,
        id: pressed.notification.id,
        habit: pressed.notification.data.habit,
      };
}

// The shown notification goes only once its copy is scheduled, so a failed schedule leaves the reminder up.
async function postpone({ shown, id, habit }: Postponed) {
  await notifee.createTriggerNotification(
    { ...shown, id: postponedId(habit) },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: Date.now() + POSTPONE_MS,
      alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
    },
  );
  await notifee.cancelDisplayedNotification(id);
}

const NoticeData = z.object({ habit: z.string(), ring: z.string() });

const DismissRingPress = z.object({
  pressAction: z.object({ id: z.literal(DISMISS_RING_ACTION.pressAction.id) }),
  notification: z.object({ id: z.string(), data: NoticeData }),
});

/** Moves a ring past its next time; Android keeps rings with the app closed, so this works without a reschedule. */
async function skipNextRing(ringId: string) {
  const rings = await notifee.getTriggerNotifications();
  const ring = rings.find(({ notification }) => notification.id === ringId);

  if (ring === undefined) return;
  const trigger = alarmTrigger(ring.trigger);
  const next = trigger === null ? null : afterNextRing(trigger, new Date());

  await (next === null
    ? notifee.cancelTriggerNotification(ringId)
    : notifee.createTriggerNotification(ring.notification, ringTrigger(next)));
}

// The silence keeps the next reschedule from bringing today's ring back.
async function dismissRing(event: Event) {
  if (event.type !== EventType.ACTION_PRESS) return false;
  const pressed = DismissRingPress.safeParse(event.detail).data;

  if (pressed === undefined) return false;
  const { id, data } = pressed.notification;

  silenceToday(data.habit);
  await skipNextRing(data.ring);
  await notifee.cancelDisplayedNotification(id);

  return true;
}

// Offline, a check waits in the queue and its promise never settles, so a background task stops waiting after this.
const SAVE_WAIT_MS = 10_000;

// Offline with no Habit list cached, the count's fetch never settles; it gives up well inside the save wait.
const COUNT_WAIT_MS = 4000;

/** `work`'s result, or `fallback` once `ms` pass first. */
async function within<T>(work: Promise<T>, ms: number, fallback: T) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Counting from 0 when the stored count can't load keeps the tap; a lost tap is worse than a count one too low.
async function countBeforeTap(client: QueryClient, date: string, habit: string) {
  try {
    return await within(storedCount(client, date, habit), COUNT_WAIT_MS, 0);
  } catch {
    return 0;
  }
}

async function runAction(client: QueryClient, { pressAction, notification }: PressedAction) {
  const date = torontoDay(new Date());
  const { habit } = notification.data;
  // Only a count Habit's Done reads the count, so Done and Skip work offline with nothing cached.
  const count = pressAction.id === "add-one" ? await countBeforeTap(client, date, habit) : 0;

  // A refused check shows in "Couldn't save …" like a tap's, so its rejection needs nothing here.
  const saved = Promise.allSettled([
    queueHabitCheck(client, alarmActionCheck(pressAction.id, { date, habit, count })),
  ]);

  // Only the shown notification goes, once the check is queued: its trigger still rings on the next due day.
  // Cancelling stops a looping alarm.
  await notifee.cancelDisplayedNotification(notification.id);
  await notifee.cancelTriggerNotification(postponedId(habit));

  // From an upcoming-alarm notice, a logged Day needs no ring; a count's one more tap may still fall short.
  if (notification.data.ring !== undefined && pressAction.id !== "add-one")
    await skipNextRing(notification.data.ring);
  await saved;
}

const settleWithinSaveWait = (work: Promise<void>) => within(work, SAVE_WAIT_MS, undefined);

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** The app's client while it runs, so a tap with the app in the background joins its queue. */
interface RunningApp {
  client: QueryClient | null;
}

const app: RunningApp = { client: null };

// With the app closed, nothing holds a client: this one restores the stored queue, adds the check and stores it again.
async function runWithoutApp(pressed: PressedAction) {
  const client = createQueryClient();

  await persistQueryClientRestore({ queryClient: client, ...persistOptions });
  // Captures share one scope, so an earlier unsent one must go first or the new check never runs.
  void resumeQueuedMutations(client);

  try {
    await settleWithinSaveWait(runAction(client, pressed));
  } finally {
    await persistQueryClientSave({ queryClient: client, ...persistOptions });
    // Android may stop the task once it resolves, so it outlives the persister's delayed write.
    await wait(WRITE_DELAY_MS * 2);
  }
}

// Postpone and Dismiss log nothing, so they need no client.
async function answer(event: Event, check: (pressed: PressedAction) => Promise<void>) {
  if (await dismissRing(event)) return;
  const postponed = postponePress(event);

  if (postponed !== null) return postpone(postponed);
  const pressed = pressedAction(event);

  if (pressed !== null) await check(pressed);
}

const onBackgroundEvent = (event: Event) =>
  answer(event, (pressed) =>
    app.client === null
      ? runWithoutApp(pressed)
      : settleWithinSaveWait(runAction(app.client, pressed)),
  );

// `use-alarm-schedule` puts `habitId` only on an `alarm` kind ring.
const RingingData = z.object({ habitId: z.string() });
const RingingAlarm = z.object({ notification: z.object({ data: RingingData }) });

// Android shows a full-screen ring as a heads-up while the phone is in use, but lets the app on screen open it.
function showRingingAlarm({ type, detail }: Event) {
  if (type === EventType.DELIVERED && RingingAlarm.safeParse(detail).success)
    JournalAndroid.showAlarmScreen();
}

/** Call once at app start, outside React: Android runs a button tap with the app closed as a headless task. */
export function registerAlarmActions() {
  notifee.onBackgroundEvent(onBackgroundEvent);
}

/** Mount once inside `DataProvider`, signed in or not: taps on a notification's buttons save through its client's queue. */
export function useAlarmActions() {
  const client = useQueryClient();

  useEffect(() => {
    app.client = client;

    const unsubscribe = notifee.onForegroundEvent((event) => {
      showRingingAlarm(event);
      void answer(event, (pressed) => runAction(client, pressed));
    });

    return () => {
      app.client = null;
      unsubscribe();
    };
  }, [client]);
}
