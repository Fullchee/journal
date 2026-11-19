import { isoAt, torontoDay } from "@/core";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

import { ApiError } from "@/lib/api/errors";
import { createQueryClient } from "@/lib/data/query-client";
import { clearTileSession } from "@/lib/widgets/tile-session";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setRouteQueryClient } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, pendingApi, reply, type Respond } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit, timedHabit } from "../../jest/fixtures";
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

jest.mock("@/lib/widgets/tile-session", () => ({ clearTileSession: jest.fn() }));

const mockStored = new Map<string, string>();

jest.mock("expo-sqlite/kv-store", () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => Promise.resolve(mockStored.get(key) ?? null),
    setItem: (key: string, value: string) => {
      mockStored.set(key, value);

      return Promise.resolve();
    },
  },
}));

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success" },
}));

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

beforeEach(() => setRouteQueryClient(createQueryClient()));

afterEach(() => {
  toast.dismiss();
  resetRouteMocks();
  mockStored.clear();
  jest.mocked(clearTileSession).mockClear();
});

function serve(importDurations: Respond = reply({ added: 1 })) {
  return fakeApi({
    "/api/habits": () => ({
      habits: [habit({ id: "walk", name: "Walk" }), timedHabit({ id: "read", name: "Read" })],
      counts: {},
      durations: {},
    }),
    "POST /api/habits": importDurations,
  });
}

describe("the Habits widget's tick", () => {
  const drawnAt = 1_793_853_000_000;

  it("marks the Habit done today and lands on Today", async () => {
    const { writes } = serve();

    await renderRouter(APP_DIR, { initialUrl: `/habit/walk/done?at=${drawnAt}` });

    await waitFor(() => expect(screen).toHavePathname("/"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body).toMatchObject({
      type: "check",
      habit: "walk",
      date: torontoDay(new Date()),
    });
  });

  it("lands on Today without checking when Android replays a tick it already took", async () => {
    mockStored.set("habit-widget-ticks", JSON.stringify({ walk: drawnAt }));
    const { writes } = serve();

    await renderRouter(APP_DIR, { initialUrl: `/habit/walk/done?at=${drawnAt}` });

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(writes).toHaveLength(0);
  });
});

describe("the Quick Settings tile's stop", () => {
  const start = Date.parse(isoAt("2026-11-03", 7 * 60 + 15));
  const url = `/habit/read/duration?start=${start}&end=${start + 25 * 60_000}`;

  const body = {
    type: "import-durations",
    habit: "read",
    entries: [{ date: "2026-11-03", startTime: "07:15", minutes: 25 }],
  };

  it("logs the session as a Duration entry, ends the tile's session and lands on Today", async () => {
    const { writes } = serve();

    await renderRouter(APP_DIR, { initialUrl: url });

    await waitFor(() => expect(screen).toHavePathname("/"));
    // An import skips an entry the Habit already has, so a replayed link adds no second entry.
    expect(writes).toContainEqual(expect.objectContaining({ body }));
    expect(clearTileSession).toHaveBeenCalledWith(start);
  });

  it("shows the minutes while saving", async () => {
    pendingApi();

    await renderRouter(APP_DIR, { initialUrl: url });

    expect(await screen.findByText("Saving 25 min…")).toBeOnTheScreen();
  });

  it("offers a retry when the save fails", async () => {
    const answers = [new ApiError(500, null), { added: 1 }];

    const { writes } = serve(() => {
      const next = answers.shift();

      if (next instanceof Error) throw next;

      return next;
    });

    await renderRouter(APP_DIR, { initialUrl: url });

    expect(await screen.findByText("Couldn't save 25 min.")).toBeOnTheScreen();
    // userEvent's responder press leaves the success Redirect unapplied in the test renderer; the direct press applies it.
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(writes).toHaveLength(2);
  });

  it("keeps the tile's session after a failed save until the owner discards it", async () => {
    serve(() => {
      throw new ApiError(400, null);
    });

    await renderRouter(APP_DIR, { initialUrl: url });

    expect(await screen.findByText("Couldn't save 25 min.")).toBeOnTheScreen();
    expect(clearTileSession).not.toHaveBeenCalled();

    await userEvent.press(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(clearTileSession).toHaveBeenCalledWith(start);
  });

  it.each([
    ["no times", "/habit/read/duration"],
    ["blank times", "/habit/read/duration?start=&end="],
    ["an end that is not a number", `/habit/read/duration?start=${start}&end=soon`],
    ["an end before the start", `/habit/read/duration?start=${start}&end=${start - 60_000}`],
  ])("lands on Today without saving for a link with %s", async (_, initialUrl) => {
    const { writes } = serve();

    await renderRouter(APP_DIR, { initialUrl });

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(writes).toHaveLength(0);
  });
});
