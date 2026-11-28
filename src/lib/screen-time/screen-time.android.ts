import { useQueryClient } from "@tanstack/react-query";
import * as BackgroundTask from "expo-background-task";
import storage from "expo-sqlite/kv-store";
import * as TaskManager from "expo-task-manager";
import { useEffect } from "react";
import { AppState } from "react-native";

import { DEVICE_NAME, lastDays, screenMinutes } from "@/core";

import { useSettingAccess } from "@/hooks/use-setting-access";
import { apiFetch } from "@/lib/api/api-fetch";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../modules/journal-android";

// Android keeps screen events about a week; each send repeats the last few Days so a missed day fills in.
const RESENT_DAYS = 6;

const DEVICE_KEY = "screen-time:device";

const TASK = "screen-time";

// The job runs about daily; WorkManager picks the exact time.
const TASK_INTERVAL_MINUTES = 24 * 60;

/** "Alex's Pixel 8" becomes "alex-s-pixel-8"; a name with no letters or digits becomes "phone". */
export function deviceSlug(name: string) {
  const slug = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .slice(0, 40)
    .replaceAll(/^-|-$/gu, "");

  return DEVICE_NAME.test(slug) ? slug : "phone";
}

// Picked once, so renaming the phone later keeps its rows under one device.
async function device() {
  const stored = await storage.getItem(DEVICE_KEY);

  if (stored !== null) return stored;
  const picked = deviceSlug(JournalAndroid.deviceName());
  await storage.setItem(DEVICE_KEY, picked);

  return picked;
}

/** Sends this phone's minutes for the last few Days; false when Usage access is off. */
export async function sendScreenTime() {
  if (!JournalAndroid.hasUsageAccess()) return false;
  const window = lastDays(Date.now(), RESENT_DAYS);
  const events = JournalAndroid.screenEvents(window.from, window.to);

  await apiFetch("/api/screen-time", {
    method: "POST",
    body: { device: await device(), days: screenMinutes(events, window) },
  });

  return true;
}

/** Call at module scope from the entry file, so the daily job finds its task when Android starts it without the UI. */
export function defineScreenTimeTask() {
  TaskManager.defineTask(TASK, async () => {
    try {
      await sendScreenTime();

      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

// One send at a time: returning to the app mid-send would post the same Days twice.
interface InFlightSend {
  current: Promise<boolean> | null;
}

const sending: InFlightSend = { current: null };

async function sendSettled() {
  try {
    return await sendScreenTime();
  } catch {
    // Offline or signed out: the next open or the daily job resends the same Days.
    return false;
  } finally {
    sending.current = null;
  }
}

/** Mount once inside the signed-in app: sends on open and on each return to the front, and schedules the daily job. */
export function useScreenTimeSync() {
  const client = useQueryClient();

  useEffect(() => {
    const send = async () => {
      sending.current ??= sendSettled();

      if (!(await sending.current)) return;
      void client.invalidateQueries({ queryKey: ["screen-time"] });
      void client.invalidateQueries({ queryKey: ["targets"] });
    };

    void send();
    void BackgroundTask.registerTaskAsync(TASK, { minimumInterval: TASK_INTERVAL_MINUTES });

    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void send();
    });

    return () => listener.remove();
  }, [client]);
}

const hasUsageAccess = () => JournalAndroid.hasUsageAccess();
const openUsageAccessSettings = () => JournalAndroid.openUsageAccessSettings();

/** Whether Usage access is on, read again each time the owner comes back from Settings. */
export const useUsageAccess = () => useSettingAccess(hasUsageAccess, openUsageAccessSettings);
