import { chartData, isoAt, shiftDay, torontoDay, zoneOf, type CheckIn } from "@/core";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

import { View, type HostInstance } from "react-native";

import { MONTH } from "@/components/check-in-panels";
import { apiFetch } from "@/lib/api/api-fetch";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import {
  preloadRoutes,
  resetRouteMocks,
  setOnline,
  setRouteQueryClient,
} from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, type ApiRequest } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn } from "../../jest/fixtures";

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

const mockWindow = { width: 390 };

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWindow.width, height: 900, scale: 1, fontScale: 1 }),
}));

// App Jest runs in the machine's zone (UTC in CI), so build Days on Toronto's calendar.
const TODAY = torontoDay(new Date());

const dayAgo = (days: number) => shiftDay(TODAY, -days);

const noonAgo = (days: number) => isoAt(dayAgo(days), 12 * 60);

const checkInDaysAgo = (id: number, days: number, extra: Partial<CheckIn> = {}) =>
  checkIn({ id, checkedInAt: noonAgo(days), zone: zoneOf(7), score: 7, ...extra });

const night = (days: number) => ({
  date: dayAgo(days),
  sleepStart: `${dayAgo(days + 1)}T23:00:00`,
  sleepEnd: isoAt(dayAgo(days), 7 * 60),
  durationMin: 420,
  sleepScore: null,
});

const activityDay = (days: number) => ({
  date: dayAgo(days),
  steps: 8000,
  moderateMin: null,
  vigorousMin: null,
  restingHr: 60,
  avgStress: null,
});

const CHECK_INS = [
  checkInDaysAgo(1, 0, { note: "Good walk" }),
  checkInDaysAgo(2, 3, { score: 2, zone: "Storm" }),
  checkInDaysAgo(3, 20, { place: "Gym" }),
];

const checkInRoutes = (found: CheckIn[] = []) => ({
  // SAFETY: an edit is the only PATCH these tests make, and its body is a partial CheckIn.
  "PATCH /api/check-ins": ({ body }: ApiRequest) => ({
    ...CHECK_INS[0],
    ...(body as Partial<CheckIn>),
  }),
  "/api/check-ins": () => ({ checkIns: CHECK_INS }),
  "/api/sleep": () => ({ sleep: [night(1), night(2)] }),
  "/api/activity": () => ({ activity: [activityDay(1)] }),
  "/api/search": () => ({ checkIns: found }),
});

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

async function openCheckIns() {
  await renderRouter(APP_DIR, { initialUrl: "/check-ins" });
  await screen.findByText("Good walk");
}

beforeEach(() => {
  mockWindow.width = 390;
  setRouteQueryClient(createQueryClient());
  jest.mocked(apiFetch).mockReset();
  fakeApi(checkInRoutes());
});

afterEach(resetRouteMocks);

it("lists the Check-ins of the last month, the newest two weeks first", async () => {
  await openCheckIns();

  expect(screen.getByText("Check-ins (2 of 3)")).toBeOnTheScreen();
  expect(screen.getByText("Storm (2/8)")).toBeOnTheScreen();
  expect(screen.queryByText("Gym")).not.toBeOnTheScreen();
});

it("shows older Check-ins on request", async () => {
  await openCheckIns();

  await userEvent.press(screen.getByRole("button", { name: "Show older" }));

  expect(screen.getByText("Check-ins (3)")).toBeOnTheScreen();
});

it("a shorter range drops older Check-ins", async () => {
  await openCheckIns();

  await userEvent.press(screen.getByRole("radio", { name: "Day" }));

  expect(screen.getByText("Check-ins (1)")).toBeOnTheScreen();
});

it("steps back a period and not past today", async () => {
  await openCheckIns();
  await userEvent.press(screen.getByRole("radio", { name: "Day" }));

  expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
  await userEvent.press(screen.getByRole("button", { name: "Previous day" }));

  expect(screen.getByText("Check-ins (0)")).toBeOnTheScreen();
});

it("summarizes the sleep and activity Signals for the range", async () => {
  await openCheckIns();

  expect(await screen.findByText("Sleep, month (2 nights)")).toBeOnTheScreen();
  expect(screen.getByText("Activity, month (1 days)")).toBeOnTheScreen();
});

const shortNight = (days: number) => ({ ...night(days), durationMin: 300 });

const longNight = (days: number) => ({ ...night(days), durationMin: 480 });

const sleepRoutes = (checkIns: CheckIn[]) => ({
  ...checkInRoutes(),
  "/api/check-ins": () => ({ checkIns }),
  "/api/sleep": () => ({
    sleep: [shortNight(0), shortNight(1), longNight(2), longNight(3), longNight(4)],
  }),
});

