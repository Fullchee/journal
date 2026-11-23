import {
  answerTree,
  daysFrom,
  Habit,
  shiftDay,
  torontoDay,
  TREE_ANSWERS,
  type Counts,
} from "@/core";
import { act, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

import * as z from "zod/mini";

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

const TODAY = torontoDay(new Date());

// Done every day for 80 days: Strength near 99%, past the 66-day floor, so its card asks the tree question.
const WALK = habit({ startDate: shiftDay(TODAY, -80) });

const counts: Counts = Object.fromEntries(
  daysFrom(WALK.startDate, shiftDay(TODAY, -1)).map((day) => [day, { walk: 1 }]),
);

const TreeChange = z.object({
  type: z.literal("tree"),
  habit: z.string(),
  answer: z.enum(TREE_ANSWERS),
});

// A server that keeps each saved Habit and tree answer, so a refetch shows the change.
function serve({ fail = false, failAfter = Infinity, walk = WALK } = {}) {
  let habits: Habit[] = [walk, habit({ id: "water", name: "Water" })];
  let posts = 0;

  const tracker = (): HabitsBody => ({ habits, counts: {}, durations: {} });

  const answer = ({ habit: id, answer: given }: z.infer<typeof TreeChange>) => {
    const records = { counts, durations: {}, skips: {}, restPeriods: [] };

    habits = habits.map((row) => {
      const tree = row.id === id ? answerTree(row, given, records, new Date()) : null;

      return tree ? { ...row, ...tree } : row;
    });
  };

  return fakeApi({
    "/api/habits": tracker,
    "/api/check-ins": () => ({ checkIns: [] }),
    "/api/streaks": () => ({ counts, durations: {}, skips: {}, restPeriods: [], notes: {} }),
    "POST /api/habits": ({ body }) => {
      posts += 1;

      if (fail || posts > failAfter) throw new ApiError(500, null);

      const tree = TreeChange.safeParse(body);

      if (tree.success) {
        answer(tree.data);

        return;
      }

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

beforeEach(() => setRouteQueryClient(createQueryClient()));

afterEach(() => {
  toast.dismiss();
  resetRouteMocks();
});

describe("Manage on the Habit card", () => {
  it("shows the Stage from Strength, and Yes makes the Habit a tree that still logs", async () => {
    const { writes } = await openWalk();

    expect(await screen.findByRole("button", { name: /^Walk, Plant,/ })).toBeOnTheScreen();
    await press(await screen.findByRole("button", { name: "Yes" }));

    expect(writes[0]?.body).toEqual({ type: "tree", habit: "walk", answer: "yes" });
    expect(await screen.findByRole("button", { name: /^Walk, Tree,/ })).toBeOnTheScreen();
    expect(screen.queryByText("Do you do this without thinking?")).not.toBeOnTheScreen();
    expect(screen.getByRole("checkbox", { name: "Walk today" })).toBeOnTheScreen();
  });

  it("hides the tree question after Not yet", async () => {
    const { writes } = await openWalk();

    await press(await screen.findByRole("button", { name: "Not yet" }));

    expect(writes[0]?.body).toEqual({ type: "tree", habit: "walk", answer: "not-yet" });
    await waitFor(() =>
      expect(screen.queryByText("Do you do this without thinking?")).not.toBeOnTheScreen(),
    );
  });

  it("brings a tree back to its Strength's Stage on Slipped", async () => {
    const { writes } = await openWalk({
      walk: { ...WALK, trees: [{ start: shiftDay(TODAY, -5), end: null }] },
    });

    await press(await screen.findByRole("button", { name: "Slipped" }));

    expect(writes[0]?.body).toEqual({ type: "tree", habit: "walk", answer: "slipped" });
    expect(await screen.findByRole("button", { name: /^Walk, Plant,/ })).toBeOnTheScreen();
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

  it("says when a Backlog save failed, with no toast", async () => {
    await openWalk({ fail: true });

    await press(screen.getByRole("button", { name: "Move to Backlog" }));

    expect(await screen.findByText("Couldn't save. Try again.")).toBeOnTheScreen();
    expect(screen.queryByTestId("toast")).not.toBeOnTheScreen();
  });

  it("says when a tree answer failed", async () => {
    await openWalk({ fail: true });

    await press(await screen.findByRole("button", { name: "Yes" }));

    expect(await screen.findByText("Couldn't save. Try again.")).toBeOnTheScreen();
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
