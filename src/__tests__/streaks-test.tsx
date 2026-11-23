import {
  checksSince,
  isoAt,
  MISSED,
  shiftDay,
  torontoDay,
  type Counts,
  type RestPeriod,
  type Skips,
} from "@/core";
import { QueryClient } from "@tanstack/react-query";
import { act, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError } from "@/lib/api/errors";
import { STREAKS_KEY, type HabitsBody } from "@/lib/data/habits";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import {
  preloadRoutes,
  resetRouteMocks,
  routeQueryClient,
  setOnline,
  setRouteQueryClient,
} from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, reply, type Write } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn, habit } from "../../jest/fixtures";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { dayButton, findDayButton, holdWrites, showMonthOf } from "../../jest/habit-calendar";
// eslint-disable-next-line no-restricted-imports -- Jest maps sonner-native to this stand-in, so both are one module
import { toast } from "../../jest/sonner-native";

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

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success" },
}));

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

beforeEach(() => {
  jest.mocked(apiFetch).mockClear();
  setRouteQueryClient(createQueryClient());
});

afterEach(() => {
  toast.dismiss();
  resetRouteMocks();
  jest.restoreAllMocks();
});

const TODAY = torontoDay(new Date());

const ago = (days: number) => shiftDay(TODAY, -days);

// Walk: done 10 days up to yesterday, except 3 days ago, which an outside Skip covers, and 5 days ago, a Freeze.
const HISTORY_COUNTS: Counts = Object.fromEntries(
  Array.from({ length: 10 }, (_, index) => [ago(index + 1), { walk: index + 1 === 5 ? 0 : 1 }]),
);

const RECENT_COUNTS: Counts = { [ago(3)]: { walk: MISSED } };

const SKIPS: Skips = { [ago(3)]: { walk: { cause: "outside", note: "" } } };

const tracker = (): HabitsBody => ({
  habits: [habit(), habit({ id: "snack", name: "Snack", kind: "bad" })],
  counts: RECENT_COUNTS,
  durations: {},
  skips: SKIPS,
});

const history = (restPeriods: RestPeriod[] = []) => ({
  counts: HISTORY_COUNTS,
  durations: {},
  skips: SKIPS,
  restPeriods,
});

function serve(restPeriods: RestPeriod[] = []) {
  return fakeApi({
    "/api/habits": tracker,
    "/api/streaks": () => history(restPeriods),
  }).writes;
}

const posted = (writes: Write[]) => writes.map(({ path, body }) => ({ path, body }));

describe("Streaks on the Habits tab", () => {
  it("shows the Streak, longest and Freezes on the row, and the Freeze-free row for a bad Habit has none", async () => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    // 10 days: 8 done, an outside Skip and a Freeze add nothing.
    expect(await screen.findByText("8 days · longest 8 · 2 Freezes")).toBeOnTheScreen();
    expect(screen.getAllByText(/ · longest /)).toHaveLength(1);
  });

  it("marks each day of the grid with its own label", async () => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    await userEvent.press(await screen.findByRole("button", { name: "Details of Walk" }));

    expect(screen.getByLabelText("Walk: last 5 weeks")).toBeOnTheScreen();
    expect(screen.getByLabelText(`${ago(1)}: Done`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`${ago(3)}: Skipped, outside`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`${ago(5)}: Freeze`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`${TODAY}: Today`)).toBeOnTheScreen();
    expect(screen.getAllByLabelText("Strength 34%")).toHaveLength(1);
  });

  it("marks Rest days and shows the Freeze note until the next done day", async () => {
    const counts = { ...HISTORY_COUNTS, [ago(1)]: { walk: 0 }, [ago(2)]: { walk: 0 } };

    fakeApi({
      "/api/habits": tracker,
      "/api/streaks": () => ({ ...history([{ start: ago(2), end: ago(2) }]), counts }),
    });
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    expect(
      await screen.findByText(
        "Used 1 Freeze on Walk. 7 done days in a row earns one; hold up to 3.",
      ),
    ).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Details of Walk" }));

    expect(screen.getByLabelText(`${ago(2)}: Rest`)).toBeOnTheScreen();
  });
});

describe("Rest mode at the foot of the Habits tab", () => {
  it("starts for the days picked", async () => {
    const writes = serve();
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeOnTheScreen();
    await userEvent.press(await screen.findByRole("button", { name: "One day more" }));

    expect(screen.getByText("4 days")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Start Rest mode" }));

    await waitFor(() =>
      expect(posted(writes)).toEqual([
        { path: "/api/streaks", body: { type: "start-rest", days: 4 } },
      ]),
    );
  });

  it("keeps the days between 1 and 30", async () => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    const fewer = await screen.findByRole("button", { name: "One day fewer" });

    await userEvent.press(fewer);
    await userEvent.press(fewer);

    expect(screen.getByText("1 day")).toBeOnTheScreen();
    expect(fewer).toBeDisabled();
  });

  it("ends early while running", async () => {
    const writes = serve([{ start: TODAY, end: shiftDay(TODAY, 2) }]);
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    await userEvent.press(await screen.findByRole("button", { name: "End Rest mode" }));

    expect(screen.getByText(/^Resting through /)).toBeOnTheScreen();
    await waitFor(() =>
      expect(posted(writes)).toEqual([{ path: "/api/streaks", body: { type: "end-rest" } }]),
    );
  });

  it("needs a connection", async () => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: "/habits" });
    await screen.findByRole("button", { name: "Start Rest mode" });

    await act(() => setOnline(false));

    expect(screen.getByRole("button", { name: "Start Rest mode" })).toBeDisabled();
    expect(screen.getByText("Rest mode needs a connection.")).toBeOnTheScreen();
  });

  it("says so when Rest mode can't be loaded", async () => {
    setRouteQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    fakeApi({
      "/api/habits": tracker,
      "/api/streaks": reply(new ApiError(500, null)),
    });
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    expect(await screen.findByText("Couldn't load Rest mode.")).toBeOnTheScreen();
  });

  it("says so when starting Rest mode fails", async () => {
    fakeApi({
      "/api/habits": tracker,
      "/api/streaks": () => history(),
      "POST /api/streaks": reply(new ApiError(500, null)),
    });
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    const start = await screen.findByRole("button", { name: "Start Rest mode" });
    await waitFor(() => expect(start).toBeEnabled());
    await userEvent.press(start);

    expect(await screen.findByText("Couldn't change Rest mode. Try again.")).toBeOnTheScreen();
  });
});

