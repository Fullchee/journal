import {
  QueryClientProvider,
  dehydrate,
  onlineManager,
  type QueryClient,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { apiFetch } from "@/lib/api/api-fetch";
import { isRestorableCapture } from "@/lib/data/captures";
import { guessPlace, useCreateCheckIn, useUpdateCheckIn } from "@/lib/data/check-ins";
import { createQueryClient, isUnsent } from "@/lib/data/query-client";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));

const clients: QueryClient[] = [];

function testClient() {
  const client = createQueryClient();
  client.mount();
  clients.push(client);

  return client;
}

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

const storedCaptures = (client: QueryClient) =>
  dehydrate(client, { shouldDehydrateMutation: isUnsent }).mutations;

beforeEach(() => {
  jest.mocked(apiFetch).mockResolvedValue(undefined);
  onlineManager.setOnline(false);
});

afterEach(() => {
  onlineManager.setOnline(true);

  for (const client of clients.splice(0)) {
    client.unmount();
    client.clear();
  }
});

describe("stored Check-in captures", () => {
  it("restore after an app update when their variables still match", async () => {
    const client = testClient();

    const { result } = await renderHook(
      () => ({ create: useCreateCheckIn(), update: useUpdateCheckIn() }),
      {
        wrapper: wrapperFor(client),
      },
    );

    await act(() => {
      const clientId = result.current.create(6, new Date().toISOString());

      result.current.update(clientId, { doing: "Reading", tense: null });
      result.current.update(42, { score: 3 });
    });
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(3));

    const mutations = storedCaptures(client);

    expect(mutations).toHaveLength(3);
    expect(mutations.map((m) => isRestorableCapture(m))).toEqual([true, true, true]);
  });

  it("don't restore when their variables no longer match", async () => {
    const client = testClient();

    const { result } = await renderHook(() => useUpdateCheckIn(), { wrapper: wrapperFor(client) });

    await act(() => {
      result.current(42, { score: 3 });
    });
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(1));

    const [stored] = storedCaptures(client);

    expect(
      stored &&
        isRestorableCapture({
          ...stored,
          state: { ...stored.state, variables: { checkIn: true } },
        }),
    ).toBe(false);
  });
});

describe("guessPlace with a position", () => {
  const AT = "2026-11-10T12:00:00Z";

  it("sends the position, so a past Check-in within 150 m wins", async () => {
    jest.mocked(apiFetch).mockResolvedValue({ place: "Gym" });

    await expect(guessPlace(AT, { latitude: 43.65, longitude: -79.38 })).resolves.toBe("Gym");

    const [path] = jest.mocked(apiFetch).mock.lastCall ?? [];

    expect(Object.fromEntries(new URL(path ?? "", "https://journal.test").searchParams)).toEqual({
      at: AT,
      latitude: "43.65",
      longitude: "-79.38",
    });
  });

  it("guesses from the time alone without a position", async () => {
    jest.mocked(apiFetch).mockResolvedValue({ place: "Home" });

    await expect(guessPlace(AT, null)).resolves.toBe("Home");
    expect(jest.mocked(apiFetch).mock.lastCall?.[0]).toBe(
      `/api/check-ins?${new URLSearchParams({ at: AT })}`,
    );
  });
});
