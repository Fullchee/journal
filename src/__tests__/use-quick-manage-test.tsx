import { Habit } from "@/core";
import { act, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

import { ApiError } from "@/lib/api/errors";
import type { HabitsBody } from "@/lib/data/habits";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setRouteQueryClient } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, type Write } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../jest/fixtures";
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

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

const WALK = habit();

// A server that keeps each saved Habit, so a refetch shows the change.
function serve({ fail = false, failAfter = Infinity } = {}) {
  let habits: Habit[] = [WALK, habit({ id: "water", name: "Water" })];
  let posts = 0;

  const tracker = (): HabitsBody => ({ habits, counts: {}, durations: {} });

  return fakeApi({
    "/api/habits": tracker,
    "/api/check-ins": () => ({ checkIns: [] }),
    "POST /api/habits": ({ body }) => {
      posts += 1;

      if (fail || posts > failAfter) throw new ApiError(500, null);

      const saved = Habit.parse(body);

      habits = habits.map((row) => (row.id === saved.id ? saved : row));
    },
  });
}

const saved = (writes: Write[]) => writes.map(({ body }) => Habit.parse(body));

const toastText = () => within(screen.getByTestId("toast")).getAllByText(/./).at(0)?.children.at(0);

const press = (el: Parameters<typeof userEvent.press>[0]) => act(() => userEvent.press(el));

async function openWalk(options?: Parameters<typeof serve>[0]) {
  const api = serve(options);
  await renderRouter(APP_DIR, { initialUrl: "/habits" });
  await press(await screen.findByRole("button", { name: "Details of Walk" }));

  return api;
}

const stage = (name: string) =>
  within(screen.getByLabelText("Stage of Walk")).getByRole("button", { name });

beforeEach(() => setRouteQueryClient(createQueryClient()));

afterEach(() => {
  toast.dismiss();
  resetRouteMocks();
});

describe("Manage on the Habit card", () => {
  it("saves a Stage at once, toasts it, and Undo saves the old Stage", async () => {
    const { writes } = await openWalk();

    await press(stage("Sprout"));

    await waitFor(() => expect(toastText()).toBe("Stage: sprout · Walk"));
    expect(writes[0]?.body).toEqual({ type: "habit", ...WALK, stage: "sprout" });
    await waitFor(() => expect(stage("Sprout")).toBeSelected());

    await press(within(screen.getByTestId("toast")).getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(saved(writes).map((row) => row.stage)).toEqual(["sprout", "seed"]));
    await waitFor(() => expect(stage("Seed")).toBeSelected());
  });

  it("stops logging a Tree, and Undo brings its day back", async () => {
    await openWalk();

    await press(stage("Tree"));

    await waitFor(() => expect(toastText()).toBe("Stage: tree · Walk"));
    await waitFor(() =>
      expect(screen.queryByRole("checkbox", { name: "Walk today" })).not.toBeOnTheScreen(),
    );

    await press(within(screen.getByTestId("toast")).getByRole("button", { name: "Undo" }));

    expect(await screen.findByRole("checkbox", { name: "Walk today" })).toBeOnTheScreen();
  });

  it("moves a Habit under Backlog after the refetch, and Make active brings it back", async () => {
    const { writes } = await openWalk();

    await press(screen.getByRole("button", { name: "Move to Backlog" }));

    await waitFor(() => expect(toastText()).toBe("Moved to Backlog · Walk"));
    // The collapsed Backlog unmounted the card, yet its toast still showed; the card stays expanded.
    await press(await screen.findByRole("button", { name: "Backlog (1)" }));
    await press(screen.getByRole("button", { name: "Make active" }));

    await waitFor(() => expect(toastText()).toBe("Made active · Walk"));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Backlog (1)" })).not.toBeOnTheScreen(),
    );
    expect(saved(writes).map((row) => row.active)).toEqual([false, true]);
  });

  it("opens History from Log a past day", async () => {
    await openWalk();

    await press(screen.getByRole("button", { name: "Log a past day" }));

    expect(screen).toHavePathname("/habit/walk/history");
  });

  it("says when a save failed, with no toast", async () => {
    await openWalk({ fail: true });

    await press(stage("Plant"));

    expect(await screen.findByText("Couldn't save. Try again.")).toBeOnTheScreen();
    expect(screen.queryByTestId("toast")).not.toBeOnTheScreen();
  });

  it("says a failed Undo in the toast, and its Undo tries again", async () => {
    const { writes } = await openWalk({ failAfter: 1 });

    await press(screen.getByRole("button", { name: "Move to Backlog" }));
    await waitFor(() => expect(toastText()).toBe("Moved to Backlog · Walk"));

    await press(within(screen.getByTestId("toast")).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(toastText()).toBe("Couldn't undo · Walk"));

    await press(within(screen.getByTestId("toast")).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(writes).toHaveLength(3));
    expect(writes.slice(1).map(({ body }) => Habit.parse(body).active)).toEqual([true, true]);
  });
});
