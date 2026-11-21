import {
  HEALTH_CONNECT_ORIGINS,
  HEALTH_CONNECT_SOURCES,
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

import { useImportDurations } from "@/lib/data/habits";
import type {
  HealthConnectAutoLog,
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

async function link(
  source: HealthConnectSource,
  habit: string,
  importDurations: ImportDurations,
): Promise<LinkResult> {
  if (!(await isHealthConnectReady())) return { status: "unavailable" };

  if (!canRead(source, await requestPermission([readPermission(source)])))
    return { status: "denied" };

  const fresh = { habit, readAt: null };

  await storeLink(source, fresh);

  return { status: "linked", added: await logNewSessions(source, fresh, importDurations) };
}

async function linkedHabit(source: HealthConnectSource) {
  const stored = await storedLink(source);

  return stored?.habit ?? null;
}

export const healthConnectAutoLog: HealthConnectAutoLog = {
  linkedHabit,
  link,
  unlink: (source) => storage.removeItem(linkKey(source)),
};

// One read at a time: the app coming to the foreground mid-read would otherwise post the same sessions twice.
interface InFlightRead {
  current: Promise<void> | null;
}

const reading: InFlightRead = { current: null };

async function storedLinks() {
  const stored = await Promise.all(
    HEALTH_CONNECT_SOURCES.map(async (source) => ({ source, link: await storedLink(source) })),
  );

  return stored.flatMap(({ source, link: found }) =>
    found === null ? [] : { source, link: found },
  );
}

async function readLinked(importDurations: ImportDurations) {
  const linked = await storedLinks();

  if (linked.length === 0 || !(await isHealthConnectReady())) return;
  const granted = await getGrantedPermissions();

  for (const { source, link: found } of linked)
    if (canRead(source, granted)) await logNewSessions(source, found, importDurations);
}

async function readSettled(importDurations: ImportDurations) {
  try {
    await readLinked(importDurations);
  } catch {
    // Offline or a Health Connect hiccup: the kept read time makes the next open try again.
  } finally {
    reading.current = null;
  }
}

function readOnce(importDurations: ImportDurations) {
  reading.current ??= readSettled(importDurations);

  return reading.current;
}

/** Mount once inside the signed-in app: logs each linked source's new sessions on its Habit when the app opens or returns to the front. */
export function useHealthConnectAutoLog() {
  const { mutateAsync } = useImportDurations();

  useEffect(() => {
    void readOnce(mutateAsync);

    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void readOnce(mutateAsync);
    });

    return () => listener.remove();
  }, [mutateAsync]);
}
