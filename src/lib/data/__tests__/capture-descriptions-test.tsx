import { QueryClientProvider, hydrate, type QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { CelebrationProvider } from "@/components/celebration";
import { apiFetch } from "@/lib/api/api-fetch";
import { useFailedCaptures } from "@/lib/data/captures";
import {
  checkInKey,
  guessPlace,
  useCreateCheckIn,
  useUpdateCheckIn,
  type CheckInChange,
  type NewCheckIn,
} from "@/lib/data/check-ins";
import { useLogInteraction } from "@/lib/data/connections";
import { useCheckHabit, type HabitCheck } from "@/lib/data/habits";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn } from "../../../../jest/fixtures";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <CelebrationProvider>{children}</CelebrationProvider>
      </QueryClientProvider>
    );
  };

interface ReachOut {
  kind: string;
  note: string;
  minutes: number | null;
  connectionIds: number[];
  day: string;
  requestId: string;
}

type StoredVariables = NewCheckIn | CheckInChange | HabitCheck | Partial<HabitCheck> | ReachOut;

/** What the persister hands back after a restart: a capture the server refused. */

const refused = (mutationKey: string[], variables: StoredVariables) => ({
  mutationKey,
  scope: { id: "capture" },
  state: {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    status: "error" as const,
    variables,
    submittedAt: 0,
  },
});

// Rendering the hooks registers each kind, which is what names a refused capture.
async function messagesFor(...captures: ReturnType<typeof refused>[]) {
  const client = createQueryClient();
  hydrate(client, { queries: [], mutations: captures });

  const { result } = await renderHook(
    () => {
      useCreateCheckIn();
      useUpdateCheckIn();
      useLogInteraction();
      useCheckHabit();

      return useFailedCaptures().map(({ message }) => message);
    },
    { wrapper: wrapperFor(client) },
  );

  client.clear();

  return result.current;
}

describe("refused captures", () => {
  it("name a Check-in by its time, zone and note", async () => {
    const messages = await messagesFor(
      refused(["check-ins", "create"], {
        clientId: "c1",
        score: 3,
        note: "rough day",
        checkedInAt: "2026-11-10T12:00:00Z",
      }),
    );

    expect(messages).toEqual(["Couldn't save the 7:00 AM Rain Check-in: rough day"]);
  });

  it("name a Check-in change that sets no Part in control", async () => {
    const messages = await messagesFor(
      refused(["check-ins", "update"], { checkIn: 5, patch: { low: 2 } }),
    );

    expect(messages).toEqual(["Couldn't save Check-in details: 2"]);
  });

  it("name a reach-out, with its note when it has one", async () => {
    const day = { kind: "message", minutes: null, connectionIds: [3], day: "2026-11-10" };

    const messages = await messagesFor(
      refused(["interactions", "log"], { ...day, note: "", requestId: "r1" }),
      refused(["interactions", "log"], { ...day, note: "moving soon", requestId: "r2" }),
    );

    expect(messages).toEqual([
      `Couldn't save "reached out"`,
      `Couldn't save "reached out": moving soon`,
    ]);
  });

  it("name a Habit check by Habit and day", async () => {
    const messages = await messagesFor(
      refused(["habits", "check"], { date: "2026-11-10", habit: "walk", count: 1 }),
    );

    expect(messages).toEqual(["Couldn't save walk on 2026-11-10"]);
  });

  it("fall back to a general name when the stored variables no longer fit", async () => {
    const messages = await messagesFor(refused(["habits", "check"], { habit: "walk" }));

    expect(messages).toEqual(["Couldn't save a change"]);
  });
});

describe("checkInKey", () => {
  it("is the clientId while a Check-in is still queued", () => {
    expect(checkInKey({ ...checkIn({ id: -1 }), clientId: "uuid-1" })).toBe("uuid-1");
  });

  it("is the saved id once the server has the Check-in", () => {
    expect(checkInKey({ ...checkIn({ id: 7 }), clientId: "uuid-1" })).toBe(7);
    expect(checkInKey(checkIn({ id: -1 }))).toBe(-1);
  });
});

describe("guessPlace", () => {
  it("is the place the server guesses", async () => {
    jest.mocked(apiFetch).mockResolvedValue({ place: "Home" });

    await expect(guessPlace("2026-11-10T12:00:00Z")).resolves.toBe("Home");
  });

  it("is no guess when the request fails", async () => {
    jest.mocked(apiFetch).mockRejectedValue(new Error("offline"));

    await expect(guessPlace("2026-11-10T12:00:00Z")).resolves.toBeNull();
  });
});