describe("Sleep and the next day", () => {
  const afterNights = [
    checkInDaysAgo(1, 0, { note: "Good walk", score: 2, zone: "Storm" }),
    checkInDaysAgo(2, 1, { score: 3, zone: "Rain" }),
    checkInDaysAgo(3, 2),
    checkInDaysAgo(4, 3, { score: 2, zone: "Storm" }),
    checkInDaysAgo(5, 4),
  ];

  it("counts Storm or Rain Check-ins after short and long nights", async () => {
    fakeApi(sleepRoutes(afterNights));
    await openCheckIns();

    expect(
      await screen.findByText("Sleep and the next day, month (5 Check-ins)"),
    ).toBeOnTheScreen();
    expect(screen.getByText("Under 6h Storm or Rain on 2 of 2 Check-ins")).toBeOnTheScreen();
    expect(screen.getByText("7h or more Storm or Rain on 1 of 3 Check-ins")).toBeOnTheScreen();
  });

  it("is absent for the Day range", async () => {
    fakeApi(sleepRoutes(afterNights));
    await openCheckIns();
    await screen.findByText("Sleep and the next day", { exact: false });

    await userEvent.press(screen.getByRole("radio", { name: "Day" }));

    expect(screen.queryByText("Sleep and the next day", { exact: false })).not.toBeOnTheScreen();
  });

  it("is absent with only one bucket to show", async () => {
    fakeApi(sleepRoutes(afterNights.filter((c) => c.id !== 2)));
    await openCheckIns();

    expect(await screen.findByText("Sleep, month (5 nights)")).toBeOnTheScreen();
    expect(screen.queryByText("Sleep and the next day", { exact: false })).not.toBeOnTheScreen();
  });
});

it("edits a detail in place", async () => {
  await openCheckIns();

  await userEvent.press(screen.getByText("Good walk"));
  await userEvent.paste(screen.getByLabelText("Anything else? (optional)"), "Long walk");
  await userEvent.press(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/check-ins",
      {
        method: "PATCH",
        body: { id: 1, inControl: null, parts: [], note: "Long walk" },
      },
      expect.anything(),
    ),
  );
});

it("edits the time and zone together", async () => {
  await openCheckIns();

  await userEvent.press(screen.getByText("Storm (2/8)"));
  await userEvent.press(screen.getByRole("button", { name: "Rain, upper half" }));
  await userEvent.press(screen.getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/check-ins",
      {
        method: "PATCH",
        body: { id: 2, score: 4 },
      },
      expect.anything(),
    ),
  );
});

it("adds the missing details and cancels without saving", async () => {
  await openCheckIns();

  await userEvent.press(screen.getAllByRole("button", { name: "Add details" })[0]!);
  expect(screen.getByText("Where were you?")).toBeOnTheScreen();
  await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.queryByText("Where were you?")).not.toBeOnTheScreen();
});

it("offers feelings only once both axes are picked", async () => {
  await openCheckIns();

  await userEvent.press(screen.getAllByRole("button", { name: "Add details" })[0]!);
  expect(screen.queryByRole("button", { name: "Happy" })).not.toBeOnTheScreen();
  await userEvent.press(screen.getByRole("radio", { name: "Pleasant" }));
  expect(screen.queryByRole("button", { name: "Happy" })).not.toBeOnTheScreen();
  await userEvent.press(screen.getByRole("radio", { name: "High" }));

  expect(screen.getByRole("button", { name: "Happy" })).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Calm" })).not.toBeOnTheScreen();
});

