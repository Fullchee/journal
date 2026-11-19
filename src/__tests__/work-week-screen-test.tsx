import { isoWeekOf, shiftDay, torontoDay, weekDays, weekLabel } from "@/core";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { act, renderRouter, screen } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";
import { Linking } from "react-native";

import type { WeeklyNote } from "@/lib/data/work";
import { ApiError } from "@/lib/api/errors";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setRouteQueryClient } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, pendingApi, reply, type ResponseBody } from "../../jest/fake-api";

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

beforeEach(() => {
  setRouteQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
});

afterEach(resetRouteMocks);

const WEEK = isoWeekOf(torontoDay(new Date()));

const [MON = "", , WED = ""] = weekDays(WEEK);

const TICKET_URL = "https://jira.test/browse/DEV-1";

const PR_URL = "https://github.com/acme/app/pull/7";

const entry = (fields: Partial<WeeklyNote["entries"][number]>): WeeklyNote["entries"][number] => ({
  day: MON,
  position: 0,
  parent: null,
  kind: "note",
  text: "",
  ticket: null,
  pr: null,
  done: null,
  ...fields,
});

const NOTE: WeeklyNote = {
  week: WEEK,
  entries: [
    entry({ position: 0, day: null, kind: "task", text: "clean up the epic", done: false }),
    entry({ position: 1, kind: "task", ticket: "DEV-1", text: "Ship the widget", done: true }),
    entry({
      position: 2,
      parent: 1,
      kind: "task",
      done: true,
      ticket: "DEV-1",
      pr: "app#7",
      text: "Add the widget",
    }),
    entry({ position: 3, parent: 2, text: "tests pass" }),
    entry({ position: 4, kind: "task", ticket: "DEV-2", done: false }),
    entry({ position: 5, kind: "blocker", text: "Waiting on Alex to review" }),
    entry({ position: 6, kind: "task", text: "ticked off", done: true }),
    entry({ position: 7, day: WED, kind: "meeting", text: "10:00 All Hands" }),
    entry({ position: 8, day: WED, kind: "review", pr: "app#9", text: "Fix N+1" }),
    entry({ position: 9, day: WED, parent: 99, text: "comment on the epics" }),
    entry({ position: 10, day: WED, kind: "task", ticket: "DEV-3" }),
    entry({ position: 11, kind: "personal", text: "meditated before standup" }),
  ],
  code_reviews: [{ day: MON, pr: "api#3", author: "Sam", title: "Speed up the export" }],
  tickets: [
    { key: "DEV-1", url: TICKET_URL, title: "Widget" },
    { key: "DEV-2", url: "", title: "Plan the next one" },
  ],
  pull_requests: [
    { ref: "app#7", url: PR_URL },
    { ref: "app#9", url: "https://github.com/acme/app/pull/9" },
    { ref: "api#3", url: "https://github.com/acme/api/pull/3" },
  ],
};

const plan = (day: string, hit_rate: number | null) => ({ day, hit_rate, planned_size: 3 });

// Eight scored Plans and one unscored: the trend keeps the latest seven scored ones.
const PLANS = [
  plan(shiftDay(MON, 1), null),
  ...Array.from({ length: 8 }, (_, back) => plan(shiftDay(MON, -back), back === 0 ? 2 / 3 : 1)),
];

function serve({
  notes = [NOTE],
  plans = PLANS,
}: { notes?: ResponseBody; plans?: ResponseBody } = {}) {
  fakeApi({
    [`/api/work/weekly-notes?week=${WEEK}`]: reply({ notes }),
    "/api/work/plans": reply({ plans }),
  });
}

const renderWork = () => renderRouter(APP_DIR, { initialUrl: "/work" });

