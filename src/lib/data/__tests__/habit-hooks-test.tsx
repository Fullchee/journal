import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import type { ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { apiFetch } from "@/lib/api/api-fetch";
import { useHabitLibrary, useHabitTracker, useTodayHabits } from "@/lib/data/habits";
import { createQueryClient } from "@/lib/data/query-client";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

// 23:50 on Tuesday Nov 3 in Toronto, already Nov 4 in UTC; six Days back still reaches before Nov 1.
const LATE_TUESDAY = "2026-11-03T23:50:00-05:00";
const EARLY_WEDNESDAY = "2026-11-04T00:10:00-05:00";

// Only Date is fake, so TanStack's timers and waitFor run as usual.
const startLateTuesday = () =>
  jest.useFakeTimers({
    now: new Date(LATE_TUESDAY),
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });

let client: QueryClient;
let appStateListeners: ((state: AppStateStatus) => void)[];

beforeEach(() => {
  client = createQueryClient();
  client.mount();
  appStateListeners = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListeners.push(listener);

    return { remove: jest.fn() };
  });
  jest.mocked(apiFetch).mockClear().mockResolvedValue({ habits: [], counts: {} });
});

afterEach(() => {
  client.unmount();
  client.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

function TodayHabits() {
  useTodayHabits();

  return null;
}

const Blank = () => null;

const habitPaths = () =>
  jest
    .mocked(apiFetch)
    .mock.calls.map(([path]) => path)
    .filter((path) => path.startsWith("/api/habits"));

it.each([
  ["useHabitTracker", useHabitTracker, "/api/habits?view=tracker&since=2026-10-28"],
  ["useTodayHabits", useTodayHabits, "/api/habits?view=home&since=2026-10-28"],
  ["useHabitLibrary", useHabitLibrary, "/api/habits?view=library"],
])(
  "%s fetches its view, its window six Toronto Days back even past UTC's midnight",
  async (_name, useView, path) => {
    startLateTuesday();

    const { result } = await renderHook(useView, { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(habitPaths()).toEqual([path]);
  },
);

it("moves to the new Day's window when the app comes back to the foreground", async () => {
  startLateTuesday();
  const { result } = await renderHook(useHabitTracker, { wrapper });
  await waitFor(() => expect(result.current.data).toBeDefined());

  jest.setSystemTime(new Date(EARLY_WEDNESDAY));
  await act(() => {
    for (const listener of appStateListeners) listener("background");
  });
  expect(habitPaths()).toHaveLength(1);

  await act(() => {
    for (const listener of appStateListeners) listener("active");
  });

  await waitFor(() =>
    expect(habitPaths().at(-1)).toBe("/api/habits?view=tracker&since=2026-10-29"),
  );
});

it("moves to the new Day's window when the screen gains focus", async () => {
  startLateTuesday();
  await renderRouter({ index: TodayHabits, "log-entry": Blank }, { wrapper });
  await waitFor(() => expect(habitPaths()).toHaveLength(1));
  await act(() => router.push("/log-entry"));

  jest.setSystemTime(new Date(EARLY_WEDNESDAY));
  await act(() => router.back());

  await waitFor(() => expect(habitPaths().at(-1)).toBe("/api/habits?view=home&since=2026-10-29"));
});

it("gives the Habits tab and a Goal's page one tracker fetch", async () => {
  const { result } = await renderHook(() => ({ tab: useHabitTracker(), goal: useHabitTracker() }), {
    wrapper,
  });

  await waitFor(() => expect(result.current.goal.data).toBeDefined());
  expect(result.current.tab.data).toBe(result.current.goal.data);
  expect(habitPaths()).toHaveLength(1);
});
