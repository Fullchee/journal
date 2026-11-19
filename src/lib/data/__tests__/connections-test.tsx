import { QueryClientProvider, onlineManager, type QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { apiFetch } from "@/lib/api/api-fetch";
import {
  ConnectionDetailBody,
  connectionQuery,
  useConnection,
  useConnectionSearch,
  useCreateConnection,
  useDeleteInteraction,
  useEditInteraction,
  useLogInteraction,
  useSaveConnectionNotes,
  useUpdateConnection,
  withLoggedInteractions,
  type ConnectionDetail,
} from "@/lib/data/connections";
import { createQueryClient } from "@/lib/data/query-client";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

jest.mock("expo-crypto", () => ({ randomUUID: () => "6f1c2e0a-8b4d-4f7e-a1c3-9d2e5b7f0a41" }));

const makeDetail = (overrides: Partial<ConnectionDetail> = {}): ConnectionDetail => ({
  id: 3,
  name: "Sam",
  title: "Sam",
  closeness: "friend",
  circles: [],
  cadenceDays: 14,
  lastContactedOn: null,
  followUps: "",
  howWeMet: "",
  metThrough: null,
  introduced: [],
  links: [],
  meetups: [],
  dates: [],
  growCloser: false,
  planCheckedAt: null,
  contactId: null,
  body: "Likes climbing.",
  interactions: [],
  ...overrides,
});

const answer = (item: ConnectionDetail): ConnectionDetailBody => ({ item });

const clients: QueryClient[] = [];

function setup() {
  const client = createQueryClient();
  // No garbage-collection timer outlives a test.
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    mutations: { ...client.getDefaultOptions().mutations, gcTime: Infinity },
  });
  client.mount();
  clients.push(client);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return { client, wrapper };
}

beforeEach(() => {
  jest.mocked(apiFetch).mockReset();
  onlineManager.setOnline(true);
});

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.unmount();
    client.clear();
  }
});

describe("withLoggedInteractions", () => {
  const logged = {
    connectionIds: [3, 4],
    day: "2026-11-07",
    kind: "message" as const,
    note: "",
    minutes: null,
    requestId: "r",
  };

  it("moves each person's last contacted day up to an unsent Interaction's", () => {
    const shown = withLoggedInteractions(
      [makeDetail(), makeDetail({ id: 4, lastContactedOn: "2026-11-01" }), makeDetail({ id: 5 })],
      [logged],
    );

    expect(shown.map((c) => c.lastContactedOn)).toEqual(["2026-11-07", "2026-11-07", null]);
  });

  it("never moves last contacted back for an older Interaction", () => {
    const [shown] = withLoggedInteractions(
      [makeDetail({ lastContactedOn: "2026-11-09" })],
      [logged],
    );

    expect(shown?.lastContactedOn).toBe("2026-11-09");
  });
});

