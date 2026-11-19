import {
  shiftDay,
  TIME_ZONE,
  torontoDay,
  type CheckIn,
  type Counts,
  type Habit,
  type LogDraft,
  type Position,
} from "@/core";
import { CheckInCard } from "@/ui";
import type * as JournalUi from "@/ui";
import { onlineManager } from "@tanstack/react-query";
import { isValidElement } from "react";
import { NotificationFeedbackType, notificationAsync } from "expo-haptics";
import { DeviceEventEmitter, Platform, type RefreshControlProps } from "react-native";
import * as z from "zod/mini";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError } from "@/lib/api/errors";
import { currentPosition } from "@/lib/location/current-position";
import type * as LogData from "@/lib/data/log";
import { savedPlanQuery } from "@/lib/data/plan";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import {
  preloadRoutes,
  resetRouteMocks,
  routeQueryClient,
  setRouteQueryClient,
} from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { scrollableAround } from "../../jest/scrollable";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn, connection, habit, timedHabit } from "../../jest/fixtures";

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

const mockDraftLog = jest.fn((_text: string) =>
  Promise.resolve<LogDraft>({ type: "entries", entries: [{ habit: "walk", minutes: 20 }] }),
);

jest.mock("@/lib/data/log", () => ({
  ...jest.requireActual<typeof LogData>("@/lib/data/log"),
  draftLog: (text: string) => mockDraftLog(text),
}));

// The marked plate shows only as a border colour, so the test reads the zone the card was given.
jest.mock("@/ui", () => {
  const ui = jest.requireActual<typeof JournalUi>("@/ui");

  return { ...ui, CheckInCard: jest.fn(ui.CheckInCard) };
});

// jest-expo's expo-crypto returns no id, so a queued Check-in would match the fetched rows and hide.
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success" },
}));

interface MockLocation {
  position: Position | null;
}

const mockLocation: MockLocation = { position: null };

jest.mock("@/lib/location/current-position", () => ({
  currentPosition: jest.fn(() => Promise.resolve(mockLocation.position)),
}));

const mockWindow = { width: 390 };

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWindow.width, height: 900, scale: 1, fontScale: 1 }),
}));

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

const TODAY = torontoDay(new Date());

const mom = connection();

const PLAN = "## Care team\n- GP\n\n## Next action\nCall the clinic.";

const HABITS = [
  habit({}),
  habit({ id: "read", name: "Read" }),
  habit({ id: "snack", name: "Snack", active: false }),
];

const savedCheckIn = () => checkIn({ id: 9, score: 1, zone: "Storm" });

const todayRoutes = ({
  latest = "Sun",
  habits = HABITS,
}: {
  latest?: CheckIn["zone"];
  habits?: Habit[];
}) => ({
  "/api/check-ins": () => ({ checkIns: [checkIn({ zone: latest })] }),
  "/api/check-ins?at": () => ({ place: null }),
  "/api/habits": () => ({ habits, counts: { [TODAY]: { walk: 1 } }, durations: {} }),
  "/api/connections": () => ({ connections: [mom] }),
  "/api/circles": () => ({ circles: [] }),
  "/api/health-plan": () => ({ item: { body: PLAN, updatedAt: null } }),
  "POST /api/check-ins": savedCheckIn,
  "PATCH /api/check-ins": savedCheckIn,
  "POST /api/log/entries": () => ({ type: "logged", text: "Logged Walk.", action: 1 }),
});

beforeEach(() => {
  mockWindow.width = 390;
  mockLocation.position = null;
  setRouteQueryClient(createQueryClient());
});

afterEach(() => {
  resetRouteMocks();
  jest.restoreAllMocks();
});

const renderToday = async (url = "/", latest: CheckIn["zone"] = "Sun") => {
  const { writes } = fakeApi(todayRoutes({ latest }));
  await renderRouter(APP_DIR, { initialUrl: url });
  await screen.findByText("Read");

  return writes;
};

const daysAgo = (n: number) => shiftDay(TODAY, -n);

const TOMORROW = daysAgo(-1);

