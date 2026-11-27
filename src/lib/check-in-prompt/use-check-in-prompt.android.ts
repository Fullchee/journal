import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import notifee, {
  AlarmType,
  AndroidImportance,
  AndroidVisibility,
  EventType,
  TriggerType,
  type EventDetail,
  type Notification,
} from "react-native-notify-kit";
import * as z from "zod/mini";

import {
  CHECK_IN_PROMPT_IDS,
  checkInPromptPlan,
  latestZone,
  ZONES,
  type CheckInPrompt,
} from "@/core";

import { useCheckIns } from "@/lib/data/check-ins";
import { useHabitRecords } from "@/lib/data/streaks";
import { askNotificationPermissionOnce } from "@/lib/notifications/ask-permission";

const CHANNEL_ID = "check-in-prompt";

// The owner turns the prompt off in Android's settings for this channel; the app has no setting of its own.
const createChannel = () =>
  notifee.createChannel({
    id: CHANNEL_ID,
    name: "Check-in prompt",
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
  });

// `launchActivity` opens the app, where the press handler below routes to Today.
const toNotifyKit = ({ id, day, title, body, zones }: CheckInPrompt): Notification => ({
  id: String(id),
  title,
  body,
  data: { checkInPrompt: day },
  android: {
    channelId: CHANNEL_ID,
    autoCancel: true,
    smallIcon: "ic_stat_alarm",
    pressAction: { id: "default", launchActivity: "default" },
    actions: zones.map((zone) => ({
      title: zone,
      pressAction: { id: zone, launchActivity: "default" },
    })),
  },
});

async function applyPlan(prompts: CheckInPrompt[]) {
  // The prompt may be the owner's only notification, so it asks too when it has one to show.
  if (prompts.length > 0) await askNotificationPermissionOnce();
  await createChannel();
  await notifee.cancelTriggerNotifications(CHECK_IN_PROMPT_IDS.map(String));
  await Promise.all(
    prompts.map((prompt) =>
      notifee.createTriggerNotification(toNotifyKit(prompt), {
        type: TriggerType.TIMESTAMP,
        timestamp: Date.parse(prompt.at),
        alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
      }),
    ),
  );
}

// One re-plan at a time, so a Check-in saved mid-way can't leave a stale prompt for today.
const queue = { latest: Promise.resolve() };

async function applyAfter(previous: Promise<void>, prompts: CheckInPrompt[]) {
  await Promise.allSettled([previous]);
  await applyPlan(prompts);
}

/** The `data` this hook puts on its notifications; other notifications lack it. */
const PromptData = z.object({ checkInPrompt: z.string() });

// Each tap reaches both the foreground event and `getInitialNotification`, so a Day's tap navigates once.
const handledTaps = new Set<string>();

// A zone button opens Today's Check-in in that zone; the body opens Today.
function pressedHref(detail: EventDetail): Href | null {
  const PromptPress = z.object({
    pressAction: z.object({ id: z.string() }),
    notification: z.object({ data: PromptData }),
  });

  const press = PromptPress.safeParse(detail).data;

  if (press === undefined) return null;
  const key = `${press.notification.data.checkInPrompt}|${press.pressAction.id}`;

  if (handledTaps.has(key)) return null;
  handledTaps.add(key);
  const zone = ZONES.find((z) => z === press.pressAction.id);

  return zone === undefined ? "/" : { pathname: "/", params: { zone } };
}

/**
 * Mount once inside the signed-in app. Plans the midday Check-in prompt on launch and whenever the Check-ins or Rest
 * periods change, and routes a tap on it to Today's `?zone` Check-in, as the Check-in widget does.
 */
export function useCheckInPrompt() {
  const { data } = useCheckIns();
  const { restPeriods } = useHabitRecords().records;
  const { navigate } = useRouter();

  useEffect(() => {
    if (data === undefined) return;

    const prompts = checkInPromptPlan({
      checkedInAt: data.checkIns.map((c) => c.checkedInAt),
      restPeriods,
      lastZone: latestZone(data.checkIns),
      now: new Date(),
    });

    queue.latest = applyAfter(queue.latest, prompts);
  }, [data, restPeriods]);

  useEffect(() => {
    const open = (detail: EventDetail) => {
      const href = pressedHref(detail);

      if (href !== null) navigate(href);
    };

    // A tap with the app in the background or closed waits here until the app comes back.
    const openInitial = async () => {
      const initial = await notifee.getInitialNotification();

      if (initial !== null) open(initial);
    };

    void openInitial();

    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void openInitial();
    });

    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS || type === EventType.ACTION_PRESS) open(detail);
    });

    return () => {
      appState.remove();
      unsubscribe();
    };
  }, [navigate]);
}
