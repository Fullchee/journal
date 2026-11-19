import { checksSince, shiftDay, torontoDay, type Counts, type Habit } from "@/core";
import { router } from "expo-router";
import { act, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";
import * as z from "zod/mini";

import { apiFetch } from "@/lib/api/api-fetch";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setRouteQueryClient } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn, habit } from "../../jest/fixtures";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { dayButton, showMonthOf } from "../../jest/habit-calendar";
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

const TODAY = torontoDay(new Date());

const daysAgo = (n: number) => shiftDay(TODAY, -n);

const TOMORROW = daysAgo(-1);

const ONCE: Habit["target"] = { type: "once", count: 1, days: [] };

const Change = z.object({
  type: z.string(),
  habit: z.string(),
  date: z.optional(z.string()),
  to: z.optional(z.string()),
  count: z.optional(z.number()),
  on: z.optional(z.boolean()),
});

// A server that keeps the checks and Reschedules it is sent, so a refetch shows them as the real API does.
function habitsApi() {
  const portage = habit({ id: "portage", name: "Portage", startDate: daysAgo(3), target: ONCE });

  const habits = [
    habit({ id: "read", name: "Read" }),
    habit({ id: "water", name: "Water", record: "count" }),
    habit({ id: "snack", name: "Snack", kind: "bad" }),
    portage,
  ];

  const counts: Counts = {};
  const moves: string[] = [];

  return fakeApi({
    "/api/check-ins": () => ({ checkIns: [checkIn({})] }),
    "/api/check-ins?at": () => ({ place: null }),
    "/api/habits": () => ({ habits, counts, durations: {} }),
    "/api/connections": () => ({ connections: [] }),
    "/api/health-plan": () => ({ item: { body: "", updatedAt: null } }),
    "POST /api/habits": ({ body }) => {
      const change = Change.parse(body);

      if (change.type === "reschedule" && change.to !== undefined) {
        moves.push(portage.startDate);
        portage.startDate = change.to;
      }

      if (change.type === "undo-reschedule") portage.startDate = moves.pop() ?? portage.startDate;

      if (change.type === "check" && change.date !== undefined)
        counts[change.date] = {
          ...counts[change.date],
          [change.habit]: change.on === true ? (change.count ?? 1) : 0,
        };
    },
  });
}

// Celebrations are decoration, hidden from screen readers.
const hidden = { includeHiddenElements: true };

const drawBig = () => jest.spyOn(Math, "random").mockReturnValue(0);

const drawMini = () => jest.spyOn(Math, "random").mockReturnValue(0.9);

const toastText = () => within(screen.getByTestId("toast")).getAllByText(/./).at(0)?.children.at(0);

const undo = () =>
  userEvent.press(within(screen.getByTestId("toast")).getByRole("button", { name: "Undo" }));

// A request the server never answers, so the app shows only what it laid over the cache itself.
const unanswered = () => new Promise<never>(jest.fn());

const bodies = (writes: { body: unknown }[]) => writes.map(({ body }) => body);

const renderAt = async (url: string, name: string) => {
  const { writes } = habitsApi();
  await renderRouter(APP_DIR, { initialUrl: url });
  await screen.findByText(name);

  return writes;
};

beforeEach(() => {
  drawMini();
  setRouteQueryClient(createQueryClient());
});

afterEach(() => {
  toast.dismiss();
  resetRouteMocks();
  jest.restoreAllMocks();
});