const ONCE: Habit["target"] = { type: "once", count: 1, days: [] };

// A server that keeps the checks and Reschedules it is sent, so a refetch shows them as the real API does.
function oneOffApi(startDate: string) {
  const portage = habit({ id: "portage", name: "Portage", startDate, target: ONCE });
  const read = habit({ id: "read", name: "Read", alarm: { time: "07:00", kind: "alarm" } });
  const counts: Counts = { [TODAY]: { walk: 1 } };

  const api = fakeApi({
    ...todayRoutes({}),
    "/api/habits": () => ({
      habits: [habit({}), read, portage],
      counts,
      durations: {},
    }),
    "POST /api/habits": ({ body }) => {
      const change = z
        .object({
          type: z.string(),
          habit: z.string(),
          date: z.optional(z.string()),
          to: z.optional(z.string()),
          count: z.optional(z.number()),
          on: z.optional(z.boolean()),
        })
        .parse(body);

      if (change.type === "reschedule" && change.to !== undefined) portage.startDate = change.to;

      if (change.type === "check" && change.date !== undefined)
        counts[change.date] = {
          ...counts[change.date],
          [change.habit]: change.on === true ? (change.count ?? 1) : 0,
        };
    },
  });

  return api;
}

const renderOneOff = async (startDate = daysAgo(3)) => {
  const { writes } = oneOffApi(startDate);
  await renderRouter(APP_DIR, { initialUrl: "/" });
  await screen.findByText("Portage");

  return writes;
};