it("opens a saved Check-in on its How I felt quadrant", async () => {
  const felt = checkInDaysAgo(1, 0, {
    note: "Good walk",
    pleasantness: "Pleasant",
    feelingEnergy: "High",
  });

  fakeApi({ ...checkInRoutes(), "/api/check-ins": () => ({ checkIns: [felt] }) });
  await openCheckIns();

  await userEvent.press(screen.getAllByRole("button", { name: "Add details" })[0]!);

  expect(screen.getByRole("radio", { name: "Pleasant" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Happy" })).toBeOnTheScreen();
});

it("fills the picked Pleasantness and Energy with the selected mint", async () => {
  await openCheckIns();

  await userEvent.press(screen.getAllByRole("button", { name: "Add details" })[0]!);
  await userEvent.press(screen.getByRole("radio", { name: "Pleasant" }));

  expect(screen.getByRole("radio", { name: "Pleasant" })).toHaveProp(
    "className",
    expect.stringContaining("bg-primary"),
  );
  expect(screen.getByRole("radio", { name: "Unpleasant" })).not.toHaveProp(
    "className",
    expect.stringContaining("bg-primary"),
  );
});

it("searches Check-ins online", async () => {
  fakeApi(checkInRoutes([checkInDaysAgo(9, 40, { note: "Old walk" })]));
  await openCheckIns();

  await userEvent.paste(screen.getByLabelText("Search Check-ins"), "walk");
  await userEvent.press(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("Check-ins found (1)")).toBeOnTheScreen();
  expect(apiFetch).toHaveBeenCalledWith("/api/search?q=walk", expect.anything(), expect.anything());
});

it("disables search offline", async () => {
  setOnline(false);
  await openCheckIns();

  expect(screen.getByText("Search needs a connection.")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
});

it("puts the list beside the chart on a wide screen", async () => {
  mockWindow.width = 1024;
  await openCheckIns();

  expect(screen.getByText("Check-ins (2 of 3)")).toBeOnTheScreen();
  expect(screen.getByRole("radio", { name: "Month" })).toBeOnTheScreen();
});

it("ends the range today when All is picked", async () => {
  await openCheckIns();

  await userEvent.press(screen.getByRole("radio", { name: "All" }));

  expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
  expect(screen.getByText("Check-ins (2 of 3)")).toBeOnTheScreen();
});

it("scrolls to a Check-in picked on the chart, showing older ones first", async () => {
  const measure = jest.fn((_list: HostInstance, onLayout: (x: number, y: number) => void) => {
    onLayout(0, 120);
  });

  // The host Views are Jest's mock component, whose measureLayout does nothing until a test gives it an answer.
  Object.assign(View.prototype, { measureLayout: measure });
  await openCheckIns();
  await fireEvent(screen.getByText("Good walk"), "layout", {
    nativeEvent: { layout: { x: 0, y: 300, width: 356, height: 900 } },
  });
  await fireEvent(screen.getByTestId("check-in-chart"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 356, height: 200 } },
  });

  // The chart maps the range's first day to x = 48 and its last to width - 8.
  const data = chartData(CHECK_INS, MONTH.days, new Date(isoAt(TODAY)), []);
  const older = data.points.find(({ checkIn: { id } }) => id === 3);
  const x = 48 + (300 * ((older?.x ?? 0) - data.min)) / (data.max - data.min);

  expect(screen.queryByText("Gym")).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId("check-in-chart-touch"), {
    nativeEvent: { locationX: x, locationY: 10 },
  });

  expect(await screen.findByText("Gym")).toBeOnTheScreen();
  await waitFor(() => expect(measure).toHaveBeenCalled());
});

it("opens the Session brief from the header", async () => {
  await openCheckIns();

  await userEvent.press(screen.getByText("Write Session brief"));

  expect(screen).toHavePathname("/session-brief");
});

it("offers New part… on an edit online, and disables it offline", async () => {
  await openCheckIns();

  await userEvent.press(screen.getByText("Good walk"));
  expect(screen.getByRole("button", { name: "New part…" })).toBeEnabled();

  await act(() => setOnline(false));
  expect(screen.getByRole("button", { name: "New part…" })).toBeDisabled();
  expect(screen.getByText("Needs a connection")).toBeOnTheScreen();
});

it("keeps a Part the Parts list no longer offers selected on an edit", async () => {
  const [walk, ...rest] = CHECK_INS;

  const naming = checkIn({
    ...walk,
    inControl: { id: 7, name: "Old critic" },
    parts: [{ id: 8, name: "Gone child" }],
  });

  fakeApi({
    ...checkInRoutes(),
    "/api/check-ins": () => ({ checkIns: [naming, ...rest] }),
    "/api/parts": () => ({ parts: [] }),
  });
  await openCheckIns();
  await userEvent.press(screen.getByText("Good walk"));

  expect(screen.getByRole("button", { name: "Old critic" })).toHaveProp("aria-pressed", true);
  expect(screen.getByRole("button", { name: "Gone child" })).toHaveProp("aria-pressed", true);
});

it("opens a found Check-in on its own Day", async () => {
  fakeApi(checkInRoutes([CHECK_INS[2]!]));
  await openCheckIns();

  await userEvent.paste(screen.getByLabelText("Search Check-ins"), "gym");
  await userEvent.press(screen.getByRole("button", { name: "Search" }));
  await userEvent.press(await screen.findByRole("button", { name: /^Open Check-in, / }));

  expect(screen.getByRole("radio", { name: "Day" })).toBeChecked();
  expect(screen.getByText("Check-ins (1)")).toBeOnTheScreen();
  expect(screen.getByTestId("check-in-3")).toBeOnTheScreen();
});

it("offers Show all when the range has no Check-ins", async () => {
  await openCheckIns();
  await userEvent.press(screen.getByRole("radio", { name: "Day" }));
  await userEvent.press(screen.getByRole("button", { name: "Previous day" }));

  expect(screen.getByText("No Check-ins in this range.")).toBeOnTheScreen();
  await userEvent.press(screen.getAllByRole("button", { name: "Show all" })[0]!);

  expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
  expect(screen.getByText("Good walk")).toBeOnTheScreen();
});

const nothing = () => ({
  ...checkInRoutes(),
  "/api/check-ins": () => ({ checkIns: [] }),
  "/api/sleep": () => ({ sleep: [] }),
});

async function openAll() {
  await renderRouter(APP_DIR, { initialUrl: "/check-ins" });
  await screen.findByText("Check-ins (0)");
  await userEvent.press(screen.getByRole("radio", { name: "All" }));
}

describe("with no Check-ins or sleep at all", () => {
  it("sends the owner to Today to check in", async () => {
    fakeApi(nothing());
    await openAll();

    expect(screen.getByText("No Check-ins or sleep yet.")).toBeOnTheScreen();
    expect(screen.getAllByText("Check in on Today")).toHaveLength(2);
  });
});
