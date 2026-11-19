import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { torontoDay } from "@/core";
import type { ReactNode } from "react";

import { createQueryClient } from "@/lib/data/query-client";
import { useHabitWidgets } from "@/lib/widgets/use-habit-widgets.android";
import { useHabitWidgets as useWebHabitWidgets } from "@/lib/widgets/use-habit-widgets";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../../modules/journal-android";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, reply } from "../../../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../../../jest/fixtures";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

beforeEach(() => jest.clearAllMocks());

it("pushes today's open Habits to Android once the Habits load", async () => {
  fakeApi({
    "/api/habits": reply({ habits: [habit({ id: "walk", name: "Walk" })] }),
  });

  await renderHook(useHabitWidgets, { wrapper: wrapperFor(createQueryClient()) });

  await waitFor(() => expect(JournalAndroid.setHabits).toHaveBeenCalled());
  expect(JSON.parse(jest.mocked(JournalAndroid.setHabits).mock.calls[0]![0])).toEqual({
    date: torontoDay(new Date()),
    due: [{ id: "walk", name: "Walk", tick: true }],
    timed: null,
  });
});

it("pushes nothing off Android", async () => {
  await renderHook(useWebHabitWidgets);

  expect(JournalAndroid.setHabits).not.toHaveBeenCalled();
});
