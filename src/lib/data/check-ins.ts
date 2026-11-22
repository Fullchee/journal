import { queryOptions, useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import * as z from "zod/mini";

import {
  ActivityRow,
  CheckIn,
  CheckInPatch,
  clockLabel,
  PLACES,
  Position,
  SleepNight,
  withPast,
  partOptions,
  blankCheckIn,
  inControlName,
  torontoTime,
  zoneOf,
} from "@/core";

import { apiFetch } from "@/lib/api/api-fetch";
import {
  CAPTURE_SCOPE,
  describeCaptures,
  unsentVariables,
  type CaptureKind,
} from "@/lib/data/captures";
import { useParts } from "@/lib/data/parts";

/** A Check-in made on this phone but not yet saved carries its clientId and a stand-in negative id. */
export type ShownCheckIn = CheckIn & { clientId?: string };

export interface CheckInsBody {
  checkIns: ShownCheckIn[];
}

const CheckInsResponse = z.object({ checkIns: z.array(CheckIn) });

/**
 * `clientId` makes a replayed create idempotent once journal upserts by it; `checkedInAt` is when the owner tapped.
 */
const NewCheckIn = z.object({
  clientId: z.string(),
  score: z.number(),
  note: z.string(),
  checkedInAt: z.string(),
});

export type NewCheckIn = z.infer<typeof NewCheckIn>;

// When the GPS fix was taken, so a position queued offline still matches its Check-in on replay.
const FixedAt = z.exactOptional(z.string());

/** `checkIn` is a saved Check-in's id, or the clientId of one still queued. */
const CheckInChange = z.object({
  checkIn: z.union([z.number(), z.string()]),
  patch: z.extend(CheckInPatch, {
    latitude: z.exactOptional(Position.shape.latitude),
    longitude: z.exactOptional(Position.shape.longitude),
    fixedAt: FixedAt,
  }),
});

export type CheckInChange = z.infer<typeof CheckInChange>;

const CREATE: CaptureKind<NewCheckIn> = { key: ["check-ins", "create"], variables: NewCheckIn };

const UPDATE: CaptureKind<CheckInChange> = {
  key: ["check-ins", "update"],
  variables: CheckInChange,
};

const CHECK_INS_KEY = ["check-ins"];

// A queued create replayed late would be stamped with the replay time; past this gap the time is put back.
const LATE_REPLAY_MS = 60_000;

const asShown = ({ clientId, score, note, checkedInAt }: NewCheckIn, index: number) => ({
  ...blankCheckIn(score, checkedInAt),
  id: -(index + 1),
  clientId,
  note,
});

// A saved Check-in's id is an integer; a clientId is a UUID string.
const matches = (row: ShownCheckIn, checkIn: number | string) =>
  Number.isSafeInteger(checkIn) ? row.id === checkIn : row.clientId === String(checkIn);

const applyChange = (row: ShownCheckIn, { patch }: CheckInChange): ShownCheckIn => {
  const { latitude: _latitude, longitude: _longitude, fixedAt: _fixedAt, ...fields } = patch;

  return fields.score === undefined
    ? { ...row, ...fields }
    : { ...row, ...fields, zone: zoneOf(fields.score) };
};

interface Unsent {
  previous: ShownCheckIn[];
  creates: NewCheckIn[];
  changes: CheckInChange[];
}

/**
 * Lays unsent captures over the fetched list, so each shows until the server has it.
 * A saved row keeps the clientId it was made with, so a queued change to it still finds its id.
 */
function withUnsentCheckIns(
  body: CheckInsBody,
  { previous, creates, changes }: Unsent,
): CheckInsBody {
  const clientIds = new Map(
    previous.flatMap((row) => (row.clientId === undefined ? [] : [[row.id, row.clientId]])),
  );

  // Stand-in rows are rebuilt from the creates still unsent, so a refused one disappears.
  const fetched = body.checkIns
    .filter((row) => row.id > 0)
    .map((row) => {
      const clientId = row.clientId ?? clientIds.get(row.id);

      return clientId === undefined ? row : { ...row, clientId };
    });

  const added = creates.filter((c) => fetched.every((row) => row.clientId !== c.clientId));
  const rows = [...added.map((create, index) => asShown(create, index)).toReversed(), ...fetched];

  return {
    ...body,
    checkIns: rows.map((row) =>
      changes
        .filter((change) => matches(row, change.checkIn))
        .reduce((shown, change) => applyChange(shown, change), row),
    ),
  };
}

// A capture that just finished but still reads as pending until TanStack records it.
interface Settled {
  create?: NewCheckIn;
  change?: CheckInChange;
}

const withUnsent = (client: QueryClient, body: CheckInsBody, settled: Settled = {}) =>
  withUnsentCheckIns(body, {
    previous: client.getQueryData<CheckInsBody>(CHECK_INS_KEY)?.checkIns ?? [],
    creates: unsentVariables(client, CREATE, settled.create),
    changes: unsentVariables(client, UPDATE, settled.change),
  });

export const checkInsQuery = queryOptions({
  queryKey: CHECK_INS_KEY,
  queryFn: async ({ client, signal }) =>
    withUnsent(client, await apiFetch("/api/check-ins", { signal }, CheckInsResponse)),
  meta: { persist: true },
});

const showUnsent = (client: QueryClient, settled?: Settled) =>
  client.setQueryData<CheckInsBody>(
    CHECK_INS_KEY,
    (body) => body && withUnsent(client, body, settled),
  );

// A create that replays in the same scope before this change has stored its saved row, so its id is known.
function savedIdOf(client: QueryClient, checkIn: number | string) {
  return Number.isSafeInteger(checkIn)
    ? Number(checkIn)
    : client
        .getQueryData<CheckInsBody>(CHECK_INS_KEY)
        ?.checkIns.find((row) => row.clientId === String(checkIn) && row.id > 0)?.id;
}

async function create(client: QueryClient, newCheckIn: NewCheckIn) {
  const saved = await apiFetch("/api/check-ins", { method: "POST", body: newCheckIn }, CheckIn);
  const late = Date.parse(saved.checkedInAt) - Date.parse(newCheckIn.checkedInAt) > LATE_REPLAY_MS;

  const row = late
    ? await apiFetch(
        "/api/check-ins",
        { method: "PATCH", body: { id: saved.id, checkedInAt: newCheckIn.checkedInAt } },
        CheckIn,
      )
    : saved;

  client.setQueryData<CheckInsBody>(
    CHECK_INS_KEY,
    (body) =>
      body && {
        ...body,
        checkIns: [
          { ...row, clientId: newCheckIn.clientId },
          ...body.checkIns.filter((c) => c.clientId !== newCheckIn.clientId),
        ],
      },
  );

  return row;
}

async function update(client: QueryClient, { checkIn, patch }: CheckInChange) {
  const id = savedIdOf(client, checkIn);

  return apiFetch(
    "/api/check-ins",
    {
      method: "PATCH",
      body: id === undefined ? { clientId: checkIn, ...patch } : { id, ...patch },
    },
    CheckIn,
  );
}

// Parts are described by name, after the other answers; an empty answer is left out.
function describedChange({
  inControl = null,
  parts = [],
  latitude,
  longitude: _longitude,
  fixedAt: _fixedAt,
  ...answers
}: CheckInChange["patch"]) {
  return [
    ...Object.values(answers),
    inControlName(inControl),
    ...parts.map((part) => part.name),
    latitude === undefined ? null : "location",
  ].filter((value) => value !== null && value !== "");
}

export function registerCheckInCaptures(client: QueryClient) {
  const shared = {
    scope: CAPTURE_SCOPE,
    onMutate: async () => {
      await client.cancelQueries({ queryKey: CHECK_INS_KEY });
      showUnsent(client);
    },
  };

  // Drops a refused create at once; the refetch then undoes any refused change.
  const settle = (settled: Settled) => {
    showUnsent(client, settled);

    return client.invalidateQueries({ queryKey: CHECK_INS_KEY });
  };

  client.setMutationDefaults(CREATE.key, {
    ...shared,
    mutationFn: (newCheckIn: NewCheckIn) => create(client, newCheckIn),
    onSettled: (_saved, _error, newCheckIn) => settle({ create: newCheckIn }),
  });
  client.setMutationDefaults(UPDATE.key, {
    ...shared,
    mutationFn: (change: CheckInChange) => update(client, change),
    onSettled: (_saved, _error, change) => settle({ change }),
  });

  describeCaptures(
    CREATE,
    ({ score, note, checkedInAt }) =>
      `the ${clockLabel(torontoTime(checkedInAt))} ${zoneOf(score)} Check-in${note === "" ? "" : ": "}${note}`,
  );
  describeCaptures(UPDATE, ({ patch }) => `Check-in details: ${describedChange(patch).join(", ")}`);
}

export const useCheckIns = () => useQuery(checkInsQuery);

/** Queued: shows at once, saves when online. */
export function useCreateCheckIn() {
  const { mutate } = useMutation<CheckIn, Error, NewCheckIn>({ mutationKey: CREATE.key });

  return (score: number, checkedInAt: string) => {
    const clientId = randomUUID();
    mutate({ clientId, score, note: "", checkedInAt });

    return clientId;
  };
}

/** Queued: details and location of a Check-in, saved or still queued. */
export function useUpdateCheckIn() {
  const { mutate } = useMutation<CheckIn, Error, CheckInChange>({ mutationKey: UPDATE.key });

  return (checkIn: number | string, patch: CheckInChange["patch"]) => mutate({ checkIn, patch });
}

/** What a list edit or the Check-in form saves against: the saved id, or the clientId while still queued. */
export const checkInKey = (row: ShownCheckIn) =>
  row.id < 0 && row.clientId !== undefined ? row.clientId : row.id;

/** Place options: the defaults, then places used before. */
export function useCheckInPlaces() {
  const { data } = useCheckIns();

  return withPast(PLACES, data?.checkIns.map((c) => c.place) ?? []);
}

/** IFS part options: the active Parts, by reference. */
export const useCheckInParts = () => partOptions(useParts().data?.parts);

/** One night of the sleep Signal, as GET /api/sleep returns it. */
const SleepRow = z.extend(SleepNight, {
  durationMin: z.number(),
  sleepScore: z.nullable(z.number()),
});

type SleepRow = z.infer<typeof SleepRow>;

const sleepQuery = queryOptions({
  queryKey: ["sleep"],
  queryFn: async ({ signal }) => {
    const { sleep } = await apiFetch(
      "/api/sleep",
      { signal },
      z.object({ sleep: z.array(SleepRow) }),
    );

    return sleep;
  },
  meta: { persist: true },
});

const activityQuery = queryOptions({
  queryKey: ["activity"],
  queryFn: async ({ signal }) => {
    const { activity } = await apiFetch(
      "/api/activity",
      { signal },
      z.object({ activity: z.array(ActivityRow) }),
    );

    return activity;
  },
  meta: { persist: true },
});

export const useSleep = () => useQuery(sleepQuery);

export const useActivity = () => useQuery(activityQuery);

/** Online only: searching cached Check-ins would miss text the server matches. */
export const useCheckInSearch = (q: string) =>
  useQuery({
    queryKey: ["check-in-search", q],
    queryFn: async ({ signal }) => {
      const { checkIns } = await apiFetch(
        `/api/search?${new URLSearchParams({ q })}`,
        { signal },
        z.object({ checkIns: z.array(CheckIn) }),
      );

      return checkIns;
    },
    enabled: q !== "",
    networkMode: "online",
  });

const PlaceGuess = z.object({ place: z.nullable(z.string()) });

/**
 * The Place guess for a Check-in at `at`, read in its Toronto Day; a past Check-in near `position` wins.
 * A failed guess is no guess.
 */
export async function guessPlace(at: string, position: Position | null = null) {
  const params = new URLSearchParams(
    position === null
      ? { at }
      : { at, latitude: String(position.latitude), longitude: String(position.longitude) },
  );

  try {
    const { place } = await apiFetch(`/api/check-ins?${params}`, {}, PlaceGuess);

    return place;
  } catch {
    return null;
  }
}