describe("Today with One-offs", () => {
  it("lists an overdue One-off above the time-sorted Habits, marked Overdue with its due day", async () => {
    await renderOneOff();

    const names = screen.getAllByText(/^(Portage|Read)$/).map((name) => name.children.at(0));

    expect(names).toEqual(["Portage", "Read"]);
    expect(screen.getByText("Overdue")).toBeOnTheScreen();

    const weekday = new Date(`${daysAgo(3)}T12:00`).toLocaleDateString("en-US", {
      weekday: "short",
    });

    expect(screen.getByLabelText(`Due ${weekday}`)).toBeOnTheScreen();
  });

  it("records Done on the day it is tapped and folds the One-off into Done today", async () => {
    const writes = await renderOneOff();

    await userEvent.press(screen.getByRole("checkbox", { name: "Portage done today" }));

    await waitFor(() =>
      expect(writes.at(-1)?.body).toEqual(
        expect.objectContaining({ type: "check", habit: "portage", date: TODAY, count: 1 }),
      ),
    );
    expect(await screen.findByRole("button", { name: "Done today (2)" })).toBeOnTheScreen();
    expect(screen.queryByText("Overdue")).not.toBeOnTheScreen();
  });

  it("records Not done on its due date and folds the One-off into Done today", async () => {
    const writes = await renderOneOff();

    await userEvent.press(screen.getByRole("checkbox", { name: "Portage not done today" }));

    await waitFor(() =>
      expect(writes.at(-1)?.body).toEqual(
        expect.objectContaining({ type: "check", habit: "portage", date: daysAgo(3), count: -1 }),
      ),
    );
    await userEvent.press(await screen.findByRole("button", { name: "Done today (2)" }));
    expect(screen.getByRole("checkbox", { name: "Portage not done today" })).toBeChecked();
    expect(screen.queryByText("Overdue")).not.toBeOnTheScreen();
  });

  it("undoes a Not done, and the One-off is overdue again", async () => {
    const writes = await renderOneOff();

    await userEvent.press(screen.getByRole("checkbox", { name: "Portage not done today" }));
    await userEvent.press(await screen.findByRole("button", { name: "Done today (2)" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Portage not done today" }));

    await waitFor(() =>
      expect(writes.at(-1)?.body).toEqual(
        expect.objectContaining({ type: "check", habit: "portage", date: daysAgo(3), on: false }),
      ),
    );
    expect(await screen.findByText("Overdue")).toBeOnTheScreen();
  });

  it("clears Done today when an overdue One-off is marked Not done instead", async () => {
    const writes = await renderOneOff();

    await userEvent.press(screen.getByRole("checkbox", { name: "Portage done today" }));
    await userEvent.press(await screen.findByRole("button", { name: "Done today (2)" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Portage not done today" }));

    await waitFor(() =>
      expect(writes.slice(-2).map(({ body }) => body)).toEqual([
        expect.objectContaining({ habit: "portage", date: TODAY, on: false }),
        expect.objectContaining({ habit: "portage", date: daysAgo(3), count: -1 }),
      ]),
    );
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Portage not done today" })).toBeChecked(),
    );
    expect(screen.getByRole("checkbox", { name: "Portage done today" })).not.toBeChecked();
  });

  it("reschedules a One-off with a cause, and it leaves Today until its new date", async () => {
    const writes = await renderOneOff();

    await userEvent.press(screen.getByRole("button", { name: "Reschedule Portage" }));
    expect(screen.getByLabelText(`New date: ${TOMORROW}`)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("radio", { name: "Put it off" }));
    await userEvent.paste(screen.getByLabelText("Note"), "Rain all day");
    await userEvent.press(screen.getByRole("button", { name: "Reschedule" }));

    await waitFor(() =>
      expect(writes.at(-1)?.body).toEqual({
        type: "reschedule",
        habit: "portage",
        to: TOMORROW,
        cause: "avoidance",
        note: "Rain all day",
      }),
    );
    await waitFor(() => expect(screen.queryByText("Portage")).not.toBeOnTheScreen());
    expect(screen.queryByRole("dialog")).not.toBeOnTheScreen();
  });

  it("offers Reschedule only while a One-off waits for an answer", async () => {
    await renderOneOff(TODAY);

    expect(screen.queryByText("Overdue")).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Reschedule Portage" })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("checkbox", { name: "Portage done today" }));
    await userEvent.press(await screen.findByRole("button", { name: "Done today (2)" }));

    expect(screen.queryByRole("button", { name: "Reschedule Portage" })).not.toBeOnTheScreen();
  });

  it("keeps the sheet open offline and says Rescheduling needs a connection", async () => {
    await renderOneOff();
    await act(() => onlineManager.setOnline(false));

    await userEvent.press(screen.getByRole("button", { name: "Reschedule Portage" }));
    await userEvent.press(screen.getByRole("radio", { name: "Put it off" }));

    expect(screen.getByText("Rescheduling needs a connection.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Reschedule" })).toBeDisabled();
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeOnTheScreen();
    await act(() => onlineManager.setOnline(true));
  });
});

// Celebrations are decoration, hidden from screen readers.
const sprout = () => screen.queryByTestId("sprout", { includeHiddenElements: true });

const tick = () => screen.queryByTestId("tick", { includeHiddenElements: true });

// The first draw picks the size and the second the drawing: under 1/3 is a big one, and under 1/2 the sprout.
const drawBigSprout = () => jest.spyOn(Math, "random").mockReturnValue(0);

const drawMini = () => jest.spyOn(Math, "random").mockReturnValue(0.9);

describe("Today with an Opt-out Habit", () => {
  it("shows an untimed Opt-out Habit as planned, with Skip, until the day ends", async () => {
    fakeApi({
      ...todayRoutes({}),
      "/api/habits": () => ({
        habits: [habit({ id: "boat", name: "Dragon boat", optOutFrom: TODAY })],
        counts: {},
        durations: {},
      }),
    });
    await renderRouter(APP_DIR, { initialUrl: "/" });

    expect(await screen.findByText("Planned: counts unless skipped")).toBeOnTheScreen();
    expect(screen.getByRole("checkbox", { name: "Skip Dragon boat today" })).toBeOnTheScreen();
  });
});

describe("Today", () => {
  it("draws a big sprout over the Check-in card after a new Check-in, and not after an edit", async () => {
    drawBigSprout();
    await renderToday();

    expect(sprout()).not.toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Cloud, upper half" }));
    expect(
      within(
        screen.getByTestId("celebration on check-in", { includeHiddenElements: true }),
      ).getByTestId("sprout", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    await waitFor(() => expect(sprout()).not.toBeOnTheScreen(), { timeout: 3000 });

    await userEvent.press(screen.getByRole("button", { name: "Rain, lower half" }));
    expect(sprout()).not.toBeOnTheScreen();
  });

  it("draws the mini tick on the Check-in card when the draw misses the big odds", async () => {
    drawMini();
    await renderToday();

    await userEvent.press(screen.getByRole("button", { name: "Cloud, upper half" }));

    expect(tick()).toBeOnTheScreen();
    expect(sprout()).not.toBeOnTheScreen();
  });

  it("keeps the details editor tappable while the celebration plays", async () => {
    drawBigSprout();
    await renderToday();

    await userEvent.press(screen.getByRole("button", { name: "Cloud, upper half" }));

    expect(
      screen.getByTestId("celebration on check-in", { includeHiddenElements: true }),
    ).toHaveProp("pointerEvents", "none");
    await userEvent.press(screen.getByRole("button", { name: "Save details" }));
    expect(screen.getByText("Saved.")).toBeOnTheScreen();
  });

  it("buzzes a success haptic on Android with a big celebration", async () => {
    jest.mocked(notificationAsync).mockClear();
    jest.replaceProperty(Platform, "OS", "android");
    drawBigSprout();
    await renderToday();

    await userEvent.press(screen.getByRole("button", { name: "Cloud, upper half" }));

    expect(notificationAsync).toHaveBeenCalledWith(NotificationFeedbackType.Success);
  });

  it("keeps the mini celebration silent on Android", async () => {
    jest.mocked(notificationAsync).mockClear();
    jest.replaceProperty(Platform, "OS", "android");
    drawMini();
    await renderToday();

    await userEvent.press(screen.getByRole("button", { name: "Cloud, upper half" }));

    expect(notificationAsync).not.toHaveBeenCalled();
  });

  it("skips the haptic off Android", async () => {
    jest.mocked(notificationAsync).mockClear();
    drawBigSprout();
    await renderToday();

    await userEvent.press(screen.getByRole("button", { name: "Cloud, upper half" }));

    expect(notificationAsync).not.toHaveBeenCalled();
  });

  it("folds the Habits done today under the due ones, and links to all Habits", async () => {
    await renderToday();

    expect(screen.queryByText("Walk")).not.toBeOnTheScreen();
    expect(screen.queryByText("Snack")).not.toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Done today (1)" }));

    const names = screen.getAllByText(/^(Walk|Read)$/).map((name) => name.children.at(0));

    expect(names).toEqual(["Read", "Walk"]);
    await userEvent.press(screen.getByRole("link", { name: "All habits" }));
    expect(screen).toHavePathname("/habits");
  });

  it("opens a due Habit from its name", async () => {
    await renderToday();

    await userEvent.press(screen.getByRole("link", { name: "Open Read" }));
    expect(screen).toHavePathname("/habit/read");
  });

  it("shows each due Habit's time of day, earliest first", async () => {
    fakeApi(
      todayRoutes({
        habits: [
          habit({ id: "read", name: "Read", usualWhen: "22:00" }),
          habit({ id: "stretch", name: "Stretch", alarm: { time: "07:15", kind: "alarm" } }),
        ],
      }),
    );
    await renderRouter(APP_DIR, { initialUrl: "/" });
    await screen.findByText("Read");

    const names = screen.getAllByText(/^(Stretch|Read)$/).map((name) => name.children.at(0));

    expect(names).toEqual(["Stretch", "Read"]);
    expect(screen.getByLabelText("At 7:15 AM")).toBeOnTheScreen();
    expect(screen.getByLabelText("At 10:00 PM")).toBeOnTheScreen();
  });

  it("skips a Habit with one tap, then saves the cause picked", async () => {
    const writes = await renderToday();

    await userEvent.press(screen.getByRole("checkbox", { name: "Skip Read today" }));

    await waitFor(() =>
      expect(writes.at(-1)?.body).toEqual({
        type: "check",
        date: TODAY,
        habit: "read",
        on: true,
        count: -1,
      }),
    );
    await userEvent.press(screen.getByRole("button", { name: "Add note" }));
    await userEvent.paste(screen.getByLabelText("Note"), " tired ");
    await userEvent.press(screen.getByRole("button", { name: "Put it off" }));

    await waitFor(() =>
      expect(writes.at(-1)?.body).toEqual({
        type: "check",
        date: TODAY,
        habit: "read",
        on: true,
        count: -1,
        cause: "avoidance",
        note: "tired",
      }),
    );
    expect(screen.queryByText("Skipped Read")).not.toBeOnTheScreen();
  });

  it("keeps a Habit skipped when the cause is dismissed", async () => {
    const writes = await renderToday();

    await userEvent.press(screen.getByRole("checkbox", { name: "Skip Read today" }));
    await userEvent.press(await screen.findByRole("button", { name: "Not now" }));

    expect(screen.queryByText("Skipped Read")).not.toBeOnTheScreen();
    expect(writes.map(({ body }) => body)).toEqual([
      { type: "check", date: TODAY, habit: "read", on: true, count: -1 },
    ]);
    await userEvent.press(await screen.findByRole("button", { name: "Done today (2)" }));
    expect(screen.getByRole("checkbox", { name: "Skip Read today" })).toBeChecked();
  });

  it("types a count for a counted Habit", async () => {
    const { writes } = fakeApi(
      todayRoutes({ habits: [habit({ id: "water", name: "Water", record: "count" })] }),
    );

    await renderRouter(APP_DIR, { initialUrl: "/" });

    const field = await screen.findByLabelText("Water count today");
    await userEvent.paste(field, "4");
    await fireEvent(field, "submitEditing");

    await waitFor(() =>
      expect(writes.at(-1)?.body).toEqual(
        expect.objectContaining({ type: "check", habit: "water", count: 4 }),
      ),
    );
  });

  it("types minutes for a timed Habit as a new Duration entry", async () => {
    const { writes } = fakeApi(
      todayRoutes({ habits: [timedHabit({ id: "sit", name: "Sit", targetMinutes: 20 })] }),
    );

    await renderRouter(APP_DIR, { initialUrl: "/" });

    const field = await screen.findByLabelText("Sit minutes today");
    await userEvent.paste(field, "15");
    await fireEvent(field, "submitEditing");

    await waitFor(() =>
      expect(writes.at(-1)?.body).toEqual(
        expect.objectContaining({ type: "add-duration", habit: "sit", date: TODAY, minutes: 15 }),
      ),
    );
  });

  it("says so when no Habit is due", async () => {
    fakeApi(todayRoutes({ habits: [] }));
    await renderRouter(APP_DIR, { initialUrl: "/" });

    expect(await screen.findByText("Nothing due today.")).toBeOnTheScreen();
  });

  it("says Habits failed to load and still links to all Habits", async () => {
    fakeApi({
      ...todayRoutes({}),
      "/api/habits": () => {
        throw new Error("offline");
      },
    });
    await renderRouter(APP_DIR, { initialUrl: "/" });

    expect(await screen.findByText("Couldn't load Habits.")).toBeOnTheScreen();
    expect(screen.getByText("All habits")).toBeOnTheScreen();
  });

  it("shows the Health plan card when the latest Check-in is in Storm", async () => {
    await renderToday("/", "Storm");

    const card = await screen.findByLabelText("Health plan");

    expect(within(card).getByText("Call the clinic.")).toBeOnTheScreen();
    await userEvent.press(within(card).getByRole("link", { name: "Open the Health plan" }));
    expect(screen).toHavePathname("/health-plan");
  });

  it("hides the Health plan card outside Storm", async () => {
    await renderToday();

    expect(screen.queryByLabelText("Health plan")).not.toBeOnTheScreen();
  });

  it("titles the screen with the date and shows the Connections for today and the plan entry", async () => {
    await renderToday();

    expect(
      screen.getByText(
        new Date().toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: TIME_ZONE,
        }),
      ),
    ).toBeOnTheScreen();

    expect(screen.getByLabelText("Connections for today")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Plan the day" })).toBeOnTheScreen();
  });

  it("shows the next blocks of a saved plan", async () => {
    routeQueryClient().setQueryData(savedPlanQuery.queryKey, {
      day: "2999-01-01",
      blocks: [{ start: 600, end: 660, tasks: ["Taxes"] }],
    });
    await renderToday();

    expect(screen.getByText("Taxes")).toBeOnTheScreen();
  });

  it("refetches every section on pull to refresh", async () => {
    await renderToday();
    jest.mocked(apiFetch).mockClear();

    const refreshControl: unknown = screen.getByTestId("today-scroll").props["refreshControl"];

    if (!isValidElement<RefreshControlProps>(refreshControl))
      throw new Error("Today has no pull to refresh");
    await act(() => refreshControl.props.onRefresh?.());

    const paths = jest
      .mocked(apiFetch)
      .mock.calls.map(([path]) => new URL(path, "https://journal.test").pathname);

    expect(paths.toSorted((a, b) => a.localeCompare(b))).toEqual([
      "/api/calendar-links",
      "/api/check-ins",
      "/api/circles",
      "/api/connections",
      "/api/habits",
      "/api/health-plan",
      "/api/parts",
      "/api/streaks",
    ]);
  });

  it("saves a Check-in, a Habit check and a Reached out made offline after reconnecting", async () => {
    drawBigSprout();
    const writes = await renderToday();
    await act(() => onlineManager.setOnline(false));

    expect(screen.getByText("Offline")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Storm, lower half" }));
    expect(sprout()).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("checkbox", { name: "Read done today" }));
    await userEvent.press(screen.getByRole("button", { name: "Reached out" }));
    await userEvent.press(screen.getByRole("button", { name: "Log" }));

    await userEvent.press(await screen.findByRole("button", { name: "Done today (2)" }));
    expect(screen.getByRole("checkbox", { name: "Read done today" })).toBeChecked();
    expect(await screen.findByLabelText("Health plan")).toBeOnTheScreen();
    expect(writes).toEqual([]);

    await act(() => onlineManager.setOnline(true));

    await waitFor(() =>
      expect(writes.map(({ path, method }) => `${method} ${path}`)).toEqual([
        "POST /api/check-ins",
        "POST /api/habits",
        "POST /api/interactions",
      ]),
    );
  });

  it("marks the zone from ?zone and drops the param", async () => {
    await renderToday("/?zone=Storm");

    await waitFor(() => expect(screen).toHaveSearchParams({}));
    expect(CheckInCard).toHaveBeenLastCalledWith(
      expect.objectContaining({ zone: "Storm" }),
      undefined,
    );
  });

  it("opens the log from ?log, and back returns to Today", async () => {
    fakeApi(todayRoutes({}));
    await renderRouter(APP_DIR, { initialUrl: "/?log" });

    await waitFor(() => expect(screen).toHavePathname("/log"));
    expect(screen.getAllByLabelText("Log something").at(-1)).toHaveProp("autoFocus", true);

    await userEvent.press(screen.getByRole("button", { name: "Close" }));

    expect(screen).toHavePathname("/");
    await waitFor(() => expect(screen).toHaveSearchParams({}));
  });

  it('logs "What were you doing?" at once and shows the Receipt in the Log box', async () => {
    const writes = await renderToday();

    await userEvent.press(screen.getByRole("button", { name: "Sun, upper half" }));
    await userEvent.press(
      within(screen.getByLabelText("What were you doing?")).getByRole("button", { name: "Other" }),
    );
    await userEvent.paste(
      screen.getByPlaceholderText("walked 20 min, read a book"),
      "walked 20 min",
    );
    await userEvent.press(screen.getByRole("button", { name: "Save details" }));

    expect(mockDraftLog).toHaveBeenCalledWith("walked 20 min");
    expect(await screen.findByText("Logged Walk.")).toBeOnTheScreen();
    expect(screen).toHavePathname("/");
    expect(writes).toContainEqual({
      path: "/api/log/entries",
      method: "POST",
      body: { text: "walked 20 min", log: [{ habit: "walk", date: TODAY }] },
    });
  });

  it("saves the details but drafts no log while offline", async () => {
    mockDraftLog.mockClear();
    await renderToday();
    await act(() => onlineManager.setOnline(false));

    await userEvent.press(screen.getByRole("button", { name: "Sun, upper half" }));
    await userEvent.press(
      within(screen.getByLabelText("What were you doing?")).getByRole("button", { name: "Other" }),
    );
    await userEvent.paste(
      screen.getByPlaceholderText("walked 20 min, read a book"),
      "walked 20 min",
    );
    await userEvent.press(screen.getByRole("button", { name: "Save details" }));

    expect(mockDraftLog).not.toHaveBeenCalled();
    expect(screen).toHavePathname("/");
  });

  it("opens the plan from Plan the day", async () => {
    await renderToday();

    await userEvent.press(screen.getByRole("button", { name: "Plan the day" }));

    await waitFor(() => expect(screen).toHavePathname("/plan"));
  });

  it("takes the first tap on Save details while the keyboard is open", async () => {
    await renderToday();

    await userEvent.press(screen.getByRole("button", { name: "Sun, upper half" }));

    expect(scrollableAround(screen.getByRole("button", { name: "Save details" }))).toHaveProp(
      "keyboardShouldPersistTaps",
      "handled",
    );
  });

  it("lifts the composer by the header height too, since the keyboard view sits below the header", async () => {
    await renderToday();

    const avoider = screen.getByTestId("today-keyboard-avoider");

    const keyboard = {
      duration: 0,
      endCoordinates: { screenX: 0, screenY: 600, width: 390, height: 300 },
    };

    // The keyboard's top meets the view's measured bottom, so any padding left comes from the header offset.
    await fireEvent(avoider, "layout", {
      persist: jest.fn(),
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 600 } },
    });
    await act(() => {
      DeviceEventEmitter.emit("keyboardWillShow", keyboard);
      DeviceEventEmitter.emit("keyboardDidShow", keyboard);
    });

    expect(avoider).not.toHaveStyle({ paddingBottom: 0 });
  });

  it("logs a clean draft at once when the composer sends", async () => {
    await renderToday();

    await userEvent.paste(screen.getByLabelText("Log something"), "walked");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Logged Walk.")).toBeOnTheScreen();
    expect(screen).toHavePathname("/");
  });

  it("puts Check-in and Habits beside Connections and Plan from 768px", async () => {
    mockWindow.width = 1024;
    await renderToday();

    const left = screen.getByTestId("today-left");
    const right = screen.getByTestId("today-right");

    expect(within(left).getByText("Read")).toBeOnTheScreen();
    expect(within(right).getByLabelText("Connections for today")).toBeOnTheScreen();
    expect(within(right).queryByText("Read")).not.toBeOnTheScreen();
  });
});

const guessPaths = () =>
  jest
    .mocked(apiFetch)
    .mock.calls.map(([path]) => new URL(path, "https://journal.test"))
    .filter((url) => url.searchParams.has("at"));

const patchesIn = (writes: Awaited<ReturnType<typeof renderToday>>) =>
  writes.filter(({ method }) => method === "PATCH").map(({ body }) => body);

// The server refuses the first Check-in, then saves the next try.
async function renderRefused() {
  let refusals = 1;

  const { writes } = fakeApi({
    ...todayRoutes({}),
    "POST /api/check-ins": () => {
      if (refusals-- > 0) throw new ApiError(400, { error: "invalid check-in" });

      return savedCheckIn();
    },
  });

  await renderRouter(APP_DIR, { initialUrl: "/" });
  await screen.findByText("Read");
  await userEvent.press(screen.getByRole("button", { name: "Storm, lower half" }));

  expect(await screen.findByText(/^Couldn't save the .* Storm Check-in$/)).toBeOnTheScreen();

  return writes;
}

describe("Today's failed saves", () => {
  it("shows a refused Check-in and saves it on Retry", async () => {
    const writes = await renderRefused();

    await userEvent.press(screen.getByRole("button", { name: /^Retry: Couldn't save/ }));

    await waitFor(() => expect(screen.queryByTestId("failed-captures")).not.toBeOnTheScreen());
    expect(writes.filter(({ method }) => method === "POST")).toHaveLength(2);
  });

  it("drops a refused Check-in on Dismiss", async () => {
    const writes = await renderRefused();

    await userEvent.press(screen.getByRole("button", { name: /^Dismiss: Couldn't save/ }));

    await waitFor(() => expect(screen.queryByTestId("failed-captures")).not.toBeOnTheScreen());
    expect(writes.filter(({ method }) => method === "POST")).toHaveLength(1);
  });
});

describe("Today's Check-in position", () => {
  const OFFICE = { latitude: 43.65, longitude: -79.38 };

  beforeEach(() => {
    jest.mocked(apiFetch).mockClear();
    jest.mocked(currentPosition).mockClear();
  });

  it("saves the position on a new Check-in and guesses the place near it", async () => {
    mockLocation.position = OFFICE;

    const { writes } = fakeApi({
      ...todayRoutes({}),
      "/api/check-ins?at": () => ({ place: "Office" }),
    });

    await renderRouter(APP_DIR, { initialUrl: "/" });
    await screen.findByText("Read");

    await userEvent.press(screen.getByRole("button", { name: "Cloud, upper half" }));

    await waitFor(() => expect(patchesIn(writes)).toContainEqual(expect.objectContaining(OFFICE)));
    expect(patchesIn(writes)[0]).toHaveProperty("fixedAt");
    await waitFor(() => expect(guessPaths()).toHaveLength(1));
    expect(Object.fromEntries(guessPaths()[0]?.searchParams ?? [])).toMatchObject({
      latitude: "43.65",
      longitude: "-79.38",
    });

    await userEvent.press(screen.getByRole("button", { name: "Save details" }));

    await waitFor(() =>
      expect(patchesIn(writes)).toContainEqual(expect.objectContaining({ place: "Office" })),
    );
  });

  it("saves the position on a Check-in from the widget's ?zone link", async () => {
    mockLocation.position = OFFICE;
    const writes = await renderToday("/?zone=Storm");

    await userEvent.press(screen.getByRole("button", { name: "Storm, lower half" }));

    await waitFor(() => expect(patchesIn(writes)).toContainEqual(expect.objectContaining(OFFICE)));
  });

  it("saves the Check-in alone and guesses from the time when no position comes", async () => {
    const writes = await renderToday();

    await userEvent.press(screen.getByRole("button", { name: "Cloud, upper half" }));

    await waitFor(() => expect(guessPaths()).toHaveLength(1));
    expect(guessPaths()[0]?.searchParams.has("latitude")).toBe(false);
    expect(writes.map(({ method }) => method)).toEqual(["POST"]);
  });

  it("queues the position offline and skips the guess", async () => {
    mockLocation.position = OFFICE;
    const writes = await renderToday();
    await act(() => onlineManager.setOnline(false));

    await userEvent.press(screen.getByRole("button", { name: "Cloud, upper half" }));
    await waitFor(() => expect(currentPosition).toHaveBeenCalled());

    await act(() => onlineManager.setOnline(true));

    await waitFor(() => expect(writes.map(({ method }) => method)).toEqual(["POST", "PATCH"]));
    expect(guessPaths()).toEqual([]);
  });

  it("reads no position for a Check-in set more than an hour back", async () => {
    mockLocation.position = OFFICE;
    await renderToday();

    const card = jest.mocked(CheckInCard).mock.lastCall?.[0];

    await act(() => card?.onCheckIn(4, "2026-01-05T15:00:00.000Z"));

    expect(currentPosition).not.toHaveBeenCalled();
  });
});
