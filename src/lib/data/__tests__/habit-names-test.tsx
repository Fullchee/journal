import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { apiFetch } from "@/lib/api/api-fetch";
import { useHabitNames } from "@/lib/data/habits";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn, habit, timedHabit } from "../../../../jest/fixtures";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

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

const serve = (habits: unknown[], doing: string[] = []) =>
  jest
    .mocked(apiFetch)
    .mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith("/api/check-ins")
          ? { checkIns: doing.map((d, i) => checkIn({ id: i + 1, doing: d })) }
          : { habits },
      ),
    );

it("names only the active Timed Habits", async () => {
  serve([
    habit({ id: "meds", name: "Meds" }),
    timedHabit({ id: "walk", name: "Walk" }),
    timedHabit({ id: "old", name: "Old", active: false }),
  ]);

  const { result } = await renderHook(() => useHabitNames()(""), { wrapper });

  await waitFor(() => expect(result.current).toEqual(["Walk"]));
});

it("names no Habits while they load", async () => {
  jest.mocked(apiFetch).mockReturnValue(Promise.withResolvers<never>().promise);

  const { result } = await renderHook(() => useHabitNames()(""), { wrapper });

  expect(result.current).toEqual([]);
});

it("puts the Habit named in more past Check-ins first", async () => {
  serve(
    [timedHabit({ id: "read", name: "Read" }), timedHabit({ id: "walk", name: "Walk" })],
    ["Read", "Walk", "walk", "Walk "],
  );

  const { result } = await renderHook(() => useHabitNames()(""), { wrapper });

  await waitFor(() => expect(result.current).toEqual(["Walk", "Read"]));
});

it("names the Habits that fit the place, or every one when none fits", async () => {
  serve([
    timedHabit({ id: "lift", name: "Lift", places: ["Gym"] }),
    timedHabit({ id: "read", name: "Read" }),
    timedHabit({ id: "code", name: "Code", places: ["Work"] }),
  ]);

  const { result } = await renderHook(() => useHabitNames(), { wrapper });

  await waitFor(() => expect(result.current("Gym")).toEqual(["Lift", "Read"]));
  expect(result.current("")).toEqual(["Lift", "Read", "Code"]);
});
