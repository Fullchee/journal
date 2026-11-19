import { CALM_PACKAGE, MindfulnessSession, calmReadFrom, calmSessions } from "@/core";
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
import type { CalmAutoLog, ImportDurations, LinkResult } from "@/lib/health/calm-auto-log";

const LINK_KEY = "calm-auto-log";

// A phone logs Calm on one Habit; `readAt` is when the last read finished, null before the first.
const Link = z.object({ habit: z.string(), readAt: z.nullable(z.string()) });

type Link = z.infer<typeof Link>;

const READ_MINDFULNESS: Permission = { accessType: "read", recordType: "MindfulnessSession" };

function parseLink(text: string) {
  try {
    return Link.safeParse(JSON.parse(text)).data ?? null;
  } catch {
    return null;
  }
}

async function storedLink() {
  const text = await storage.getItem(LINK_KEY);

  return text === null ? null : parseLink(text);
}

const storeLink = (link: Link) => storage.setItem(LINK_KEY, JSON.stringify(link));

// Health Connect ships with Android 14+, and is a Play Store app before that, so it may be missing or outdated.
const isHealthConnectReady = async () =>
  (await getSdkStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE && initialize();

const canReadMindfulness = (granted: readonly { accessType: string; recordType: string }[]) =>
  granted.some(
    ({ accessType, recordType }) => accessType === "read" && recordType === "MindfulnessSession",
  );

async function calmRecords(from: string) {
  const sessions: MindfulnessSession[] = [];
  let pageToken: string | undefined;

  do {
    const page = await readRecords("MindfulnessSession", {
      timeRangeFilter: { operator: "after", startTime: from },
      dataOriginFilter: [CALM_PACKAGE],
      ...(pageToken !== undefined && { pageToken }),
    });

    sessions.push(
      ...page.records.flatMap((record) => MindfulnessSession.safeParse(record).data ?? []),
    );
    pageToken = page.pageToken === "" ? undefined : page.pageToken;
  } while (pageToken !== undefined);

  return sessions;
}

// The read time is kept only once the import succeeds, so a failed one is retried from the same point.
async function logNewSessions(link: Link, importDurations: ImportDurations) {
  const now = new Date();
  const entries = calmSessions(await calmRecords(calmReadFrom(link.readAt, now)));
  const added = entries.length === 0 ? 0 : await importDurations({ habit: link.habit, entries });

  await storeLink({ ...link, readAt: now.toISOString() });

  return added;
}

async function link(habit: string, importDurations: ImportDurations): Promise<LinkResult> {
  if (!(await isHealthConnectReady())) return { status: "unavailable" };

  if (!canReadMindfulness(await requestPermission([READ_MINDFULNESS]))) return { status: "denied" };

  const fresh = { habit, readAt: null };

  await storeLink(fresh);

  return { status: "linked", added: await logNewSessions(fresh, importDurations) };
}

async function linkedHabit() {
  const stored = await storedLink();

  return stored?.habit ?? null;
}

export const calmAutoLog: CalmAutoLog = {
  linkedHabit,
  link,
  unlink: () => storage.removeItem(LINK_KEY),
};

// One read at a time: the app coming to the foreground mid-read would otherwise post the same sessions twice.
interface InFlightRead {
  current: Promise<void> | null;
}

const reading: InFlightRead = { current: null };

async function readIfLinked(importDurations: ImportDurations) {
  const stored = await storedLink();

  if (stored === null || !(await isHealthConnectReady())) return;

  if (canReadMindfulness(await getGrantedPermissions()))
    await logNewSessions(stored, importDurations);
}

async function readSettled(importDurations: ImportDurations) {
  try {
    await readIfLinked(importDurations);
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

/** Mount once inside the signed-in app: logs new Calm sessions on the linked Habit when the app opens or returns to the front. */
export function useCalmAutoLog() {
  const { mutateAsync } = useImportDurations();

  useEffect(() => {
    void readOnce(mutateAsync);

    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void readOnce(mutateAsync);
    });

    return () => listener.remove();
  }, [mutateAsync]);
}
