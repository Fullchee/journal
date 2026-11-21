import {
  HEALTH_CONNECT_ORIGINS,
  HealthConnectSession,
  healthConnectReadFrom,
  sourceSessions,
  type HealthConnectSource,
} from "@/core";
import storage from "expo-sqlite/kv-store";
import { useEffect } from "react";
import { AppState } from "react-native";
import {
  SdkAvailabilityStatus,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  type Permission,
} from "react-native-health-connect";
import * as z from "zod/mini";

import { useImportDurations, useTodayHabits } from "@/lib/data/habits";
import type {
  CalmAutoLog,
  ImportDurations,
  LinkResult,
} from "@/lib/health/health-connect-auto-log";

// Calm's key predates Hevy; keeping the pattern keeps a phone's existing Calm link.
const linkKey = (source: HealthConnectSource) => `${source}-auto-log`;

// A phone logs each source on one Habit; `readAt` is when the last read finished, null before the first.
const Link = z.object({ habit: z.string(), readAt: z.nullable(z.string()) });

type Link = z.infer<typeof Link>;

const readPermission = (source: HealthConnectSource): Permission => ({
  accessType: "read",
  recordType: HEALTH_CONNECT_ORIGINS[source].recordType,
});

function parseLink(text: string) {
  try {
    return Link.safeParse(JSON.parse(text)).data ?? null;
  } catch {
    return null;
  }
}

async function storedLink(source: HealthConnectSource) {
  const text = await storage.getItem(linkKey(source));

  return text === null ? null : parseLink(text);
}

const storeLink = (source: HealthConnectSource, link: Link) =>
  storage.setItem(linkKey(source), JSON.stringify(link));

// Health Connect ships with Android 14+, and is a Play Store app before that, so it may be missing or outdated.
const isHealthConnectReady = async () =>
  (await getSdkStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE && initialize();

const canRead = (
  source: HealthConnectSource,
  granted: readonly { accessType: string; recordType: string }[],
) =>
  granted.some(
    ({ accessType, recordType }) =>
      accessType === "read" && recordType === HEALTH_CONNECT_ORIGINS[source].recordType,
  );

async function sourceRecords(source: HealthConnectSource, from: string) {
  const sessions: HealthConnectSession[] = [];
  const origin = HEALTH_CONNECT_ORIGINS[source];
  let pageToken: string | undefined;

  do {
    const page = await readRecords(origin.recordType, {
      timeRangeFilter: { operator: "after", startTime: from },
      dataOriginFilter: [origin.package],
      ...(pageToken !== undefined && { pageToken }),
    });

    sessions.push(
      ...page.records.flatMap((record) => HealthConnectSession.safeParse(record).data ?? []),
    );
    pageToken = page.pageToken === "" ? undefined : page.pageToken;
  } while (pageToken !== undefined);

  return sessions;
}

// The read time is kept only once the import succeeds, so a failed one is retried from the same point.
async function logNewSessions(
  source: HealthConnectSource,
  link: Link,
  importDurations: ImportDurations,
) {
  const now = new Date();
  const records = await sourceRecords(source, healthConnectReadFrom(link.readAt, now));
  const entries = sourceSessions(source, records);
  const added = entries.length === 0 ? 0 : await importDurations({ habit: link.habit, entries });

  await storeLink(source, { ...link, readAt: now.toISOString() });

  return added;
}

async function link(habit: string, importDurations: ImportDurations): Promise<LinkResult> {
  if (!(await isHealthConnectReady())) return { status: "unavailable" };

  if (!canRead("calm", await requestPermission([readPermission("calm")])))
    return { status: "denied" };

  const fresh = { habit, readAt: null };

  await storeLink("calm", fresh);

  return { status: "linked", added: await logNewSessions("calm", fresh, importDurations) };
}

async function linkedHabit() {
  const stored = await storedLink("calm");

  return stored?.habit ?? null;
}

export const calmAutoLog: CalmAutoLog = {
  linkedHabit,
  link,
  unlink: () => storage.removeItem(linkKey("calm")),
};

// Android shows its permission screen once; after a denial the owner grants Exercise in Health Connect's settings.
const HEVY_ASKED_KEY = "hevy-auto-log:asked";

type Granted = Awaited<ReturnType<typeof getGrantedPermissions>>;

async function canReadHevy(granted: Granted) {
  if (canRead("hevy", granted)) return true;

  if ((await storage.getItem(HEVY_ASKED_KEY)) !== null) return false;
  await storage.setItem(HEVY_ASKED_KEY, "1");

  return canRead("hevy", await requestPermission([readPermission("hevy")]));
}

// A new Hevy Habit starts over: its read time belonged to the old one.
async function logHevy(hevyHabit: string, granted: Granted, importDurations: ImportDurations) {
  if (!(await canReadHevy(granted))) return;
  const stored = await storedLink("hevy");
  const hevyLink = stored?.habit === hevyHabit ? stored : { habit: hevyHabit, readAt: null };

  await logNewSessions("hevy", hevyLink, importDurations);
}

// One read at a time: the app coming to the foreground mid-read would otherwise post the same sessions twice.
interface InFlightRead {
  current: Promise<void> | null;
}

const reading: InFlightRead = { current: null };

async function readAll(importDurations: ImportDurations, hevyHabit: string | undefined) {
  const calmLink = await storedLink("calm");

  if ((calmLink === null && hevyHabit === undefined) || !(await isHealthConnectReady())) return;
  const granted = await getGrantedPermissions();

  if (calmLink !== null && canRead("calm", granted))
    await logNewSessions("calm", calmLink, importDurations);

  if (hevyHabit !== undefined) await logHevy(hevyHabit, granted, importDurations);
}

async function readSettled(importDurations: ImportDurations, hevyHabit: string | undefined) {
  try {
    await readAll(importDurations, hevyHabit);
  } catch {
    // Offline or a Health Connect hiccup: the kept read time makes the next open try again.
  } finally {
    reading.current = null;
  }
}

function readOnce(importDurations: ImportDurations, hevyHabit: string | undefined) {
  reading.current ??= readSettled(importDurations, hevyHabit);

  return reading.current;
}

/**
 * Mount once inside the signed-in app: when the app opens or returns to the front, logs new Calm sessions on the
 * linked Habit and new Hevy workouts on the Worker's `HEVY_HABIT`.
 */
export function useHealthConnectAutoLog() {
  const { mutateAsync } = useImportDurations();
  const habits = useTodayHabits();
  const hevyHabit = habits.data?.hevyHabit;
  // A read started before the Habits load would hold off the one that knows Hevy's Habit.
  const loaded = !habits.isPending;

  useEffect(() => {
    if (!loaded) return;
    void readOnce(mutateAsync, hevyHabit);

    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void readOnce(mutateAsync, hevyHabit);
    });

    return () => listener.remove();
  }, [mutateAsync, hevyHabit, loaded]);
}
