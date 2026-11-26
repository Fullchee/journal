import {
  QueryClientProvider,
  dehydrate,
  onlineManager,
  type QueryClient,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { blankCheckIn, type CheckIn } from "@/core";
import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError } from "@/lib/api/errors";
import { isRestorableCapture } from "@/lib/data/captures";
import {
  guessPlace,
  type CheckInsBody,
  useCheckIns,
  useCreateCheckIn,
  useUpdateCheckIn,
} from "@/lib/data/check-ins";
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

const checkIn = (over: Partial<CheckIn>): CheckIn => ({
  ...blankCheckIn(8, "2026-11-10T12:00:00Z"),
  id: 1,
  ...over,
});

const listReads = () =>
  jest.mocked(apiFetch).mock.calls.filter(([, init]) => init.method === undefined).length;

const shown = (client: QueryClient) =>
  client.getQueryData<CheckInsBody>(["check-ins"])?.checkIns ?? [];

const settled = (client: QueryClient) => waitFor(() => expect(client.isMutating()).toBe(0));

async function renderCaptures() {
  onlineManager.setOnline(true);

  const client = testClient();

  const rendered = await renderHook(
    () => ({ list: useCheckIns(), create: useCreateCheckIn(), update: useUpdateCheckIn() }),
    { wrapper: wrapperFor(client) },
  );

  await waitFor(() => expect(rendered.result.current.list.data).toBeDefined());

  return { client, result: rendered.result };
}

describe("a saved Check-in capture", () => {
  const SAVED = checkIn({ id: 7, score: 5, zone: "Cloud" });

  // GET reads the list; POST and PATCH answer with the saved row, or `refusal` when set.
  function serve(refusal?: ApiError) {
    jest.mocked(apiFetch).mockClear();
    jest.mocked(apiFetch).mockImplementation((_path, init) => {
      if (init.method === undefined) return Promise.resolve({ checkIns: [checkIn({ id: 3 })] });

      return refusal ? Promise.reject(refusal) : Promise.resolve(SAVED);
    });
  }

  it("keeps the list without reloading it after a create", async () => {
    serve();
    const { client, result } = await renderCaptures();

    await act(() => {
      result.current.create(5, new Date().toISOString());
    });
    await settled(client);

    expect(listReads()).toBe(1);
    expect(shown(client).map((c) => c.id)).toEqual([7, 3]);
  });

  it("shows the server's row without reloading after a change", async () => {
    serve();
    const { client, result } = await renderCaptures();

    await act(() => {
      result.current.update(3, { score: 5 });
    });
    await settled(client);

    expect(listReads()).toBe(1);
    expect(shown(client)).toEqual([SAVED]);
  });

  it("names a Check-in the list doesn't hold yet by its clientId", async () => {
    serve();
    const { client, result } = await renderCaptures();

    await act(() => {
      result.current.update("uuid-9", { doing: "Reading" });
    });
    await settled(client);

    expect(jest.mocked(apiFetch).mock.lastCall?.[1]).toMatchObject({
      body: { clientId: "uuid-9", doing: "Reading" },
    });
    expect(shown(client).map((c) => c.id)).toEqual([3]);
  });

  it("reloads the list when the server refuses a change", async () => {
    serve(new ApiError(422, null));
    const { client, result } = await renderCaptures();

    await act(() => {
      result.current.update(3, { score: 5 });
    });
    await settled(client);

    await waitFor(() => expect(listReads()).toBe(2));
  });
});
