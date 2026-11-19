import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { useCheckInParts } from "@/lib/data/check-ins";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, reply } from "../../../../jest/fake-api";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));

let client: QueryClient;

beforeEach(() => {
  client = createQueryClient();
  client.mount();
});

afterEach(() => {
  client.unmount();
  client.clear();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const part = (id: number, name: string, retired = false) => ({
  id,
  name,
  role: "unknown",
  wants: "",
  fears: "",
  feltIn: "",
  description: "",
  retired,
  createdAt: "2026-11-10T00:00:00.000Z",
  recentCheckIns: 0,
});

it("offers no Part until the Parts load", async () => {
  fakeApi({ "/api/parts": reply(new Error("offline")) });

  const { result } = await renderHook(() => useCheckInParts(), { wrapper });

  await waitFor(() => expect(result.current).toEqual([]));
});

it("offers the active Parts by reference, but no retired Part", async () => {
  fakeApi({
    "/api/parts": reply({
      parts: [part(1, "Doer"), part(2, "Critic", true), part(3, "Child")],
    }),
  });

  const { result } = await renderHook(() => useCheckInParts(), { wrapper });

  await waitFor(() =>
    expect(result.current).toEqual([
      { id: 1, name: "Doer" },
      { id: 3, name: "Child" },
    ]),
  );
});
