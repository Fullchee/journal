import { shiftDay, torontoDay, type Circle, type Habit } from "@/core";
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
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { openMore } from "../../jest/habit-editor";

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
const YEAR = TODAY.slice(0, 4);
const LAST_YEAR = String(Number(YEAR) - 1);

const ANA = { id: 1, name: "Ana" };
const BEN = { id: 2, name: "Ben" };

// A practice due every day of a Season that started two days ago.
const practice = habit({
  id: "boat",
  name: "Dragon boat practice",
  seasons: [
    { start: `${LAST_YEAR}-04-01`, end: `${LAST_YEAR}-10-18` },
    { start: shiftDay(TODAY, -2), end: null },
  ],
});

const team = (over: Partial<Circle> = {}): Circle => ({
  id: 5,
  name: `Shockwave dragon boat ${LAST_YEAR}`,
  habitId: "boat",
  followsFrom: `${LAST_YEAR}-04-01`,
  members: [ANA, BEN],
  ...over,
});

function serve(habits: Habit[], circles: Circle[]) {
  return fakeApi({
    "/api/habits": () => ({
      habits,
      goals: [],
      counts: {},
      durations: {},
      skips: {},
    }),
    "/api/streaks": () => ({ counts: {}, durations: {}, skips: {}, restPeriods: [] }),
    "/api/check-ins": () => ({ checkIns: [] }),
    "/api/check-ins?at": () => ({ place: null }),
    "/api/connections": () => ({ connections: [] }),
    "/api/circles": () => ({ circles }),
    "/api/health-plan": () => ({ item: { body: "", updatedAt: null } }),
  }).writes;
}

const circleWrites = (writes: Write[]) =>
  writes.filter(({ path }) => path.startsWith("/api/circles"));

describe("Today's Who you'll see", () => {
  it("lists the members of the Circle a due Habit follows, and never asks who came", async () => {
    serve([practice], [team()]);
    await renderRouter(APP_DIR, { initialUrl: "/today" });

    expect(await screen.findByText("Who you'll see: Ana, Ben")).toBeOnTheScreen();
    expect(screen.queryByText(/who came|attend/i)).not.toBeOnTheScreen();
  });

  it("lists no one off-season", async () => {
    serve(
      [
        { ...practice, seasons: [{ start: `${LAST_YEAR}-04-01`, end: `${LAST_YEAR}-10-18` }] },
        habit(),
      ],
      [team()],
    );
    await renderRouter(APP_DIR, { initialUrl: "/today" });

    await screen.findByText("Walk");

    expect(screen.queryByText(/Who you'll see/)).not.toBeOnTheScreen();
  });

  it("offers one tap to start this year’s Circle with last year’s members", async () => {
    const writes = serve([practice], [team()]);
    await renderRouter(APP_DIR, { initialUrl: "/today" });

    await userEvent.press(
      await screen.findByRole("button", {
        name: `Start Shockwave dragon boat ${YEAR} with Shockwave dragon boat ${LAST_YEAR}'s 2 people`,
      }),
    );

    await waitFor(() =>
      expect(circleWrites(writes)).toEqual([
        {
          path: "/api/circles",
          method: "POST",
          body: { name: `Shockwave dragon boat ${YEAR}`, habitId: "boat", memberIds: [1, 2] },
        },
      ]),
    );
    expect(await screen.findByText(/Made this year's Circle/)).toBeOnTheScreen();
  });

  it("makes no offer once the Season is a week old", async () => {
    serve([{ ...practice, seasons: [{ start: shiftDay(TODAY, -7), end: null }] }], [team()]);
    await renderRouter(APP_DIR, { initialUrl: "/today" });

    await screen.findByText("Who you'll see: Ana, Ben");

    expect(screen.queryByRole("button", { name: /^Start Shockwave/ })).not.toBeOnTheScreen();
  });
});

describe("the Circle on a Habit page", () => {
  it("picks a free Circle for the Habit to follow", async () => {
    const writes = serve(
      [practice],
      [
        team({ habitId: null, followsFrom: null }),
        team({ id: 6, name: "Mahjong", habitId: "mahjong" }),
      ],
    );

    await renderRouter(APP_DIR, { initialUrl: "/habit/boat" });
    await openMore();

    await userEvent.press(
      await screen.findByRole("radio", { name: `Shockwave dragon boat ${LAST_YEAR}` }),
    );

    expect(screen.queryByRole("radio", { name: "Mahjong" })).not.toBeOnTheScreen();
    await waitFor(() =>
      expect(circleWrites(writes)).toEqual([
        { path: "/api/circles/5", method: "PATCH", body: { habitId: "boat" } },
      ]),
    );
  });

  it("says when no Circle is free", async () => {
    serve([practice], []);
    await renderRouter(APP_DIR, { initialUrl: "/habit/boat" });
    await openMore();

    expect(
      await screen.findByText("No free Circle. Add one on a person's page."),
    ).toBeOnTheScreen();
  });

  it("shows the followed Circle, offers this year’s, and stops following", async () => {
    const writes = serve([practice], [team({ members: [ANA] })]);
    await renderRouter(APP_DIR, { initialUrl: "/habit/boat" });
    await openMore();

    expect(
      await screen.findByText(`Shockwave dragon boat ${LAST_YEAR} · 1 person`),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Start Shockwave dragon boat/ })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Stop following" }));

    await waitFor(() =>
      expect(circleWrites(writes)).toEqual([
        { path: "/api/circles/5", method: "PATCH", body: { habitId: null } },
      ]),
    );
  });

  it("shows no Circle section on a One-off", async () => {
    serve(
      [
        habit({
          id: "trip",
          name: "Trip",
          target: { type: "once", count: 1, days: [] },
          startDate: TODAY,
        }),
      ],
      [team()],
    );
    await renderRouter(APP_DIR, { initialUrl: "/habit/trip" });

    await screen.findByText("Edit habit");
    await openMore();

    expect(screen.queryByText("Circle")).not.toBeOnTheScreen();
  });
});