describe("Work week", () => {
  it("shows the week's typed entries by day, nested, with blockers and open tasks marked", async () => {
    serve();
    await renderWork();

    expect(await screen.findByText("This week")).toBeOnTheScreen();
    expect(screen.getByText(weekLabel(WEEK))).toBeOnTheScreen();
    expect(screen.getByText("clean up the epic")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "DEV-1: Ship the widget" })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "app#7: Add the widget" })).toBeOnTheScreen();
    expect(screen.getByText("tests pass")).toBeOnTheScreen();
    // A bare Ticket bullet shows the Ticket's title.
    expect(screen.getByRole("link", { name: "DEV-2: Plan the next one" })).toBeOnTheScreen();
    expect(screen.getByText("Blocked")).toBeOnTheScreen();
    expect(screen.getAllByText("To do")).toHaveLength(2);
    expect(screen.getAllByText("Done")).toHaveLength(3);
    expect(screen.getByText("Meeting")).toBeOnTheScreen();
    expect(screen.getByText("Review")).toBeOnTheScreen();
    expect(screen.getByText("Code reviews")).toBeOnTheScreen();
    expect(
      screen.getByRole("link", { name: "api#3 · Sam: Speed up the export" }),
    ).toBeOnTheScreen();
    expect(screen.getByText(/comment on the epics/)).toBeOnTheScreen();
    // A Ticket the note names but never titled shows its key alone.
    expect(screen.getByRole("link", { name: "DEV-3: " })).toBeOnTheScreen();
    // Personal lines stay out of the Work week.
    expect(screen.queryByText("meditated before standup")).not.toBeOnTheScreen();
  });

  it("opens a Ticket or PR in the browser, and leaves a row without a link inert", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

    serve();
    await renderWork();
    await userEvent.press(await screen.findByRole("link", { name: "DEV-1: Ship the widget" }));
    await userEvent.press(screen.getByRole("link", { name: "app#7: Add the widget" }));

    expect(open.mock.calls).toEqual([[TICKET_URL], [PR_URL]]);
    expect(screen.getByRole("link", { name: "DEV-2: Plan the next one" })).toBeDisabled();
  });

  it("charts the latest seven scored Plans' Hit rates", async () => {
    serve();
    await renderWork();

    expect(
      await screen.findByText("Aim for 70–85%. Dashed lines mark the band."),
    ).toBeOnTheScreen();
    expect(screen.getAllByText("100%")).toHaveLength(6);
    expect(screen.getByLabelText(/: 67%$/)).toBeOnTheScreen();
  });

  it("says so when nothing is logged or scored yet", async () => {
    serve({ notes: [], plans: [plan(MON, null)] });
    await renderWork();

    expect(await screen.findByText("Nothing logged this week yet.")).toBeOnTheScreen();
    expect(screen.getByText("No scored Plans yet.")).toBeOnTheScreen();
  });

  it("says a week's note with no entries has nothing logged", async () => {
    serve({ notes: [{ ...NOTE, entries: [], code_reviews: [] }] });
    await renderWork();

    expect(await screen.findByText("Nothing logged this week yet.")).toBeOnTheScreen();
  });

  it("shows loading while the API answers", async () => {
    pendingApi();
    await renderWork();

    expect(screen.getAllByText("Loading…")).toHaveLength(2);
  });

  it("says the week is not on this device when offline with no cache", async () => {
    pendingApi();
    await act(() => onlineManager.setOnline(false));
    await renderWork();

    expect(screen.getAllByText("Not on this device yet: open it once while online.")).toHaveLength(
      2,
    );
  });

  it("offers a retry when the API fails", async () => {
    fakeApi({
      [`/api/work/weekly-notes?week=${WEEK}`]: reply(new ApiError(502, null)),
      "/api/work/plans": reply(new ApiError(502, null)),
    });
    await renderWork();

    expect(await screen.findAllByRole("button", { name: "Retry" })).toHaveLength(2);
  });

  it("is linked from the Notes tab", async () => {
    fakeApi({
      "/api/notes/goals": reply({ items: [] }),
      "/api/notes/reflections": reply({ items: [] }),
      "/api/notes/health-records": reply({ items: [] }),
      "/api/habits": reply({ habits: [] }),
    });
    await renderRouter(APP_DIR, { initialUrl: "/notes" });

    expect(screen.getByRole("link", { name: /Work week/ })).toBeOnTheScreen();
  });
});
