import {
  dueDateLabel,
  MISSED,
  monthLabel,
  monthOf,
  shiftDay,
  shiftMonth,
  torontoDay,
  type Counts,
  type Durations,
  type Habit,
  type Skips,
} from "@/core";
import { fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";
import * as z from "zod/mini";

import { apiFetch } from "@/lib/api/api-fetch";
import type { HabitsBody } from "@/lib/data/habits";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setRouteQueryClient } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit, timedHabit } from "../../jest/fixtures";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import {
  calendarCell,
  dayButton,
  findDayButton,
  holdWrites,
  showMonthOf,
} from "../../jest/habit-calendar";
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

beforeEach(() => setRouteQueryClient(createQueryClient()));

afterEach(() => {
  toast.dismiss();
  resetRouteMocks();
});

const TODAY = torontoDay(new Date());

const ago = (days: number) => shiftDay(TODAY, -days);

// Walk started 10 days ago: done each day up to yesterday but 5 days ago (missed) and 3 days ago (an outside Skip).
const COUNTS: Counts = Object.fromEntries(
  Array.from({ length: 10 }, (_, index) => [
    ago(index + 1),
    { walk: index + 1 === 5 ? 0 : 1, snack: 2 },
  ]),
);

const RECENT_COUNTS: Counts = { [ago(3)]: { walk: MISSED } };

const SKIPS: Skips = { [ago(3)]: { walk: { cause: "outside", note: "" } } };

const HABITS: Habit[] = [
  habit({ startDate: ago(10) }),
  habit({ id: "snack", name: "Snack", kind: "bad", record: "count", startDate: ago(1) }),
  habit({ id: "stretch", name: "Stretch" }),
  habit({ id: "stoic", name: "Stoicism", target: { type: "none", count: 0, days: [] } }),
];

const tracker = (): HabitsBody => ({
  habits: HABITS,
  counts: RECENT_COUNTS,
  durations: {},
  skips: SKIPS,
});

function serve() {
  fakeApi({
    "/api/habits": tracker,
    "/api/streaks": () => ({ counts: COUNTS, durations: {}, skips: SKIPS, restPeriods: [] }),
  });
}

// Each listed period ends in how it counted.
const periodRows = () =>
  within(screen.getByLabelText("Periods")).getAllByText(
    /^(Hit|Missed|Still open|Skipped, not counted)$/,
  );

describe("Habit History", () => {
  it("says it is loading while the Streak history is on its way", async () => {
    serve();
    const answer = jest.mocked(apiFetch).getMockImplementation();

    jest
      .mocked(apiFetch)
      .mockImplementation((path, init, schema) =>
        path === "/api/streaks"
          ? Promise.withResolvers<never>().promise
          : (answer?.(path, init, schema) ?? Promise.resolve(undefined)),
      );
    await renderRouter(APP_DIR, { initialUrl: "/habit/walk/history" });

    expect(await screen.findByText("Loading History…")).toBeOnTheScreen();
  });

  it("opens from a Habit on the Habits tab and opens the editor from Edit", async () => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    await userEvent.press(await screen.findByRole("button", { name: /^Walk,/ }));

    expect(screen).toHavePathname("/habit/walk/history");
    expect(await screen.findByText("8 hit · 1 missed · 89%")).toBeOnTheScreen();
    // The miss 5 days ago is a dip: 5 hits, a miss, then 3 more hits.
    expect(screen.getByText("Strength 34%")).toBeOnTheScreen();
    expect(screen.getByLabelText("Last 7 days")).toBeOnTheScreen();
    const skippedDay = dueDateLabel(ago(3));

    expect(screen.getByLabelText(`${skippedDay}: Skipped, not counted`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`${dueDateLabel(TODAY)}: Still open`)).toBeOnTheScreen();
    expect(periodRows()).toHaveLength(11);

    await userEvent.press(screen.getByRole("button", { name: "Edit Walk" }));

    expect(screen).toHavePathname("/habit/walk");
  });

  it("shows the summary at the top of the editor, which opens History", async () => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: "/habit/walk" });

    await userEvent.press(await screen.findByRole("link", { name: "History of Walk" }));

    expect(screen).toHavePathname("/habit/walk/history");
  });

  it("shows no summary on a new Habit", async () => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: "/habit/new" });

    expect(await screen.findByText("New habit")).toBeOnTheScreen();
    expect(screen.queryByRole("link", { name: /^History of/ })).not.toBeOnTheScreen();
  });

  it("shows a bad Habit what it logged, never hit or missed", async () => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: "/habit/snack/history" });

    expect(await screen.findByText("Logged 2 times in 2 days")).toBeOnTheScreen();
    expect(screen.getByText("logged 2 times")).toBeOnTheScreen();
    expect(screen.getByText("not logged")).toBeOnTheScreen();
  });

  it("lists a long History a page at a time", async () => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: "/habit/stretch/history" });

    expect(await screen.findByText("Show older")).toBeOnTheScreen();
    expect(periodRows()).toHaveLength(60);

    await userEvent.press(screen.getByRole("button", { name: "Show older" }));

    expect(periodRows()).toHaveLength(120);
  });

  it("has none for a Reference Habit", async () => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: "/habit/stoic/history" });

    expect(
      await screen.findByText("One-offs and Reference Habits have no History."),
    ).toBeOnTheScreen();
  });

  it("says when the Habit no longer exists", async () => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: "/habit/gone/history" });

    expect(await screen.findByText("This Habit no longer exists.")).toBeOnTheScreen();
  });
});

