import {
  FITBIT_PACKAGE,
  FITBIT_RECORD_TYPES,
  FITBIT_RULES,
  FITBIT_RULES_BY_RECORD,
  FITBIT_SESSION_DAYS,
  fitbitDoneDays,
  fitbitExerciseEntries,
  fitbitExerciseSessions,
  fitbitFirstDay,
  fitbitReadFrom,
  fitbitSession,
  isoAt,
  shiftDay,
  torontoDay,
  type FitbitRule,
} from "@/core";
import storage from "expo-sqlite/kv-store";
import { useEffect, useEffectEvent } from "react";
import {
  SdkAvailabilityStatus,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  type Permission,
  type ReadRecordsOptions,
  type RecordType,
} from "react-native-health-connect";
import * as z from "zod/mini";

import { apiFetch } from "@/lib/api/api-fetch";

import type { FitbitAutoLog, FitbitLink, FitbitWriters } from "@/lib/health/fitbit-auto-log";
import { useFitbitWriters } from "@/lib/health/fitbit-writers";

import type { LinkResult } from "@/lib/health/health-connect-auto-log";

const linkKey = (rule: FitbitRule) => `fitbit-auto-log:${rule}`;

// `since` is the Day the owner linked it: older Days are never completed. `readAt` is when the last read finished.
const StoredLink = z.object({
  habit: z.string(),
  threshold: z.number(),
  since: z.string(),
  readAt: z.nullable(z.string()),
});

type StoredLink = z.infer<typeof StoredLink>;

function parseLink(text: string) {
  try {
    return StoredLink.safeParse(JSON.parse(text)).data ?? null;
  } catch {
    return null;
  }
}

async function storedLink(rule: FitbitRule) {
  const text = await storage.getItem(linkKey(rule));

  return text === null ? null : parseLink(text);
}

const storeLink = (rule: FitbitRule, link: StoredLink) =>
  storage.setItem(linkKey(rule), JSON.stringify(link));

/** The records Fitbit sessions are uploaded from: each session, and the Distance that gives its km. */
const SESSION_READS: readonly RecordType[] = [FITBIT_RECORD_TYPES.exercise, "Distance"];

// Linking the exercise rule also asks for Distance, so the same tap lets the app upload Fitbit sessions.
const LINK_READS: Record<FitbitRule, readonly RecordType[]> = {
  steps: [FITBIT_RECORD_TYPES.steps],
  sleep: [FITBIT_RECORD_TYPES.sleep],
  exercise: SESSION_READS,
};

const readPermissions = (rule: FitbitRule) =>
  LINK_READS[rule].map((recordType): Permission => ({ accessType: "read", recordType }));

