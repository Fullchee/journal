import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { apiFetch } from "@/lib/api/api-fetch";
import { createQueryClient } from "@/lib/data/query-client";
import { useHabitHistory } from "@/lib/data/streaks";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../../../jest/fixtures";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

describe("useHabitHistory", () => {
  it("reads the history alone when the tracker sent no recent days", async () => {
    jest.mocked(apiFetch).mockResolvedValue({
      counts: { "2026-11-09": { walk: 1 } },
      durations: {},
      skips: {},
      restPeriods: [],
    });

    const { result } = await renderHook(
      () => useHabitHistory(habit(), { habits: [] }, new Date("2026-11-10T12:00:00Z")),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current).not.toBeNull());
  });
});