// A past month always holds whole weeks before today, so its Days sit outside the checks window.
const PAST = monthOf(ago(40));

const THIS_MONTH = monthLabel(monthOf(TODAY));

const pastDay = (day: number) => `${PAST}-${String(day).padStart(2, "0")}`;

const Check = z.object({ date: z.string(), habit: z.string(), on: z.boolean(), count: z.number() });

interface Records {
  counts?: Counts;
  durations?: Durations;
  skips?: Skips;
}

// A server that keeps each check, so a refetch shows it as the real API does.
function serveCalendar(habits: Habit[], { counts = {}, durations = {}, skips = {} }: Records = {}) {
  return fakeApi({
    "/api/habits": () => ({ habits, counts, durations, skips }),
    "/api/streaks": () => ({ counts, durations, skips, restPeriods: [] }),
    "POST /api/habits": ({ body }) => {
      const { date, habit: id, on, count } = Check.parse(body);

      counts[date] = { ...counts[date], [id]: on ? count : 0 };
    },
  }).writes;
}

const entry = (minutes: number) => [{ id: 1, startTime: "07:00", minutes }];

const bodies = (writes: { body: unknown }[]) => writes.map(({ body }) => body);

describe("Back-filling from the month calendar", () => {
  it("opens on today's month and moves back as far as the start month", async () => {
    const start = pastDay(15);

    serveCalendar([habit({ startDate: start })]);
    await renderRouter(APP_DIR, { initialUrl: "/habit/walk/history" });

    expect(await screen.findByText(THIS_MONTH)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();

    await showMonthOf(start);

    expect(screen.getByText(monthLabel(PAST))).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
    const beforeStart = calendarCell(pastDay(14), "Before the start date");

    expect(screen.getByLabelText(beforeStart)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: beforeStart })).not.toBeOnTheScreen();
    expect(dayButton(start, "Not logged")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Next month" }));

    const after = monthLabel(shiftMonth(PAST, 1));

    expect(screen.getByText(after)).toBeOnTheScreen();
  });

  it("keeps both arrows off for a Habit that starts today", async () => {
    serveCalendar([habit({ startDate: TODAY })]);
    await renderRouter(APP_DIR, { initialUrl: "/habit/walk/history" });

    expect(await screen.findByRole("button", { name: "Next month" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
  });

  it("opens History and the editor for a Habit saved with no start date", async () => {
    serveCalendar([habit({ startDate: "" })]);
    await renderRouter(APP_DIR, { initialUrl: "/habit/walk/history" });

    expect(await screen.findByRole("button", { name: "Previous month" })).toBeDisabled();

    await userEvent.press(screen.getByRole("button", { name: "Edit Walk" }));

    expect(await screen.findByRole("link", { name: "History of Walk" })).toBeOnTheScreen();
  });

  it("logs a past check Day before the server answers", async () => {
    serveCalendar([habit({ startDate: pastDay(1) })]);
    await renderRouter(APP_DIR, { initialUrl: "/habit/walk/history" });
    await showMonthOf(PAST);
    holdWrites();

    await userEvent.press(dayButton(pastDay(9), "Not logged"));

    expect(await findDayButton(pastDay(9), "Done")).toBeOnTheScreen();
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/habits", {
        method: "POST",
        body: { type: "check", date: pastDay(9), habit: "walk", on: true, count: 1 },
      }),
    );
  });

  it("steps a count Habit's Day with More, Fewer and Clear", async () => {
    const writes = serveCalendar(
      [habit({ id: "water", name: "Water", record: "count", startDate: pastDay(1) })],
      { counts: { [pastDay(9)]: { water: 2 } } },
    );

    await renderRouter(APP_DIR, { initialUrl: "/habit/water/history" });
    await showMonthOf(PAST);

    await userEvent.press(dayButton(pastDay(8), "Not logged"));

    expect(screen.getByLabelText("Count 0")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Fewer" })).toBeDisabled();

    await userEvent.press(screen.getByRole("button", { name: "Done" }));
    await userEvent.press(dayButton(pastDay(9), "Done"));

    expect(screen.getByLabelText("Count 2")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByLabelText("Count 3")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Fewer" }));
    expect(await screen.findByLabelText("Count 2")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByLabelText("Count 0")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(screen.queryByLabelText("Count 0")).not.toBeOnTheScreen();
    expect(dayButton(pastDay(9), "Not logged")).toBeOnTheScreen();
    await waitFor(() =>
      expect(bodies(writes)).toEqual([
        { type: "check", date: pastDay(9), habit: "water", on: true, count: 3 },
        { type: "check", date: pastDay(9), habit: "water", on: true, count: 2 },
        { type: "check", date: pastDay(9), habit: "water", on: false, count: 1 },
      ]),
    );
  });

  it("clears a count Habit's Not done Day back to blank", async () => {
    const writes = serveCalendar(
      [habit({ id: "water", name: "Water", record: "count", startDate: pastDay(1) })],
      { counts: { [pastDay(9)]: { water: MISSED } } },
    );

    await renderRouter(APP_DIR, { initialUrl: "/habit/water/history" });
    await showMonthOf(PAST);
    await userEvent.press(dayButton(pastDay(9), "Not done"));

    expect(screen.getByRole("button", { name: "Fewer" })).toBeDisabled();
    await userEvent.press(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() =>
      expect(bodies(writes)).toEqual([
        { type: "check", date: pastDay(9), habit: "water", on: false, count: 1 },
      ]),
    );
  });

  it("opens a timed Day's entries, and Log time opens the log form on that Day", async () => {
    serveCalendar([timedHabit({ id: "row", name: "Row", startDate: pastDay(1) })], {
      durations: { [pastDay(9)]: { row: entry(40) }, [pastDay(8)]: { row: entry(10) } },
    });
    await renderRouter(APP_DIR, { initialUrl: "/habit/row/history" });
    await showMonthOf(PAST);

    const short = dayButton(pastDay(8), "Not logged");

    expect(within(short).getByText("10m")).toBeOnTheScreen();

    const done = dayButton(pastDay(9), "Done");

    await userEvent.press(done);
    expect(await screen.findByText("7:00 AM · 40 min")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("button", { name: "Log time" })).not.toBeOnTheScreen();

    await userEvent.press(done);
    await userEvent.press(await screen.findByRole("button", { name: "Log time" }));

    expect(screen).toHavePathname("/log-entry");
    expect(screen).toHaveSearchParams({
      draft: JSON.stringify([{ habit: "row", date: pastDay(9) }]),
    });
  });

  it("gives an Auto-logged check Habit no Day to tap", async () => {
    serveCalendar([habit({ autoLogged: true, startDate: pastDay(1) })]);
    await renderRouter(APP_DIR, { initialUrl: "/habit/walk/history" });

    const today = calendarCell(TODAY, "Not logged");

    expect(await screen.findByLabelText(today)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: today })).not.toBeOnTheScreen();
  });

  it("shows a Skip's cause on a long press, until the Day is tapped", async () => {
    serveCalendar([habit({ startDate: pastDay(1) })], {
      counts: { [pastDay(5)]: { walk: MISSED }, [pastDay(6)]: { walk: MISSED } },
      skips: { [pastDay(5)]: { walk: { cause: "avoidance", note: "Tired" } } },
    });
    await renderRouter(APP_DIR, { initialUrl: "/habit/walk/history" });
    await showMonthOf(PAST);

    expect(dayButton(pastDay(6), "Not done")).toBeOnTheScreen();

    const skipped = dayButton(pastDay(5), "Skipped");

    await fireEvent(skipped, "longPress");

    expect(screen.getByText(`Skipped ${pastDay(5)}: Avoidance: Tired`)).toBeOnTheScreen();

    await userEvent.press(skipped);

    expect(screen.queryByText(/^Skipped /)).not.toBeOnTheScreen();
  });
});
