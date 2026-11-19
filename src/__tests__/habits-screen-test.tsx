import type { Draft, Goal, Target } from "@/core";
import { KIND_COPY, dueDateLabel, formatDay, shiftDay, torontoDay } from "@/core";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

import { ApiError, NetworkError } from "@/lib/api/errors";
import type { HabitsBody } from "@/lib/data/habits";
import { createQueryClient } from "@/lib/data/query-client";
import { pickCsvText } from "@/lib/pick-csv";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../modules/journal-android";
import type * as AlarmSound from "@/lib/alarms/alarm-sound.android";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setRouteQueryClient } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, pendingApi, type ResponseBody, type Write } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn, habit } from "../../jest/fixtures";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../jest/android-picker";
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

jest.mock("@/lib/pick-csv", () => ({ pickCsvText: jest.fn() }));

const mockWindow = { width: 390 };

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWindow.width, height: 900, scale: 1, fontScale: 1 }),
}));

// Alarms ring on Android only, so the form shows their sound only with the Android store.
jest.mock("@/lib/alarms/alarm-sound", () =>
  jest.requireActual<typeof AlarmSound>("@/lib/alarms/alarm-sound.android"),
);

// The Android date dialog picks this day, and the clock dialog this time, at once.
const picker = pickOnAndroid(new Date(2026, 11, 24), new Date(2026, 0, 1, 7, 30));

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

const TODAY = torontoDay(new Date());

// "N days from today" as an ISO date; a negative N is in the past.
const daysFromToday = (n: number) => shiftDay(TODAY, n);

const ONCE: Target = { type: "once", count: 1, days: [] };

const PORTAGE_DATE = daysFromToday(5);

const CALL_DATE = daysFromToday(-3);

const DENTIST_DATE = daysFromToday(-2);

const GOALS: Goal[] = [{ id: 1, title: "Steady energy", state: "active" }];

const tracker = (): HabitsBody => ({
  habits: [
    habit({ description: "Slow is **fine**.", why: "Clear head", goals: [1] }),
    habit({ id: "water", name: "Water", record: "count" }),
    habit({ id: "read", name: "Read", record: "duration", targetMinutes: 60 }),
    habit({
      id: "phone",
      name: "Phone in bed",
      kind: "bad",
      record: "duration",
      targetMinutes: 30,
    }),
    habit({ id: "snack", name: "Snack", kind: "bad", active: false }),
    habit({ id: "stoic", name: "Stoicism", target: { type: "none", count: 7, days: [] } }),
    habit({ id: "portage", name: "Portage", target: ONCE, startDate: PORTAGE_DATE }),
    habit({ id: "call", name: "Call Mom", target: ONCE, startDate: CALL_DATE }),
    habit({ id: "dentist", name: "Dentist", target: ONCE, startDate: DENTIST_DATE }),
  ],
  goals: GOALS,
  counts: { [DENTIST_DATE]: { dentist: 1 } },
  reschedules: {
    call: [
      {
        from: daysFromToday(-10),
        to: daysFromToday(-6),
        cause: "outside",
        note: "Rain",
        createdAt: "2026-10-29T12:00:00Z",
      },
      {
        from: daysFromToday(-6),
        to: CALL_DATE,
        cause: "avoidance",
        note: "",
        createdAt: "2026-11-02T12:00:00Z",
      },
    ],
  },
  durations: {
    [TODAY]: {
      read: [{ id: 5, startTime: "08:00", minutes: 30 }],
      phone: [{ id: 6, startTime: "23:00", minutes: 40 }],
    },
  },
});

const HABITS_ROUTES = {
  "/api/habits": tracker,
  "/api/check-ins": () => ({ checkIns: [checkIn({ place: "Cafe" })] }),
};

const posted = (writes: Write[]) => writes.map(({ body }) => body);

beforeEach(() => {
  mockWindow.width = 390;
  setRouteQueryClient(createQueryClient());
});

afterEach(resetRouteMocks);

const renderAt = async (url: string) => {
  const { writes } = fakeApi(HABITS_ROUTES);
  await renderRouter(APP_DIR, { initialUrl: url });

  return writes;
};

const chip = (group: string, name: string) =>
  // The Habits tab stays mounted under the editor, so the last group with that name is the newest screen's.
  within(screen.getAllByLabelText(group).at(-1)!).getByRole("button", { name });

const MOVE_HINT = "To move it, use Reschedule on Today.";

