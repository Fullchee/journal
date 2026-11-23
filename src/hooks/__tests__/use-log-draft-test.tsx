import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { useLogDraft } from "@/hooks/use-log-draft";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../../jest/fixtures";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
});

// Today's composer and the Check-in push the form on top instead of swapping a modal for it.
it("pushes the form for a draft with a problem when not replacing", async () => {
  const { writes } = fakeApi({
    "/api/habits": () => ({ habits: [habit({})], counts: {}, durations: {} }),
    "POST /api/log/draft": () => ({ type: "entries", entries: [{ habit: null }] }),
  });

  const client = createQueryClient();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const { result } = await renderHook(() => useLogDraft(), { wrapper });

  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => result.current.open("something"));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/log-entry",
    params: { text: "something", draft: JSON.stringify([{ habit: null }]) },
  });
  expect(mockReplace).not.toHaveBeenCalled();
  expect(writes.map(({ path }) => path)).toEqual(["/api/log/draft"]);
});

it("opens the form with times the owner picked over the model's", async () => {
  fakeApi({
    "/api/habits": () => ({ habits: [habit({})], counts: {}, durations: {} }),
    "POST /api/log/draft": () => ({ type: "entries", entries: [{ habit: null, minutes: 20 }] }),
  });

  const client = createQueryClient();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const { result } = await renderHook(() => useLogDraft(), { wrapper });
  const span = { date: "2026-11-03", start_time: "14:00", minutes: 90 };

  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => result.current.open("walked", span));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/log-entry",
    params: {
      text: "walked",
      draft: JSON.stringify([
        { habit: null, minutes: 90, date: "2026-11-03", start_time: "14:00" },
      ]),
    },
  });
});
