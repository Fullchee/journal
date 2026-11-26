import { shiftDay, torontoDay, type Habit } from "@/core";
import { renderRouter, screen, waitFor } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

import { apiFetch } from "@/lib/api/api-fetch";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setRouteQueryClient } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, type Write } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../jest/fixtures";

jest.mock("@/lib/data/data-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockDataProvider(),
);

jest.mock("@/lib/auth/auth-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockAuthProvider(),
);

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockUniwind(),
);

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

beforeEach(() => {
  jest.mocked(apiFetch).mockClear();
  setRouteQueryClient(createQueryClient());
});

afterEach(() => {
  resetRouteMocks();
  jest.restoreAllMocks();
});

const TODAY = torontoDay(new Date());
const YEAR = Number(TODAY.slice(0, 4));

// Last year's Season started on today's date, so Today's window opened 14 days ago.
const boat = habit({
  id: "boat",
  name: "Dragon boat",
  seasons: [{ start: `${String(YEAR - 1)}${TODAY.slice(4)}`, end: `${String(YEAR - 1)}-12-31` }],
});

function serveToday(habits: Habit[]) {
  return fakeApi({
    "/api/habits": () => ({ habits, counts: {}, durations: {}, skips: {} }),
    "/api/streaks": () => ({ counts: {}, durations: {}, skips: {}, restPeriods: [] }),
    "/api/check-ins": () => ({ checkIns: [] }),
    "/api/check-ins?at": () => ({ place: null }),
    "/api/connections": () => ({ connections: [] }),
    "/api/health-plan": () => ({ item: { body: "", updatedAt: null } }),
  }).writes;
}

const savedHabits = (writes: Write[]) =>
  writes.flatMap(({ path, body }) => (path === "/api/habits" ? [body] : []));

describe("Season nudge on Today", () => {
  it.each([
    ["Started today", { seasons: [...boat.seasons, { start: TODAY, end: null }] }],
    ["Not yet", { seasonQuietUntil: shiftDay(TODAY, 6) }],
    ["Not this year", { seasonQuietUntil: `${String(YEAR)}-12-31` }],
  ])("asks whether the Season started; %s saves the answer", async (answer, patch) => {
    const writes = serveToday([boat]);
    await renderRouter(APP_DIR, { initialUrl: "/today" });

    expect(await screen.findByText("Has Dragon boat season started?")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: answer }));

    await waitFor(() =>
      expect(savedHabits(writes)).toEqual([{ type: "habit", ...boat, ...patch }]),
    );
  });

  it("stays quiet for a Habit without Seasons", async () => {
    serveToday([habit()]);
    await renderRouter(APP_DIR, { initialUrl: "/today" });

    await screen.findByText("Walk");

    expect(screen.queryByText(/season started/)).not.toBeOnTheScreen();
  });
});