// Health Connect ships with Android 14+, and is a Play Store app before that, so it may be missing or outdated.
const isHealthConnectReady = async () =>
  (await getSdkStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE && initialize();

type Granted = readonly { accessType: string; recordType: string }[];

const canReadType = (type: RecordType, granted: Granted) =>
  granted.some(({ accessType, recordType }) => accessType === "read" && recordType === type);

const canRead = (rule: FitbitRule, granted: Granted) =>
  canReadType(FITBIT_RECORD_TYPES[rule], granted);

async function fitbitRecords(
  recordType: RecordType,
  timeRangeFilter: ReadRecordsOptions["timeRangeFilter"],
) {
  const records: unknown[] = [];
  let pageToken: string | undefined;

  do {
    const page = await readRecords(recordType, {
      timeRangeFilter,
      dataOriginFilter: [FITBIT_PACKAGE],
      ...(pageToken !== undefined && { pageToken }),
    });

    records.push(...page.records);
    pageToken = page.pageToken === "" ? undefined : page.pageToken;
  } while (pageToken !== undefined);

  return records;
}

// Each upload re-sends whole Days, so the Worker can drop the sessions Fitbit no longer has.
async function uploadFitbitSessions() {
  const from = shiftDay(torontoDay(new Date()), -FITBIT_SESSION_DAYS);

  const records = await fitbitRecords(FITBIT_RECORD_TYPES.exercise, {
    operator: "after",
    startTime: isoAt(from),
  });

  const sessions = await Promise.all(
    fitbitExerciseSessions(records).map(async (session) => {
      const { startTime, endTime } = session;

      const distances = await fitbitRecords("Distance", {
        operator: "between",
        startTime,
        endTime,
      });

      return fitbitSession(session, distances);
    }),
  );

  await apiFetch("/api/fitbit-sessions", { method: "POST", body: { from, sessions } });
}

interface Read {
  rule: FitbitRule;
  link: StoredLink;
  records: unknown[];
  from: string;
  writers: FitbitWriters;
}

// Checks are queued, so they never fail here; the Day's answer shows at once and saves when online.
function completeDays({ rule, link, records, from, writers }: Read) {
  const days = fitbitDoneDays({ rule, records, from, ...link, counts: writers.counts });

  writers.check(days.map((date) => ({ date, habit: link.habit, count: 1 })));

  return Promise.resolve(days.length);
}

async function logMinutes({ link, records, from, writers }: Read) {
  const entries = fitbitExerciseEntries(records, from);

  return entries.length === 0 ? 0 : writers.importDurations({ habit: link.habit, entries });
}

// The read time is kept only once the write succeeds, so a failed one is retried from the same Day.
async function readNew(rule: FitbitRule, link: StoredLink, writers: FitbitWriters) {
  const record = writers.recordStyles[link.habit];

  // The owner can change a Habit's Record style after linking; a rule that no longer fits waits, unread.
  if (record === undefined || !FITBIT_RULES_BY_RECORD[record].includes(rule)) return 0;

  const now = new Date();
  const from = fitbitFirstDay(link.since, link.readAt);

  const records = await fitbitRecords(FITBIT_RECORD_TYPES[rule], {
    operator: "after",
    startTime: fitbitReadFrom(from),
  });

  const write = record === "duration" ? logMinutes : completeDays;
  const added = await write({ rule, link, records, from, writers });
  // The owner may unlink, relink or change the threshold mid-read; their change wins.
  const current = await storedLink(rule);

  if (current?.habit === link.habit)
    await storeLink(rule, { ...current, readAt: now.toISOString() });

  return added;
}

async function link(
  rule: FitbitRule,
  chosen: FitbitLink,
  writers: FitbitWriters,
): Promise<LinkResult> {
  if (!(await isHealthConnectReady())) return { status: "unavailable" };

  if (!canRead(rule, await requestPermission(readPermissions(rule)))) return { status: "denied" };

  const fresh = { ...chosen, since: torontoDay(new Date()), readAt: null };

  await storeLink(rule, fresh);

  return { status: "linked", added: await readNew(rule, fresh, writers) };
}

async function storedLinks() {
  const stored = await Promise.all(
    FITBIT_RULES.map(async (rule) => ({ rule, link: await storedLink(rule) })),
  );

  return stored.flatMap(({ rule, link: found }) => (found === null ? [] : { rule, link: found }));
}

async function links() {
  const stored = await storedLinks();

  return Object.fromEntries(
    stored.map(({ rule, link: { habit, threshold } }) => [rule, { habit, threshold }]),
  );
}

async function setThreshold(rule: FitbitRule, threshold: number) {
  const stored = await storedLink(rule);

  if (stored !== null) await storeLink(rule, { ...stored, threshold });
}

export const fitbitAutoLog: FitbitAutoLog = {
  links,
  link,
  setThreshold,
  unlink: (rule) => storage.removeItem(linkKey(rule)),
};

// One read at a time: the app coming to the foreground mid-read would otherwise check the same Days twice.
interface InFlightRead {
  current: Promise<void> | null;
}

const reading: InFlightRead = { current: null };

async function readFitbit(writers: FitbitWriters) {
  if (!(await isHealthConnectReady())) return;
  const granted = await getGrantedPermissions();
  const linked = await storedLinks();

  for (const { rule, link: found } of linked)
    if (canRead(rule, granted)) await readNew(rule, found, writers);

  if (SESSION_READS.every((type) => canReadType(type, granted))) await uploadFitbitSessions();
}

async function readSettled(writers: FitbitWriters) {
  try {
    await readFitbit(writers);
  } catch {
    // Offline or a Health Connect hiccup: the kept read time makes the next open try again.
  } finally {
    reading.current = null;
  }
}

function readOnce(writers: FitbitWriters) {
  reading.current ??= readSettled(writers);

  return reading.current;
}

/**
 * Mount once inside the signed-in app: completes the linked Habits from Fitbit and uploads its sessions when the app
 * opens or returns to the front. Coming to the front refetches the Habits, which hides the writers until the fresh answers arrive.
 */
export function useFitbitAutoLog() {
  const writers = useFitbitWriters();
  const ready = writers !== null;

  const read = useEffectEvent(() => {
    if (writers !== null) void readOnce(writers);
  });

  useEffect(() => {
    read();
  }, [ready]);
}