describe("Habit actions on Today", () => {
  it("toasts a Done, ticks its row, and Undo clears the day", async () => {
    const writes = await renderAt("/", "Read");

    await userEvent.press(screen.getByRole("checkbox", { name: "Read done today" }));

    expect(toastText()).toBe("Done · Read");
    expect(screen.getByTestId("toast")).toHaveProp("aria-live", "polite");
    expect(
      within(screen.getByTestId("celebration on read", hidden)).getByTestId("tick", hidden),
    ).toBeOnTheScreen();
    await undo();

    expect(screen.queryByTestId("toast")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("tick", hidden)).not.toBeOnTheScreen();
    await waitFor(() =>
      expect(bodies(writes)).toEqual([
        { type: "check", date: TODAY, habit: "read", on: true, count: 1 },
        { type: "check", date: TODAY, habit: "read", on: false, count: 1 },
      ]),
    );
  });

  it("folds a Done into Done today before the server answers", async () => {
    await renderAt("/", "Read");
    const answer = jest.mocked(apiFetch).getMockImplementation();
    jest
      .mocked(apiFetch)
      .mockImplementation((...request) =>
        request[1].method === "POST" ? unanswered() : answer!(...request),
      );

    await userEvent.press(screen.getByRole("checkbox", { name: "Read done today" }));

    expect(await screen.findByRole("button", { name: "Done today (1)" })).toBeOnTheScreen();
    expect(screen.queryByRole("checkbox", { name: "Read done today" })).not.toBeOnTheScreen();
  });

  it("keeps a Done in Done today after it cancels a hanging Habits refetch", async () => {
    const client = createQueryClient();
    setRouteQueryClient(client);
    await renderAt("/", "Read");
    jest.mocked(apiFetch).mockImplementation(unanswered);
    void client.invalidateQueries();

    await userEvent.press(screen.getByRole("checkbox", { name: "Read done today" }));

    expect(await screen.findByRole("button", { name: "Done today (1)" })).toBeOnTheScreen();
  });

  it("plays a big drawing over the screen instead of the tick, and Undo stops it", async () => {
    drawBig();
    await renderAt("/", "Read");

    await userEvent.press(screen.getByRole("checkbox", { name: "Read done today" }));

    expect(
      within(screen.getByTestId("celebration overlay", hidden)).getByTestId("sprout", hidden),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("tick", hidden)).not.toBeOnTheScreen();
    await undo();
    expect(screen.queryByTestId("sprout", hidden)).not.toBeOnTheScreen();
  });

  it("toasts a Skip, keeps one toast when the cause is saved, and Undo clears the Skip and its cause", async () => {
    const writes = await renderAt("/", "Read");

    await userEvent.press(screen.getByRole("checkbox", { name: "Skip Read today" }));
    expect(toastText()).toBe("Skipped · Read");
    await userEvent.press(screen.getByRole("button", { name: "Put it off" }));

    expect(screen.getAllByTestId("toast")).toHaveLength(1);
    expect(screen.queryByTestId("tick", hidden)).not.toBeOnTheScreen();
    await undo();

    await waitFor(() =>
      expect(bodies(writes).at(-1)).toEqual({
        type: "check",
        date: TODAY,
        habit: "read",
        on: false,
        count: 1,
      }),
    );
  });

  it("toasts a One-off Not done, and Undo makes it overdue again", async () => {
    const writes = await renderAt("/", "Portage");

    await userEvent.press(screen.getByRole("checkbox", { name: "Portage not done today" }));

    expect(toastText()).toBe("Not done · Portage");
    expect(screen.queryByTestId("tick", hidden)).not.toBeOnTheScreen();
    await undo();

    await waitFor(() =>
      expect(bodies(writes).at(-1)).toEqual({
        type: "check",
        date: daysAgo(3),
        habit: "portage",
        on: false,
        count: 1,
      }),
    );
    expect(await screen.findByText("Overdue")).toBeOnTheScreen();
  });

  it("undoes a moved answer on both days: Not done back on the due date, Done off today", async () => {
    const writes = await renderAt("/", "Portage");

    await userEvent.press(screen.getByRole("checkbox", { name: "Portage not done today" }));
    await userEvent.press(await screen.findByRole("button", { name: "Done today (1)" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Portage done today" }));
    expect(toastText()).toBe("Done · Portage");
    await undo();

    await waitFor(() =>
      expect(bodies(writes).slice(-2)).toEqual([
        { type: "check", date: daysAgo(3), habit: "portage", on: true, count: -1 },
        { type: "check", date: TODAY, habit: "portage", on: false, count: 1 },
      ]),
    );
  });

  it("toasts a Reschedule, and Undo puts the One-off back on its date", async () => {
    const writes = await renderAt("/", "Portage");

    await userEvent.press(screen.getByRole("button", { name: "Reschedule Portage" }));
    await userEvent.press(screen.getByRole("radio", { name: "Put it off" }));
    await userEvent.press(screen.getByRole("button", { name: "Reschedule" }));
    await waitFor(() => expect(screen.queryByText("Portage")).not.toBeOnTheScreen());

    expect(toastText()).toBe("Rescheduled · Portage");
    expect(screen.queryByTestId("tick", hidden)).not.toBeOnTheScreen();
    await undo();

    await waitFor(() =>
      expect(bodies(writes).at(-1)).toEqual({
        type: "undo-reschedule",
        habit: "portage",
        to: TOMORROW,
      }),
    );
    expect(await screen.findByText("Portage")).toBeOnTheScreen();
  });

  it("offers no Undo for a clear, and a toast leaves after 10 s", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    await renderAt("/", "Read");

    await userEvent.press(screen.getByRole("checkbox", { name: "Read done today" }));
    await act(() => jest.advanceTimersByTime(10_000));
    expect(screen.queryByTestId("toast")).not.toBeOnTheScreen();

    await userEvent.press(await screen.findByRole("button", { name: "Done today (1)" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Read done today" }));
    expect(screen.queryByTestId("toast")).not.toBeOnTheScreen();
    jest.useRealTimers();
  });
});

describe("Habit actions on the Habits tab", () => {
  it("toasts a Done, plays the tick over the screen, and Undo clears the day", async () => {
    const writes = await renderAt("/habits", "Read");

    await userEvent.press(screen.getByRole("checkbox", { name: "Read today" }));

    expect(toastText()).toBe("Done · Read");
    expect(
      within(screen.getByTestId("celebration overlay", hidden)).getByTestId("tick", hidden),
    ).toBeOnTheScreen();
    await undo();

    await waitFor(() =>
      expect(bodies(writes).at(-1)).toEqual({
        type: "check",
        date: TODAY,
        habit: "read",
        on: false,
        count: 1,
      }),
    );
  });

  it("plays the tick over the screen even while Today, with its row, stays mounted underneath", async () => {
    await renderAt("/", "Read");
    await act(() => router.navigate("/habits"));

    await userEvent.press(await screen.findByRole("checkbox", { name: "Read today" }));

    expect(
      within(screen.getByTestId("celebration overlay", hidden)).getByTestId("tick", hidden),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId("celebration on read", hidden)).not.toBeOnTheScreen();
  });

  it("toasts a bad Habit log without celebrating it", async () => {
    drawBig();
    await renderAt("/habits", "Snack");

    await userEvent.press(screen.getByRole("checkbox", { name: "Snack today" }));

    expect(toastText()).toBe("Done · Snack");
    expect(screen.queryByTestId("sprout", hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId("tick", hidden)).not.toBeOnTheScreen();
  });

  it("celebrates one more of a counted Habit but not one fewer", async () => {
    await renderAt("/habits", "Water");

    await userEvent.press(screen.getByRole("button", { name: "One more Water" }));
    expect(screen.getByTestId("tick", hidden)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "One more Water" }));
    await waitFor(() => expect(screen.queryByTestId("tick", hidden)).not.toBeOnTheScreen());
    await userEvent.press(screen.getByRole("button", { name: "One fewer Water" }));

    expect(toastText()).toBe("Done · Water");
    expect(screen.queryByTestId("tick", hidden)).not.toBeOnTheScreen();
  });
});

describe("Habit actions in History", () => {
  it("puts back a back-filled Day's count, read from the Streak history, on Undo", async () => {
    // Older than the checks window, so the Habits tab's cache never holds this Day.
    const backfilled = shiftDay(checksSince(), -2);
    const counts: Counts = { [backfilled]: { water: 3 } };
    const water = habit({ id: "water", name: "Water", record: "count", startDate: daysAgo(40) });

    const { writes } = fakeApi({
      "/api/habits": () => ({ habits: [water], counts: {}, durations: {} }),
      "/api/streaks": () => ({ counts, durations: {}, skips: {}, restPeriods: [] }),
    });

    await renderRouter(APP_DIR, { initialUrl: "/habit/water/history" });
    await showMonthOf(backfilled);

    await userEvent.press(dayButton(backfilled, "Done"));
    await userEvent.press(screen.getByRole("button", { name: "More" }));

    expect(toastText()).toBe("Done · Water");

    await undo();

    await waitFor(() =>
      expect(bodies(writes)).toEqual([
        { type: "check", date: backfilled, habit: "water", on: true, count: 4 },
        { type: "check", date: backfilled, habit: "water", on: true, count: 3 },
      ]),
    );
  });
});