describe("useConnection", () => {
  it("shows an offline reach-out at once, then logs it once online", async () => {
    const { client, wrapper } = setup();
    jest.mocked(apiFetch).mockImplementation((path, init = {}) => {
      if (init.method === "POST") return Promise.resolve({ id: 1 });

      return Promise.resolve(
        path === "/api/connections" ? { connections: [] } : answer(makeDetail()),
      );
    });
    await client.query(connectionQuery(3));
    onlineManager.setOnline(false);

    const { result } = await renderHook(
      () => ({ shown: useConnection(3), log: useLogInteraction() }),
      { wrapper },
    );

    await act(() => result.current.log([3], { kind: "call", note: "her move", minutes: null }));

    await waitFor(() =>
      expect(result.current.shown.connection?.lastContactedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(jest.mocked(apiFetch).mock.calls.some(([, init]) => init.method === "POST")).toBe(false);

    await act(() => onlineManager.setOnline(true));

    await waitFor(() => expect(client.isMutating()).toBe(0));

    const body: unknown = expect.objectContaining({
      connectionIds: [3],
      kind: "call",
      note: "her move",
      minutes: null,
      requestId: "6f1c2e0a-8b4d-4f7e-a1c3-9d2e5b7f0a41",
    });

    expect(apiFetch).toHaveBeenCalledWith("/api/interactions", { method: "POST", body });
  });
});

describe("Interaction edits", () => {
  it("saves an edit and refetches the people", async () => {
    const { client, wrapper } = setup();
    jest.mocked(apiFetch).mockResolvedValue({ id: 7 });
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(() => useEditInteraction(), { wrapper });
    const edit = { day: "2026-11-05", kind: "in-person" as const, note: "coffee", minutes: 45 };

    await act(() => result.current.mutateAsync({ id: 7, edit }));

    expect(apiFetch).toHaveBeenCalledWith("/api/interactions/7", { method: "PATCH", body: edit });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["connections"] });
  });

  it("deletes an Interaction and refetches the people", async () => {
    const { client, wrapper } = setup();
    jest.mocked(apiFetch).mockResolvedValue(undefined);
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(() => useDeleteInteraction(), { wrapper });

    await act(() => result.current.mutateAsync(7));

    expect(apiFetch).toHaveBeenCalledWith("/api/interactions/7", { method: "DELETE" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["connections"] });
  });
});

describe("online-only mutations", () => {
  it("creates a person with their dates and phone contact in one call", async () => {
    const { wrapper } = setup();
    jest.mocked(apiFetch).mockResolvedValue({ id: 9 });
    const { result } = await renderHook(() => useCreateConnection(), { wrapper });

    const person = {
      name: "Lee",
      dates: [{ label: "Birthday", date: "2000-03-12", yearly: true }],
      contactId: "42",
    };

    await act(() => result.current.mutateAsync(person));

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/connections",
      { method: "POST", body: person },
      expect.anything(),
    );
  });

  it("saves a patch and stores the saved person", async () => {
    const { client, wrapper } = setup();
    const saved = answer(makeDetail({ planCheckedAt: "2026-11-07T15:00:00.000Z" }));
    jest.mocked(apiFetch).mockResolvedValue(saved);
    const { result } = await renderHook(() => useUpdateConnection(), { wrapper });

    await act(() => result.current.mutateAsync({ id: 3, patch: { planChecked: true } }));

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/connections/3",
      { method: "PATCH", body: { planChecked: true } },
      ConnectionDetailBody,
    );
    expect(client.getQueryData(connectionQuery(3).queryKey)).toEqual(saved);
  });

  it("replaces the notes", async () => {
    const { client, wrapper } = setup();
    const saved = answer(makeDetail({ body: "New notes" }));
    jest.mocked(apiFetch).mockResolvedValue(saved);
    const { result } = await renderHook(() => useSaveConnectionNotes(3), { wrapper });

    await act(() => result.current.mutateAsync("New notes"));

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/connections/3",
      { method: "PUT", body: { body: "New notes" } },
      ConnectionDetailBody,
    );
    expect(client.getQueryData(connectionQuery(3).queryKey)).toEqual(saved);
  });
});

describe("useConnectionSearch", () => {
  it("asks the server, where the notes are searched", async () => {
    const { wrapper } = setup();
    jest.mocked(apiFetch).mockResolvedValue({ found: [{ id: 3, name: "Sam", match: "her move" }] });
    const { result } = await renderHook(() => useConnectionSearch("move"), { wrapper });

    await waitFor(() =>
      expect(result.current.data).toEqual([{ id: 3, name: "Sam", match: "her move" }]),
    );
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/connections?q=move",
      expect.anything(),
      expect.anything(),
    );
  });

  it("waits for a query", async () => {
    const { wrapper } = setup();
    await renderHook(() => useConnectionSearch(""), { wrapper });

    expect(apiFetch).not.toHaveBeenCalled();
  });
});