// Walk done `days` days in a row up to yesterday, and nothing else.
const doneUpToYesterday = (days: number): Counts =>
  Object.fromEntries(Array.from({ length: days }, (_, index) => [ago(index + 1), { walk: 1 }]));

function serveToday(historyCounts: Counts, checkedInAt: string[] = []) {
  fakeApi({
    "/api/habits": () => ({
      habits: [habit()],
      counts: {},
      durations: {},
      skips: {},
    }),
    "/api/streaks": () => ({ counts: historyCounts, durations: {}, skips: {}, restPeriods: [] }),
    "/api/check-ins": () => ({
      checkIns: checkedInAt.map((at, index) => checkIn({ id: index + 1, checkedInAt: at })),
    }),
    "/api/check-ins?at": () => ({ place: null }),
    "/api/connections": () => ({ connections: [] }),
    "/api/health-plan": () => ({ item: { body: "", updatedAt: null } }),
  });
}

const hidden = { includeHiddenElements: true };

const noonAgo = (days: number) => isoAt(ago(days), 12 * 60);

describe("Streaks on Today", () => {
  it("shows the Check-in Streak on the Check-in card", async () => {
    serveToday({}, [noonAgo(1), noonAgo(2), noonAgo(2)]);
    await renderRouter(APP_DIR);

    expect(await screen.findByText("Check-in Streak: 2 days · 2 Freezes")).toBeOnTheScreen();
  });

  it("hides the Check-in Streak while none runs", async () => {
    serveToday({}, [noonAgo(10)]);
    await renderRouter(APP_DIR);

    await screen.findByText("Walk");

    expect(screen.queryByText(/Check-in Streak/)).not.toBeOnTheScreen();
  });

  it("plays the big celebration when a Done reaches a 7-day Streak", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.9);
    serveToday(doneUpToYesterday(6));
    await renderRouter(APP_DIR);

    await userEvent.press(await screen.findByRole("checkbox", { name: "Walk done today" }));

    await waitFor(() =>
      expect(
        within(screen.getByTestId("celebration overlay", hidden)).getByTestId("leaf", hidden),
      ).toBeOnTheScreen(),
    );
  });

  it("plays only the tick when a Done reaches no milestone", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.9);
    serveToday(doneUpToYesterday(4));
    await renderRouter(APP_DIR);

    await userEvent.press(await screen.findByRole("checkbox", { name: "Walk done today" }));

    expect(
      within(screen.getByTestId("celebration on walk", hidden)).getByTestId("tick", hidden),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("celebration overlay", hidden)).not.toBeOnTheScreen();
  });
});

// Older than the checks window, so only the Streak history holds this Day.
const BACKFILLED = shiftDay(checksSince(), -2);

const serveBackfilled = () =>
  fakeApi({
    "/api/habits": tracker,
    "/api/streaks": () => ({
      ...history(),
      counts: { ...HISTORY_COUNTS, [BACKFILLED]: { walk: 1 } },
    }),
  }).writes;

const missedPeriods = () =>
  within(screen.getByLabelText("Periods")).queryAllByText("Missed").length;

async function backfillNotDone() {
  await renderRouter(APP_DIR, { initialUrl: "/habit/walk/history" });
  await showMonthOf(BACKFILLED);
  const missedBefore = missedPeriods();

  await userEvent.press(dayButton(BACKFILLED, "Done"));

  return missedBefore;
}

describe("A back-filled Day in History", () => {
  it("shows in the calendar and the period list before the server answers", async () => {
    serveBackfilled();
    holdWrites();

    const missedBefore = await backfillNotDone();

    expect(await findDayButton(BACKFILLED, "Not done")).toBeOnTheScreen();
    expect(missedPeriods()).toBe(missedBefore + 1);
  });

  it("keeps a queued Day through a refetch of the Streak history", async () => {
    serveBackfilled();
    holdWrites();
    await backfillNotDone();
    await findDayButton(BACKFILLED, "Not done");
    const client = routeQueryClient();

    await act(() => client.refetchQueries({ queryKey: STREAKS_KEY }));

    expect(client.getQueryData<{ counts: Counts }>(STREAKS_KEY)?.counts[BACKFILLED]).toEqual({
      walk: MISSED,
    });
  });

  it("puts back the done Day the Streak history held on Undo", async () => {
    const writes = serveBackfilled();

    await backfillNotDone();
    await userEvent.press(
      within(await screen.findByTestId("toast")).getByRole("button", { name: "Undo" }),
    );

    await waitFor(() =>
      expect(posted(writes).at(-1)).toEqual({
        path: "/api/habits",
        body: { type: "check", date: BACKFILLED, habit: "walk", on: true, count: 1 },
      }),
    );
  });
});