describe("Habits tab", () => {
  it("lists active Habits, leaves out References and One-offs and keeps Backlog collapsed", async () => {
    await renderAt("/habits");

    expect(await screen.findByRole("button", { name: /^Walk,/ })).toBeOnTheScreen();
    expect(screen.getByRole("heading", { name: "All habits" })).toBeOnTheScreen();
    expect(screen.queryByText("Stoicism")).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Portage, Seed,/ })).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Snack,/ })).not.toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Backlog (1)" }));

    expect(screen.getByRole("button", { name: /^Snack,/ })).toBeOnTheScreen();
  });

  it("lists open One-offs in their own section, overdue first, and leaves out answered ones", async () => {
    await renderAt("/habits");

    const section = within(await screen.findByLabelText("One-offs"));
    const rows = section.getAllByRole("button");

    expect(screen.getByRole("heading", { name: "One-offs" })).toBeOnTheScreen();
    expect(rows).toEqual([
      section.getByRole("button", { name: `Call Mom, overdue since ${dueDateLabel(CALL_DATE)}` }),
      section.getByRole("button", { name: `Portage, ${dueDateLabel(PORTAGE_DATE)}` }),
    ]);
    expect(section.getByText("Overdue")).toHaveProp(
      "className",
      expect.not.stringContaining("destructive"),
    );
    expect(screen.queryByText("Dentist")).not.toBeOnTheScreen();

    await userEvent.press(rows[1]!);

    expect(screen).toHavePathname("/habit/portage");
  });

  it("hides the One-offs section under Problems", async () => {
    await renderAt("/habits?kind=bad");

    expect(await screen.findByRole("heading", { name: "Problems" })).toBeOnTheScreen();
    expect(screen.queryByRole("heading", { name: "One-offs" })).not.toBeOnTheScreen();
  });

  it("expands a card to its details and opens the editor from Edit", async () => {
    await renderAt("/habits");

    await userEvent.press(await screen.findByRole("button", { name: "Details of Walk" }));

    expect(screen.getByText("Clear head")).toBeOnTheScreen();
    expect(screen.getByText("Steady energy")).toBeOnTheScreen();
    expect(screen.getByText("Slow is **fine**.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Walk: last 7 days")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Edit Walk" }));

    expect(screen).toHavePathname("/habit/walk");
  });

  it("opens a link in a description inside the app", async () => {
    fakeApi({
      ...HABITS_ROUTES,
      "/api/habits": () => ({
        ...tracker(),
        habits: [habit({ description: "See [Stoicism](/library/stoic)." })],
      }),
    });
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    await userEvent.press(await screen.findByRole("button", { name: "Details of Walk" }));
    await userEvent.press(screen.getByRole("link", { name: "Stoicism" }));

    expect(screen).toHavePathname("/library/stoic");
  });

  it("shows Problems for ?kind=bad", async () => {
    await renderAt("/habits?kind=bad");

    expect(await screen.findByRole("heading", { name: "Problems" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Phone in bed,/ })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Walk,/ })).not.toBeOnTheScreen();
  });

  it("keeps the filters in the URL and clears them", async () => {
    await renderAt("/habits");
    await screen.findByRole("button", { name: /^Walk,/ });

    await userEvent.press(chip("Stage", "Tree"));

    expect(screen).toHaveSearchParams({ stage: "tree" });
    expect(screen.getByText("No habits match these filters.")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen).toHaveSearchParams({});
  });

  it("clears one filter by picking All", async () => {
    await renderAt("/habits?kind=bad");
    await screen.findByRole("heading", { name: "Problems" });

    await userEvent.press(chip("Kind", "All"));

    expect(screen).toHaveSearchParams({});
  });

  it("puts the filters beside the list on a wide screen", async () => {
    mockWindow.width = 1024;
    await renderAt("/habits");

    expect(await screen.findByRole("button", { name: /^Walk,/ })).toBeOnTheScreen();
    expect(screen.getByLabelText("Kind")).toBeOnTheScreen();
  });

  it("collapses an expanded card", async () => {
    await renderAt("/habits");
    const details = await screen.findByRole("button", { name: "Details of Walk" });

    await userEvent.press(details);
    expect(screen.getByText("Clear head")).toBeOnTheScreen();

    await userEvent.press(details);
    expect(screen.queryByText("Clear head")).not.toBeOnTheScreen();
  });

  it("names the Habit a loop follows and a Goal the list doesn't hold by their ids", async () => {
    fakeApi({
      ...HABITS_ROUTES,
      "/api/habits": (): HabitsBody => ({
        ...tracker(),
        habits: [
          habit({ cue: "", stackedAfter: "water", goals: [1, 9] }),
          habit({ id: "water", name: "Water", record: "count" }),
          habit({ id: "rinse", name: "Rinse", cue: "", stackedAfter: "gone" }),
        ],
      }),
    });
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    await userEvent.press(await screen.findByRole("button", { name: "Details of Walk" }));
    await userEvent.press(screen.getByRole("button", { name: "Details of Rinse" }));

    expect(screen.getByText(/After “Water”/)).toBeOnTheScreen();
    expect(screen.getByText("Steady energy, 9")).toBeOnTheScreen();
    expect(screen.getByText(/After “gone”/)).toBeOnTheScreen();
  });

  it("says so when the Habits can't be loaded", async () => {
    setRouteQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    fakeApi({});
    await renderRouter(APP_DIR, { initialUrl: "/habits" });

    expect(await screen.findByText("Couldn't load Habits.")).toBeOnTheScreen();
  });

  it("starts a new Habit as bad under Problems", async () => {
    await renderAt("/habits?kind=bad");
    await screen.findByRole("heading", { name: "Problems" });

    await userEvent.press(screen.getByRole("button", { name: "New habit" }));

    expect(screen).toHavePathname("/habit/new");
    expect(chip("Kind", "Bad")).toBeSelected();
  });

  it("shows a check made offline at once and saves it after reconnecting", async () => {
    const writes = await renderAt("/habits");
    await screen.findByRole("button", { name: /^Walk,/ });
    await act(() => onlineManager.setOnline(false));

    await userEvent.press(screen.getByRole("checkbox", { name: "Walk today" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Walk today" })).toBeChecked());
    expect(posted(writes)).toEqual([]);

    await act(() => onlineManager.setOnline(true));

    await waitFor(() =>
      expect(posted(writes)).toEqual([
        { type: "check", date: TODAY, habit: "walk", on: true, count: 1 },
      ]),
    );
  });

  it("counts with + and −", async () => {
    const writes = await renderAt("/habits");

    await userEvent.press(await screen.findByRole("button", { name: "One more Water" }));
    await waitFor(() => expect(screen.getByLabelText("1 today")).toBeOnTheScreen());
    await userEvent.press(screen.getByRole("button", { name: "One fewer Water" }));

    await waitFor(() =>
      expect(posted(writes)).toEqual([
        { type: "check", date: TODAY, habit: "water", on: true, count: 1 },
        { type: "check", date: TODAY, habit: "water", on: false, count: 1 },
      ]),
    );
  });

  it("logs a past day from the week strip", async () => {
    const writes = await renderAt("/habits");
    await userEvent.press(await screen.findByRole("button", { name: "Details of Water" }));
    const yesterday = daysFromToday(-1);

    const spoken = formatDay(yesterday, { weekday: "long", day: "numeric", month: "long" });

    await userEvent.press(screen.getByRole("checkbox", { name: `Water, ${spoken}: not logged` }));

    await waitFor(() =>
      expect(posted(writes)).toEqual([
        { type: "check", date: yesterday, habit: "water", on: true, count: 1 },
      ]),
    );
  });

  it("shows a timed day against its bar, red over a bad ceiling", async () => {
    await renderAt("/habits");

    expect(await screen.findByText("30 min · once today (goal 1 h)")).toBeOnTheScreen();
    expect(screen.getByText("40 min · once today (at most 30 min)")).toHaveProp(
      "className",
      expect.stringContaining("text-destructive"),
    );
  });

  it("opens a timed day and deletes an entry online", async () => {
    const writes = await renderAt("/habits");

    await userEvent.press(await screen.findByRole("button", { name: "Read today: show entries" }));
    expect(screen.getByText("8:00 AM · 30 min")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Delete Read at 8:00 AM" }));

    await waitFor(() => expect(posted(writes)).toEqual([{ type: "delete-duration", entry: 5 }]));

    await userEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("8:00 AM · 30 min")).not.toBeOnTheScreen();
  });

  it("hides a deleted entry before the server answers", async () => {
    await renderAt("/habits");

    await userEvent.press(await screen.findByRole("button", { name: "Read today: show entries" }));
    pendingApi();
    await userEvent.press(screen.getByRole("button", { name: "Delete Read at 8:00 AM" }));

    await waitFor(() => expect(screen.queryByText("8:00 AM · 30 min")).not.toBeOnTheScreen());
  });

  it("offers Undo after deleting an entry, which logs the same start and minutes again", async () => {
    const writes = await renderAt("/habits");

    await userEvent.press(await screen.findByRole("button", { name: "Read today: show entries" }));
    await userEvent.press(screen.getByRole("button", { name: "Delete Read at 8:00 AM" }));

    const toast = within(await screen.findByTestId("toast"));

    expect(toast.getByText("Deleted 30 min · Read")).toBeOnTheScreen();
    await userEvent.press(toast.getByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(posted(writes)).toContainEqual({
        type: "import-durations",
        habit: "read",
        entries: [{ date: TODAY, startTime: "08:00", minutes: 30 }],
      }),
    );
  });

  it("disables editing offline", async () => {
    onlineManager.setOnline(false);
    await renderAt("/habits");

    expect(screen.getByRole("button", { name: "New habit" })).toBeDisabled();
    expect(screen.getByText("Editing needs a connection.")).toBeOnTheScreen();
  });
});

describe("Habit editor", () => {
  it("opens from /habits?edit=<id>", async () => {
    await renderAt("/habits?edit=walk");

    await waitFor(() => expect(screen).toHavePathname("/habit/walk"));
    expect(await screen.findByLabelText("Name")).toHaveDisplayValue("Walk");
  });

  it("saves an edit and closes", async () => {
    const writes = await renderAt("/habits?edit=walk");

    await userEvent.paste(await screen.findByLabelText("Name"), "Walk far");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen).toHavePathname("/habits"));
    expect(posted(writes)).toEqual([
      expect.objectContaining({ type: "habit", id: "walk", name: "Walk far" }),
    ]);
  });

  it("offers only Add time for a Habit with no time, and saves the picked time", async () => {
    const writes = await renderAt("/habits?edit=water");

    await userEvent.press(await screen.findByRole("button", { name: "Add time" }));
    expect(screen.queryByText(/Usual when/)).not.toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(posted(writes)).toEqual([
        expect.objectContaining({ id: "water", usualWhen: "08:00", alarm: null }),
      ]),
    );
  });

  it("clears a time and its alarm together", async () => {
    const writes = await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");

    await userEvent.press(screen.getByRole("button", { name: "Add time" }));
    await userEvent.press(chip("Notify", "Alarm"));
    await userEvent.press(screen.getByRole("button", { name: "Clear time" }));
    expect(screen.getByRole("button", { name: "Add time" })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(posted(writes)).toEqual([expect.objectContaining({ usualWhen: "", alarm: null })]),
    );
  });

  it("shows the alarm sound for an alarm and changes it for every alarm", async () => {
    jest
      .mocked(JournalAndroid.pickAlarmSound)
      .mockResolvedValueOnce({ title: "Here Comes the Sun" });
    await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");

    await userEvent.press(screen.getByRole("button", { name: "Add time" }));
    expect(screen.queryByText(/Sound for all alarms/)).not.toBeOnTheScreen();
    await userEvent.press(chip("Notify", "Alarm"));
    expect(screen.getByText("Sound for all alarms: Default alarm")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Change sound" }));

    expect(await screen.findByText("Sound for all alarms: Here Comes the Sun")).toBeOnTheScreen();
  });

  it("creates a Habit with every field of the form", async () => {
    const writes = await renderAt("/habits?edit=new");
    await screen.findByLabelText("Name");

    await userEvent.paste(screen.getByLabelText("Name"), "Stretch");
    await openMore();
    await userEvent.paste(screen.getByLabelText("Why"), "Loose back");
    await userEvent.press(chip("Cue", "Stacked habit"));
    await userEvent.press(chip("Comes after habit", "Walk"));
    await userEvent.paste(screen.getByLabelText("I will…"), "Stretch five minutes");
    expect(screen.queryByLabelText("Usual when")).not.toBeOnTheScreen();
    expect(screen.getByText("Anywhere")).toBeOnTheScreen();
    await userEvent.press(chip("Places", "Gym"));
    await userEvent.press(chip("Places", "Cafe"));
    await userEvent.press(chip("Places", "Cafe"));
    await userEvent.press(chip("Places", "Other"));
    await userEvent.paste(screen.getByLabelText("Other place"), " Pool ");
    await fireEvent(screen.getByLabelText("Other place"), "submitEditing");
    expect(screen.queryByLabelText("Other place")).not.toBeOnTheScreen();
    expect(screen.queryByText("Anywhere")).not.toBeOnTheScreen();
    await userEvent.paste(screen.getByLabelText("Obstacles"), "Too Tired ");
    await fireEvent(screen.getByLabelText("Obstacles"), "submitEditing");
    await userEvent.press(chip("Suggestions", "no time"));
    await userEvent.press(screen.getByRole("button", { name: "Remove no time" }));
    await userEvent.press(chip("Replaces bad habit", "Snack"));
    await userEvent.press(chip("Frequency", "N× a week"));
    await userEvent.press(screen.getByRole("button", { name: "Fewer times" }));
    await userEvent.press(chip("Record", "Minutes"));
    await userEvent.paste(screen.getByLabelText("Minutes a day"), "20");
    await userEvent.press(screen.getByLabelText("Auto-logged"));
    await userEvent.press(screen.getByRole("button", { name: "Add time" }));
    await userEvent.press(chip("Notify", "Persistent notification"));
    await userEvent.press(screen.getByLabelText("Time: 8:00 AM"));
    await userEvent.press(chip("Goals this habit serves", "Steady energy"));
    await userEvent.press(chip("Stage", "Sprout"));
    await userEvent.press(chip("Priority", "High"));
    await userEvent.press(screen.getByLabelText(/^Started: /));
    await userEvent.paste(screen.getByLabelText("Description"), "# Stretch");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posted(writes)).toHaveLength(1));
    expect(posted(writes)[0]).toEqual({
      type: "habit",
      name: "Stretch",
      description: "# Stretch",
      why: "Loose back",
      usualWhen: "07:30",
      usualWhere: "",
      places: ["Gym", "Pool"],
      kind: "good",
      stage: "sprout",
      priority: "high",
      active: true,
      autoLogged: true,
      optOutFrom: null,
      usualMinutes: null,
      startDate: "2026-12-24",
      cue: "",
      cueType: "stacked",
      routine: "Stretch five minutes",
      reward: "",
      obstacles: ["too tired"],
      replaces: "snack",
      stackedAfter: "walk",
      target: { type: "weekly", count: 6, days: [] },
      record: "duration",
      targetMinutes: 20,
      goals: [1],
      alarm: { time: "07:30", kind: "persistent" },
      seasons: [],
      seasonQuietUntil: null,
      tinyVersion: "",
    } satisfies Draft & { type: string });
  });

  it("keeps an older Habit's usual spot and reward when it saves", async () => {
    const { writes } = fakeApi({
      ...HABITS_ROUTES,
      "/api/habits": () => ({
        ...tracker(),
        habits: [habit({ usualWhere: "the hall", reward: "feel loose" })],
      }),
    });

    await renderRouter(APP_DIR, { initialUrl: "/habit/walk" });

    await userEvent.paste(await screen.findByLabelText("Name"), "Walk far");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posted(writes)).toHaveLength(1));
    expect(posted(writes)[0]).toMatchObject({
      name: "Walk far",
      usualWhere: "the hall",
      reward: "feel loose",
    });
  });

  it("makes a timed Habit Opt-out from today with its usual length", async () => {
    const writes = await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");

    await userEvent.press(chip("Record", "Minutes"));
    await userEvent.paste(screen.getByLabelText("Minutes a day"), "60");
    expect(screen.queryByLabelText("Usual length (minutes)")).not.toBeOnTheScreen();
    await userEvent.press(screen.getByLabelText("Opt-out"));
    expect(screen.getByLabelText("Usual length (minutes)")).toHaveDisplayValue("60");
    await userEvent.paste(screen.getByLabelText("Usual length (minutes)"), "120");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posted(writes)).toHaveLength(1));
    expect(posted(writes)[0]).toMatchObject({
      optOutFrom: torontoDay(new Date()),
      usualMinutes: 120,
    });
  });

  it("offers Opt-out only on a Habit with fixed due days, and turns it off", async () => {
    const writes = await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");

    await userEvent.press(screen.getByLabelText("Opt-out"));
    await userEvent.press(screen.getByLabelText("Opt-out"));
    await userEvent.press(chip("Frequency", "N× a week"));
    expect(screen.queryByLabelText("Opt-out")).not.toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posted(writes)).toHaveLength(1));
    expect(posted(writes)[0]).toMatchObject({ optOutFrom: null });
  });

  it("edits fixed weekdays, toggles a Goal off and turns the alarm off", async () => {
    const writes = await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");

    await userEvent.press(chip("Frequency", "Fixed weekdays"));
    await userEvent.press(chip("Weekdays", "Mon"));
    await userEvent.press(chip("Weekdays", "Wed"));
    await userEvent.press(chip("Weekdays", "Mon"));
    await openMore();
    await userEvent.press(chip("Goals this habit serves", "Steady energy"));
    await userEvent.press(screen.getByRole("button", { name: "Add time" }));
    await userEvent.press(chip("Notify", "Alarm"));
    await userEvent.press(chip("Notify", "None"));
    await userEvent.press(chip("Cue", "People"));
    await userEvent.paste(screen.getByLabelText("After / when…"), "a friend calls");
    await userEvent.press(screen.getByRole("button", { name: "Move to backlog" }));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posted(writes)).toHaveLength(1));
    expect(posted(writes)[0]).toMatchObject({
      target: { type: "days", days: [3] },
      goals: [],
      alarm: null,
      usualWhen: "08:00",
      cueType: "people",
      cue: "a friend calls",
      active: false,
    });
  });

  it("offers only bad Habits that share a Place, keeping the current pick, as the last field", async () => {
    fakeApi({
      ...HABITS_ROUTES,
      "/api/habits": () => ({
        ...tracker(),
        habits: [
          habit({ places: ["Gym"], replaces: "scroll" }),
          habit({ id: "snack", name: "Snack", kind: "bad", places: ["gym"] }),
          habit({ id: "scroll", name: "Scroll", kind: "bad", places: ["Work"] }),
          habit({ id: "bite", name: "Nail biting", kind: "bad", places: ["Work"] }),
          habit({ id: "sugar", name: "Sugar", kind: "bad" }),
        ],
      }),
    });
    await renderRouter(APP_DIR, { initialUrl: "/habit/walk" });
    await screen.findByLabelText("Name");
    await openMore();

    const offered = () =>
      ["Snack", "Scroll", "Nail biting", "Sugar"].filter(
        (name) =>
          within(screen.getByLabelText("Replaces bad habit")).queryByRole("button", { name }) !==
          null,
      );

    expect(offered()).toEqual(["Snack", "Scroll", "Sugar"]);

    await userEvent.press(chip("Places", "Gym"));

    expect(offered()).toEqual(["Snack", "Scroll", "Nail biting", "Sugar"]);

    const labels = screen.getAllByText(/^(?:Description|Replaces bad habit)$/);

    expect(labels).toHaveLength(2);
    expect(labels.at(-1)).toHaveTextContent("Replaces bad habit");
  });

  it("shows who replaces a bad Habit and blocks a stacked cue with no Habit", async () => {
    await renderAt("/habits?edit=snack");
    await screen.findByLabelText("Name");
    await openMore();

    expect(screen.queryByRole("group", { name: "Replaces bad habit" })).not.toBeOnTheScreen();

    await userEvent.press(chip("Cue", "Stacked habit"));

    expect(screen.getByText("Choose the habit this one comes after.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("asks before discarding changes, and only then", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === "Discard")?.onPress?.();
    });

    await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");

    await userEvent.paste(screen.getByLabelText("Name"), "changed");
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen).toHavePathname("/habits"));
    expect(alert).toHaveBeenCalledWith(
      "Discard changes?",
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
    );
    alert.mockRestore();
  });

  it("closes untouched without asking", async () => {
    const alert = jest.spyOn(Alert, "alert");
    await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");

    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen).toHavePathname("/habits"));
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("keeps editing when the discard is cancelled", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === "Cancel")?.onPress?.();
    });

    await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");

    await userEvent.paste(screen.getByLabelText("Name"), "changed");
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(screen).toHavePathname("/habit/walk");
    alert.mockRestore();
  });

  it("deletes a Habit after confirming", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === "Delete")?.onPress?.();
    });

    const writes = await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");

    await userEvent.press(screen.getByRole("button", { name: "Delete habit" }));

    await waitFor(() => expect(posted(writes)).toEqual([{ type: "delete-habit", id: "walk" }]));
    await waitFor(() => expect(screen).toHavePathname("/habits"));
    alert.mockRestore();
  });

  it("says the server can't be reached when a save never arrives", async () => {
    await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");
    fakeApi({
      ...HABITS_ROUTES,
      "POST /api/habits": () => {
        throw new NetworkError(null);
      },
    });

    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Couldn't reach the server. Try again.")).toBeOnTheScreen();
  });

  it("keeps a Habit when the delete is declined", async () => {
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === "Cancel")?.onPress?.();
    });

    const writes = await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");

    await userEvent.press(screen.getByRole("button", { name: "Delete habit" }));

    expect(posted(writes)).toEqual([]);
    expect(screen).toHavePathname("/habit/walk");
  });

  it("says when a delete failed", async () => {
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === "Delete")?.onPress?.();
    });

    await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");
    fakeApi({
      ...HABITS_ROUTES,
      "POST /api/habits": () => {
        throw new ApiError(500, null);
      },
    });

    await userEvent.press(screen.getByRole("button", { name: "Delete habit" }));

    expect(await screen.findByText("Couldn't delete. Try again.")).toBeOnTheScreen();
  });

  it("logs the sentence's entry after Save, with no sentence text when the log box sent none", async () => {
    const writes = await renderAt(`/habit/walk?entry=${JSON.stringify({ minutes: 20 })}`);
    await screen.findByLabelText("Name");

    await userEvent.press(screen.getByRole("button", { name: "Save and log" }));

    await waitFor(() => expect(screen).toHavePathname("/log-entry"));
    expect(screen).toHaveSearchParams({
      text: "",
      draft: JSON.stringify([{ minutes: 20, habit: "walk" }]),
    });
    expect(posted(writes)).toHaveLength(1);
  });

  it("ignores an entry that isn't JSON or doesn't fit, and saves as an ordinary edit", async () => {
    await renderAt("/habit/walk?entry=not-json");
    expect(await screen.findByRole("button", { name: "Save" })).toBeOnTheScreen();

    await renderAt(`/habit/walk?entry=${JSON.stringify({ minutes: "twenty" })}`);
    expect(await screen.findByRole("button", { name: "Save" })).toBeOnTheScreen();
  });

  it("opens a blank editor when the log box's draft isn't JSON or doesn't fit", async () => {
    await renderAt("/habit/new?draft=not-json");
    expect(await screen.findByRole("heading", { name: "New habit" })).toBeOnTheScreen();

    await renderAt("/habit/new?draft={}");
    expect(await screen.findByRole("heading", { name: "New habit" })).toBeOnTheScreen();
  });

  it("says why a save failed", async () => {
    await renderAt("/habits?edit=walk");
    await screen.findByLabelText("Name");
    fakeApi({
      ...HABITS_ROUTES,
      "POST /api/habits": () => {
        throw new ApiError(400, { error: "invalid change" });
      },
    });

    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Couldn't save. Check the name and try again."),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname("/habit/walk");
  });

  it("opens a new good Habit Scheduled and sets its time and saves without opening More", async () => {
    const writes = await renderAt("/habits?edit=new");
    await screen.findByLabelText("Name");

    await userEvent.paste(screen.getByLabelText("Name"), "Walk early");

    expect(screen.getByText("Choose a time.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.press(screen.getByRole("button", { name: "Add time" }));

    expect(screen.getAllByLabelText("Time: 8:00 AM")).toHaveLength(1);
    expect(screen.queryByText("Choose a time.")).not.toBeOnTheScreen();
    expect(screen.queryByLabelText("Cue")).not.toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(posted(writes)).toEqual([
        expect.objectContaining({ cueType: "time", usualWhen: "08:00" }),
      ]),
    );
  });

  it("opens an older Habit with a time cue as Scheduled with its time, shown once", async () => {
    fakeApi({
      ...HABITS_ROUTES,
      "/api/habits": () => ({
        ...tracker(),
        habits: [habit({ cueType: "time", usualWhen: "07:45" })],
      }),
    });
    await renderRouter(APP_DIR, { initialUrl: "/habit/walk" });
    await screen.findByLabelText("Name");
    await openMore();

    expect(chip("Cue", "Scheduled")).toBeSelected();
    expect(screen.queryByLabelText(KIND_COPY.good.cue)).not.toBeOnTheScreen();
    expect(screen.getAllByLabelText("Time: 7:45 AM")).toHaveLength(1);

    await userEvent.paste(screen.getByLabelText("I will…"), "Walk");

    expect(screen.getByText("At 7:45 AM, I will walk.")).toBeOnTheScreen();

    await userEvent.press(chip("Cue", "People"));

    expect(screen.getAllByLabelText("Time: 7:45 AM")).toHaveLength(1);
    expect(screen.getByLabelText(KIND_COPY.good.cue)).toBeOnTheScreen();
  });

  it("calls the schedule Frequency on a good Habit and Limit, with a Time cue, on a bad one", async () => {
    await renderAt("/habits?edit=new");
    await screen.findByLabelText("Name");

    expect(chip("Frequency", "Reference (never due)")).toBeOnTheScreen();

    await userEvent.press(chip("Kind", "Bad"));
    await openMore();

    expect(chip("Limit", "Every day")).toBeOnTheScreen();
    expect(chip("Cue", "Time")).toBeSelected();
    expect(screen.queryByRole("group", { name: "Frequency" })).not.toBeOnTheScreen();
  });

  it("lists the cues in order and the fields in the decided order", async () => {
    fakeApi(HABITS_ROUTES);
    await renderRouter(APP_DIR, { initialUrl: "/habit/new" });
    await screen.findByLabelText("Name");
    await openMore();

    const inOrder = (texts: ReturnType<typeof screen.getAllByText>, names: string[]) => {
      expect(texts).toHaveLength(names.length);

      for (const [i, name] of names.entries())
        expect(texts.at(i)).toHaveTextContent(name, { exact: true });
    };

    const cues = ["Scheduled", "Stacked habit", "Previous Action", "Emotional State", "People"];

    inOrder(within(screen.getByLabelText("Cue")).getAllByText(/./), ["Cue", ...cues]);

    const fields = [
      "Name",
      "Kind",
      "Frequency",
      "Started",
      "Why",
      "Cue",
      "I will…",
      "Places",
      // The section heading, then its text field.
      "Obstacles",
      "Obstacles",
      "Goals this habit serves",
      "Stage",
      "Priority",
      "Description",
      "Replaces bad habit",
    ];

    const anyField = new RegExp(`^(?:${[...new Set(fields)].join("|")})$`);

    inOrder(screen.getAllByText(anyField), fields);
  });

  it("creates a One-off without the habit loop, kind, record or status fields", async () => {
    const writes = await renderAt("/habits?edit=new");
    await screen.findByLabelText("Name");

    await userEvent.paste(screen.getByLabelText("Name"), "Portage");
    await userEvent.press(chip("Kind", "Bad"));
    await userEvent.press(chip("Record", "Each time"));
    await userEvent.press(chip(KIND_COPY.bad.target, "Once"));
    await openMore();

    expect(screen.getByLabelText("Why")).toBeOnTheScreen();

    for (const field of [
      "Cue",
      "I will…",
      "Places",
      "Obstacles",
      "Kind",
      "Record",
      "Stage",
      "Priority",
    ])
      expect(screen.queryByLabelText(field)).not.toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Started: /)).not.toBeOnTheScreen();
    expect(screen.queryByRole("heading", { name: "Habit loop" })).not.toBeOnTheScreen();
    expect(screen.queryByText(MOVE_HINT)).not.toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: `Date: ${TODAY}` }));

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ mode: "date" }));
    expect(screen.getByText("Once, Thu 24 Dec")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posted(writes)).toHaveLength(1));
    expect(posted(writes)[0]).toMatchObject({
      name: "Portage",
      kind: "good",
      record: "check",
      active: true,
      target: { type: "once", count: 1, days: [] },
      startDate: "2026-12-24",
    });
  });

  it("fills in today when a Habit without a start date becomes a One-off", async () => {
    fakeApi({
      ...HABITS_ROUTES,
      "/api/habits": () => ({ ...tracker(), habits: [habit({ startDate: "", active: false })] }),
    });
    await renderRouter(APP_DIR, { initialUrl: "/habit/walk" });
    await screen.findByLabelText("Name");

    await userEvent.press(chip("Frequency", "Once"));

    expect(screen.getByRole("button", { name: `Date: ${TODAY}` })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Move out of backlog" })).not.toBeOnTheScreen();
  });

  it("shows a One-off's Reschedule history, avoidance in plain muted text, and points moves to Reschedule", async () => {
    await renderAt("/habit/call");
    await screen.findByLabelText("Name");

    const [first, second, call] = [daysFromToday(-10), daysFromToday(-6), CALL_DATE].map((date) =>
      dueDateLabel(date),
    );

    expect(screen.getByRole("heading", { name: "Reschedules" })).toBeOnTheScreen();
    expect(screen.getByText(`${first} → ${second}`)).toBeOnTheScreen();
    expect(screen.getByText("Outside: Rain")).toBeOnTheScreen();
    expect(screen.getByText(`${second} → ${call}`)).toBeOnTheScreen();
    expect(screen.getByText("Avoidance")).not.toHaveProp(
      "className",
      expect.stringContaining("text-destructive"),
    );
    expect(screen.getByText(MOVE_HINT)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Move to backlog" })).not.toBeOnTheScreen();
  });

  it("locks a One-off's date once its day has come, so the move is a Reschedule", async () => {
    await renderAt("/habit/dentist");
    await screen.findByLabelText("Name");

    expect(screen.getByText(`Date: ${dueDateLabel(DENTIST_DATE)}`)).toBeOnTheScreen();
    expect(screen.getByText(MOVE_HINT)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Date:/ })).not.toBeOnTheScreen();
  });

  it("lets an upcoming, never-moved One-off take a date fix", async () => {
    await renderAt("/habit/portage");
    await screen.findByLabelText("Name");

    expect(screen.getByRole("button", { name: `Date: ${PORTAGE_DATE}` })).toBeOnTheScreen();
    expect(screen.queryByText(MOVE_HINT)).not.toBeOnTheScreen();
  });

  it("says when a One-off was never rescheduled", async () => {
    await renderAt("/habit/portage");
    await screen.findByLabelText("Name");

    expect(screen.getByText("Never rescheduled.")).toBeOnTheScreen();
  });

  it("leaves Reschedules off a repeating Habit", async () => {
    await renderAt("/habit/walk");
    await screen.findByLabelText("Name");

    expect(screen.queryByRole("heading", { name: "Reschedules" })).not.toBeOnTheScreen();
  });

  it("says when a Habit no longer exists", async () => {
    await renderAt("/habit/gone");

    expect(await screen.findByText("This Habit no longer exists.")).toBeOnTheScreen();
  });

  it("tells the owner offline that editing needs a connection", async () => {
    await renderAt("/habit/walk");
    await screen.findByLabelText("Name");
    await act(() => onlineManager.setOnline(false));
    await userEvent.paste(screen.getByLabelText("Name"), "x");

    expect(screen.getByText("Editing needs a connection.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

// Picks `csv` (null closes the picker) and imports it into the duration Habit "read"; the server answers `answer`.
const importIntoRead = async (
  csv: string | null,
  answer: () => ResponseBody = () => ({ added: 1 }),
) => {
  jest.mocked(pickCsvText).mockResolvedValue(csv);
  const { writes } = fakeApi({ ...HABITS_ROUTES, "POST /api/habits": answer });
  await renderRouter(APP_DIR, { initialUrl: "/habit/read" });
  await userEvent.press(await screen.findByRole("button", { name: "Import Insight Timer CSV" }));

  return writes;
};

const INSIGHT_TIMER_CSV = [
  "Started At,Duration,Preset,Activity",
  "11/05/2026 07:30:12,0:20:00,,Meditation",
  "11/03/2026 21:05:00,1:02:30,Evening,Meditation",
].join("\n");

describe("Insight Timer import", () => {
  it("logs each session as a Duration entry and says how many were new", async () => {
    const writes = await importIntoRead(INSIGHT_TIMER_CSV, () => ({ added: 2 }));

    expect(
      await screen.findByText("Added 2 sessions. 0 sessions already logged."),
    ).toBeOnTheScreen();
    expect(posted(writes)).toEqual([
      {
        type: "import-durations",
        habit: "read",
        entries: [
          { date: "2026-11-03", startTime: "21:05", minutes: 63 },
          { date: "2026-11-05", startTime: "07:30", minutes: 20 },
        ],
      },
    ]);
  });

  it.each([
    ["another CSV", '"date","steps"', "That file isn't an Insight Timer session log."],
    ["an empty log", "Started At,Duration", "That file has no sessions."],
  ])("refuses %s without writing", async (_name, csv, message) => {
    const writes = await importIntoRead(csv);

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(writes).toEqual([]);
  });
  it("counts a single session in the singular", async () => {
    await importIntoRead(INSIGHT_TIMER_CSV);

    expect(await screen.findByText("Added 1 session. 1 session already logged.")).toBeOnTheScreen();
  });

  it("writes nothing when no file is picked", async () => {
    const writes = await importIntoRead(null);

    expect(writes).toEqual([]);
  });

  it("says so when the server refuses", async () => {
    await importIntoRead(INSIGHT_TIMER_CSV, () => {
      throw new ApiError(400, { error: "invalid change" });
    });

    expect(await screen.findByText("Couldn't import. Try again.")).toBeOnTheScreen();
  });

  it("shows on a duration Habit with no Hevy CSV import, since the Worker syncs Hevy", async () => {
    fakeApi(HABITS_ROUTES);
    await renderRouter(APP_DIR, { initialUrl: "/habit/read" });

    expect(
      await screen.findByRole("button", { name: "Import Insight Timer CSV" }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Import Hevy CSV" })).not.toBeOnTheScreen();
  });

  it("shows only on a duration Habit", async () => {
    fakeApi(HABITS_ROUTES);
    await renderRouter(APP_DIR, { initialUrl: "/habit/water" });

    expect(await screen.findByText("Edit habit")).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "Import Insight Timer CSV" }),
    ).not.toBeOnTheScreen();
  });
});
