import {
  shiftDay,
  torontoDay,
  type Durations,
  type Habit,
  type HabitDetails,
  type LogDraft,
} from "@/core";
import { QueryClient } from "@tanstack/react-query";
import { renderRouter, screen, waitFor } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

import { OFFLINE_NOTICE } from "@/components/log-composer";
import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError } from "@/lib/api/errors";
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
import { fakeApi, reply, type Respond } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit, timedHabit } from "../../jest/fixtures";
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

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

const HABITS = [
  timedHabit({ id: "walk", name: "Walk", targetMinutes: 30 }),
  habit({ id: "water", name: "Water", record: "count" }),
  habit({ id: "old", name: "Old habit", active: false }),
];

const STRETCH: LogDraft = {
  type: "create",
  habit: {
    name: "Stretch",
    kind: "good",
    record: "duration",
    target_minutes: 15,
    target_type: "daily",
    target_count: 7,
    target_days: [],
  },
  entry: {},
};

// Logged entries start at 00:00: a start later today than the clock reads can't be saved.
const TODAY = torontoDay(new Date());

const STRETCH_DETAILS: HabitDetails = {
  description: "Hold each stretch for 30 seconds",
  cue_type: "action",
};

function logRoutes(
  draft: LogDraft,
  {
    durations = {},
    details = reply(STRETCH_DETAILS),
  }: { durations?: Durations; details?: Respond } = {},
) {
  const habits: Habit[] = [...HABITS];

  return {
    "POST /api/log/draft": () => draft,
    "POST /api/habits/draft": details,
    "POST /api/log/entries": () => ({ type: "logged", text: "Logged.", action: 1 }),
    "POST /api/log/one-off": () => ({
      type: "logged",
      text: "Added Go portaging on Saturday 14 Nov.",
      action: 7,
    }),
    // A created Habit answers its id and shows in the next fetch.
    "POST /api/habits": () => {
      habits.push(timedHabit({ id: "stretch", name: "Stretch", targetMinutes: 15 }));

      return { id: "stretch" };
    },
    "/api/habits": () => ({ habits, goals: [], counts: {}, durations }),
  };
}

let client: QueryClient;

beforeEach(() => {
  client = createQueryClient();
  setRouteQueryClient(client);
});

afterEach(resetRouteMocks);

// Waits for the Habits, which decide whether a draft saves at once or opens its form.
type Entries = Extract<LogDraft, { type: "entries" }>["entries"];

async function openLogForm(entries: Entries, text: string) {
  const query = new URLSearchParams({ text, draft: JSON.stringify(entries) });

  await renderRouter(APP_DIR, { initialUrl: `/log-entry?${query}` });
}

async function sendFromLogModal(text: string) {
  await renderRouter(APP_DIR, { initialUrl: "/log" });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await userEvent.paste(screen.getByLabelText("Log something"), text);
  await userEvent.press(screen.getByRole("button", { name: "Send" }));
}

// A day a week from now, so the One-off's day is never in the past.
const inDays = (days: number) => shiftDay(TODAY, days);

// The date dialog answers with a Date's local fields, here the phone's noon on `day`.
const atNoon = (day: string) => new Date(`${day}T12:00`);

const SATURDAY = inDays(6);

const PORTAGING: LogDraft = {
  type: "one-off",
  one_off: { name: "Go portaging", date: SATURDAY, usual_when: "" },
  text: "Go portaging on Saturday.",
};

describe("log box: One-offs", () => {
  afterEach(() => jest.restoreAllMocks());

  it("opens a drafted One-off with its day; Save adds it, the receipt names the day, and Undo removes it", async () => {
    const { writes: posts } = fakeApi(logRoutes(PORTAGING));

    await sendFromLogModal("go portaging Saturday");

    expect(await screen.findByRole("heading", { name: "New One-off" })).toBeOnTheScreen();
    expect(screen).toHavePathname("/one-off");
    expect(screen.getByLabelText("Name")).toHaveDisplayValue("Go portaging");
    expect(screen.getByLabelText(`Day: ${SATURDAY}`)).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Added Go portaging on Saturday 14 Nov.")).toBeOnTheScreen();
    expect(posts.at(-1)).toEqual({
      path: "/api/log/one-off",
      method: "POST",
      body: {
        text: "go portaging Saturday",
        one_off: { name: "Go portaging", date: SATURDAY, usual_when: "" },
      },
    });

    await userEvent.press(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Removed Go portaging.")).toBeOnTheScreen();
    expect(posts.at(-1)).toEqual({ path: "/api/log/7/undo", method: "POST", body: undefined });
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();

    await userEvent.press(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen).toHavePathname("/"));
  });

  it("saves the day the owner picked instead of the drafted one", async () => {
    const { writes: posts } = fakeApi(logRoutes(PORTAGING));
    const sunday = inDays(7);

    pickOnAndroid(atNoon(sunday));
    await sendFromLogModal("go portaging Saturday");

    await userEvent.press(await screen.findByLabelText(`Day: ${SATURDAY}`));
    expect(screen.getByLabelText(`Day: ${sunday}`)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posts.at(-1)?.path).toBe("/api/log/one-off"));
    expect(posts.at(-1)?.body).toEqual({
      text: "go portaging Saturday",
      one_off: { name: "Go portaging", date: sunday, usual_when: "" },
    });
  });

  it("asks which day when the sentence named none, and saves once one is picked", async () => {
    const { writes: posts } = fakeApi(
      logRoutes({
        type: "one-off",
        one_off: { name: "Call the clinic", usual_when: "09:00" },
        text: "Which day is Call the clinic?",
      }),
    );

    const tomorrow = inDays(1);

    pickOnAndroid(atNoon(tomorrow));
    await sendFromLogModal("call the clinic at 9");

    expect(await screen.findByText("Which day is Call the clinic?")).toBeOnTheScreen();
    expect(screen.getByLabelText("Usual when: 9:00 AM")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.press(screen.getByLabelText("Day: not picked"));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posts.at(-1)?.path).toBe("/api/log/one-off"));
    expect(posts.at(-1)?.body).toEqual({
      text: "call the clinic at 9",
      one_off: { name: "Call the clinic", date: tomorrow, usual_when: "09:00" },
    });
  });

  it("picks the usual time on the clock dialog and saves it as HH:MM", async () => {
    const { writes: posts } = fakeApi(logRoutes(PORTAGING));

    pickOnAndroid(atNoon(SATURDAY), new Date(`${SATURDAY}T07:30`));
    await sendFromLogModal("go portaging Saturday");

    await userEvent.press(await screen.findByLabelText("Usual when: not picked"));
    expect(screen.getByLabelText("Usual when: 7:30 AM")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posts.at(-1)?.path).toBe("/api/log/one-off"));
    expect(posts.at(-1)?.body).toEqual({
      text: "go portaging Saturday",
      one_off: { name: "Go portaging", date: SATURDAY, usual_when: "07:30" },
    });
  });

  it("keeps the form open with the reason when Save is refused", async () => {
    fakeApi({
      ...logRoutes(PORTAGING),
      "POST /api/log/one-off": () => {
        throw new ApiError(400, { error: "Which day is it, and what is it called?" });
      },
    });

    await sendFromLogModal("go portaging Saturday");
    await userEvent.press(await screen.findByRole("button", { name: "Save" }));

    expect(await screen.findByText("Which day is it, and what is it called?")).toBeOnTheScreen();
    expect(screen.getByLabelText("Name")).toBeOnTheScreen();
  });

  it("edits the name and clears the usual time", async () => {
    const { writes: posts } = fakeApi(
      logRoutes({
        type: "one-off",
        one_off: { name: "Go portaging", date: SATURDAY, usual_when: "09:00" },
        text: "Go portaging on Saturday.",
      }),
    );

    await sendFromLogModal("go portaging Saturday");
    await userEvent.paste(await screen.findByLabelText("Name"), "Go canoeing");
    await userEvent.press(screen.getByRole("button", { name: "Clear usual when" }));
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posts.at(-1)?.path).toBe("/api/log/one-off"));
    expect(posts.at(-1)?.body).toEqual({
      text: "go portaging Saturday",
      one_off: { name: "Go canoeing", date: SATURDAY, usual_when: "" },
    });
  });

  it("disables Save and says why while offline", async () => {
    fakeApi(logRoutes(PORTAGING));

    setOnline(false);
    await renderRouter(APP_DIR, { initialUrl: "/one-off" });

    expect(await screen.findByText("Adding a One-off needs a connection.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("says why when Undo is refused", async () => {
    fakeApi({
      ...logRoutes(PORTAGING),
      "POST /api/log/7/undo": () => {
        throw new ApiError(409, { error: "Already undone." });
      },
    });

    await sendFromLogModal("go portaging Saturday");
    await userEvent.press(await screen.findByRole("button", { name: "Save" }));
    await userEvent.press(await screen.findByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Already undone.")).toBeOnTheScreen();
  });
});

describe("log box", () => {
  it("opens the drafted entries as a form, and Save posts what the form shows", async () => {
    const { writes: posts } = fakeApi(logRoutes({ type: "unclear", text: "" }));

    await openLogForm([{ habit: "walk", start_time: "00:00", minutes: 20 }], "walked 20 min at 7");

    expect(await screen.findByLabelText("Started at: 12:00 AM")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Walk" })).toBeSelected();

    await userEvent.paste(screen.getByLabelText("Minutes"), "25");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Logged.");
    await userEvent.press(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen).toHavePathname("/"));
    expect(posts.at(-1)).toEqual({
      path: "/api/log/entries",
      method: "POST",
      body: {
        text: "walked 20 min at 7",
        log: [{ habit: "walk", date: TODAY, start_time: "00:00", minutes: 25 }],
      },
    });
  });

  it("shows the drafted note, and Save posts the note the owner edited", async () => {
    const { writes: posts } = fakeApi(logRoutes({ type: "unclear", text: "" }));

    await openLogForm(
      [{ habit: "walk", start_time: "08:00", minutes: 20, note: "Lakeshore" }],
      "walked 20 min at 8: Lakeshore",
    );

    expect(await screen.findByLabelText("Note")).toHaveDisplayValue("Lakeshore");
    await userEvent.paste(screen.getByLabelText("Note"), "High Park");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(posts.at(-1)?.body).toEqual({
        text: "walked 20 min at 8: Lakeshore",
        log: [{ habit: "walk", date: TODAY, start_time: "08:00", minutes: 20, note: "High Park" }],
      }),
    );
  });

  it("lets the owner change the Habit, and offers only tracked ones", async () => {
    const { writes: posts } = fakeApi(
      logRoutes({ type: "entries", entries: [{ habit: null, count: 3 }] }),
    );

    await sendFromLogModal("3 glasses");

    expect(await screen.findByText("Pick a Habit.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Old habit" })).not.toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Water" }));
    expect(screen.getByLabelText("How many times")).toHaveDisplayValue("3");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posts.at(-1)?.path).toBe("/api/log/entries"));
    expect(posts.at(-1)?.body).toEqual({
      text: "3 glasses",
      log: [{ habit: "water", date: TODAY, count: 3 }],
    });
  });

  it("saves clean entries at once and offers Undo on the Receipt in the Log box", async () => {
    const { writes: posts } = fakeApi({
      ...logRoutes({ type: "entries", entries: [{ habit: "water", count: 3 }] }),
      "POST /api/log/1/undo": () => null,
    });

    await sendFromLogModal("3 glasses");

    expect(await screen.findByText("Logged.")).toBeOnTheScreen();
    expect(screen).toHavePathname("/log");
    expect(screen.getByLabelText("Log something")).toHaveDisplayValue("");
    expect(posts.at(-1)).toEqual({
      path: "/api/log/entries",
      method: "POST",
      body: { text: "3 glasses", log: [{ habit: "water", date: TODAY, count: 3 }] },
    });

    await userEvent.press(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Removed these logs.")).toBeOnTheScreen();
    expect(posts.at(-1)).toEqual({ path: "/api/log/1/undo", method: "POST", body: undefined });

    await userEvent.press(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen).toHavePathname("/"));
  });

  it("saves at once when the Habits carry no logged durations", async () => {
    const { writes: posts } = fakeApi({
      ...logRoutes({ type: "entries", entries: [{ habit: "water", count: 3 }] }),
      "/api/habits": () => ({ habits: HABITS, goals: [], counts: {} }),
    });

    await sendFromLogModal("3 glasses");

    expect(await screen.findByText("Logged.")).toBeOnTheScreen();
    expect(posts.at(-1)?.path).toBe("/api/log/entries");
  });

  it("opens the form with the entries when saving at once fails", async () => {
    fakeApi({
      ...logRoutes({ type: "entries", entries: [{ habit: "water", count: 3 }] }),
      "POST /api/log/entries": () => {
        throw new ApiError(503, { error: "The server is down." });
      },
    });

    await sendFromLogModal("3 glasses");

    expect(await screen.findByLabelText("How many times")).toHaveDisplayValue("3");
    expect(screen).toHavePathname("/log-entry");
    expect(screen.queryByText("Logged.")).not.toBeOnTheScreen();
  });

  it("opens the form when the Habits could not load", async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setRouteQueryClient(client);

    const { writes: posts } = fakeApi({
      "POST /api/log/draft": () => ({ type: "entries", entries: [{ habit: "water", count: 3 }] }),
    });

    await sendFromLogModal("3 glasses");

    await waitFor(() => expect(screen).toHavePathname("/log-entry"));
    expect(posts.map(({ path }) => path)).toEqual(["/api/log/draft"]);
  });

  it("names which entry keeps Save off when there are several", async () => {
    fakeApi(
      logRoutes({
        type: "entries",
        entries: [
          { habit: "water", count: 3 },
          { habit: null, count: 1 },
        ],
      }),
    );

    await sendFromLogModal("3 glasses and something");

    expect(await screen.findByRole("status")).toHaveTextContent("Entry 2: Pick a Habit.");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("asks before Close drops changed entries, and closes once Discard is chosen", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementationOnce((_title, _message, buttons) => {
        buttons?.find((button) => button.text === "Cancel")?.onPress?.();
      })
      .mockImplementationOnce((_title, _message, buttons) => {
        buttons?.find((button) => button.text === "Discard")?.onPress?.();
      });

    fakeApi(logRoutes({ type: "unclear", text: "" }));
    await openLogForm([{ habit: "water", count: 3 }], "3 glasses");
    await userEvent.paste(await screen.findByLabelText("How many times"), "4");

    await userEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(alert).toHaveBeenCalledWith(
      "Discard edits?",
      "These Habit logs are not saved.",
      expect.any(Array),
      expect.any(Object),
    );
    expect(screen).toHavePathname("/log-entry");

    await userEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen).toHavePathname("/"));
    alert.mockRestore();
  });

  it("asks before Close drops a changed One-off", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === "Cancel")?.onPress?.();
    });

    fakeApi(logRoutes(PORTAGING));
    await sendFromLogModal("go portaging Saturday");
    await userEvent.paste(await screen.findByLabelText("Name"), "Go canoeing");

    await userEvent.press(screen.getByRole("button", { name: "Close" }));

    expect(alert).toHaveBeenCalledWith(
      "Discard edits?",
      "This One-off is not saved.",
      expect.any(Array),
      expect.any(Object),
    );
    expect(screen).toHavePathname("/one-off");
    alert.mockRestore();
  });

  it("adds and removes rows", async () => {
    fakeApi(logRoutes({ type: "unclear", text: "" }));

    await openLogForm([{ habit: "walk", start_time: "00:00", minutes: 20 }], "walked");
    await screen.findByRole("button", { name: "Add another" });

    await userEvent.press(screen.getByRole("button", { name: "Add another" }));
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);

    await userEvent.press(screen.getAllByRole("button", { name: "Remove" }).at(-1)!);
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeOnTheScreen();
  });

  it("opens a new Habit in the Habit editor with the guesses filled in", async () => {
    fakeApi(logRoutes(STRETCH));

    await sendFromLogModal("started stretching");

    expect(await screen.findByRole("heading", { name: "New habit" })).toBeOnTheScreen();
    expect(screen.getByDisplayValue("Stretch")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("15")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save" })).toBeOnTheScreen();
  });

  it("logs what the sentence said once the new Habit is saved", async () => {
    const { writes: posts } = fakeApi(
      logRoutes({ ...STRETCH, entry: { start_time: "00:00", minutes: 20 } }),
    );

    await sendFromLogModal("stretched 20 min at midnight, new habit");
    await userEvent.press(await screen.findByRole("button", { name: "Save and log" }));

    expect(await screen.findByLabelText("Minutes")).toHaveDisplayValue("20");
    expect(screen).toHavePathname("/log-entry");
    expect(posts.map(({ path }) => path)).toContain("/api/habits");
    await waitFor(() => expect(screen.getByRole("button", { name: "Stretch" })).toBeSelected());

    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posts.at(-1)?.path).toBe("/api/log/entries"));
    expect(posts.at(-1)?.body).toEqual({
      text: "stretched 20 min at midnight, new habit",
      log: [{ habit: "stretch", date: TODAY, start_time: "00:00", minutes: 20 }],
    });
  });

  it("asks for the new Habit's details and fills them in once they arrive", async () => {
    const { writes: posts } = fakeApi(logRoutes(STRETCH));

    await sendFromLogModal("started stretching");
    await openMore();

    expect(await screen.findByDisplayValue("Hold each stretch for 30 seconds")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Something I did" })).toBeSelected();
    expect(screen.queryByText("Filling in details…")).not.toBeOnTheScreen();
    expect(posts.find(({ path }) => path === "/api/habits/draft")?.body).toEqual({
      name: "Stretch",
      kind: "good",
      record: "duration",
      text: "started stretching",
    });
  });

  it("keeps a field the owner typed before the details arrived", async () => {
    fakeApi(logRoutes(STRETCH));
    const gate = Promise.withResolvers<undefined>();
    const answer = jest.mocked(apiFetch).getMockImplementation();

    jest.mocked(apiFetch).mockImplementation(async (path, init, schema) => {
      if (path === "/api/habits/draft") await gate.promise;

      return answer?.(path, init, schema);
    });

    await sendFromLogModal("started stretching");

    expect(await screen.findByText("Filling in details…")).toBeOnTheScreen();
    await openMore();
    await userEvent.paste(screen.getByLabelText("Description"), "Ten minutes on the mat");
    gate.resolve(undefined);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Something I did" })).toBeSelected(),
    );
    expect(screen.getByLabelText("Description")).toHaveDisplayValue("Ten minutes on the mat");
  });

  it("says when the details could not be suggested, and Save still works", async () => {
    const modelDown = new ApiError(502, { error: "The model is down." });
    const { writes: posts } = fakeApi(logRoutes(STRETCH, { details: reply(modelDown) }));

    await sendFromLogModal("started stretching");

    expect(
      await screen.findByText("Couldn't suggest details; fill them in yourself."),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posts.at(-1)?.path).toBe("/api/habits"));
  });

  it("asks for no details when New habit opens from the Habits tab", async () => {
    const { writes: posts } = fakeApi(logRoutes(STRETCH));

    await renderRouter(APP_DIR, { initialUrl: "/habits" });
    await userEvent.press(await screen.findByRole("button", { name: "New habit" }));

    expect(await screen.findByRole("heading", { name: "New habit" })).toBeOnTheScreen();
    expect(screen.queryByText("Filling in details…")).not.toBeOnTheScreen();
    expect(posts).toEqual([]);
  });

  it("warns when a timed entry overlaps one already logged, but still saves", async () => {
    const { writes: posts } = fakeApi(
      logRoutes(
        { type: "entries", entries: [{ habit: "walk", start_time: "00:00", minutes: 20 }] },
        { durations: { [TODAY]: { walk: [{ id: 1, startTime: "00:10", minutes: 30 }] } } },
      ),
    );

    await sendFromLogModal("walked at 7");

    expect(
      await screen.findByText("Overlaps Walk 12:10 AM–12:40 AM, already logged."),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts.at(-1)?.path).toBe("/api/log/entries"));
  });

  it("keeps the text and says why when the model could not tell", async () => {
    fakeApi(logRoutes({ type: "unclear", text: "Name the Habit." }));

    await sendFromLogModal("stuff");

    expect(await screen.findByText("Name the Habit.")).toBeOnTheScreen();
    expect(screen).toHavePathname("/log");
    expect(screen.getByLabelText("Log something")).toHaveDisplayValue("stuff");
  });

  it("disables Send offline but keeps the draft", async () => {
    const { writes: posts } = fakeApi(logRoutes({ type: "unclear", text: "" }));

    setOnline(false);
    await sendFromLogModal("ran 5k");

    expect(screen.getByText(OFFLINE_NOTICE)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByLabelText("Log something")).toHaveDisplayValue("ran 5k");
    expect(posts).toEqual([]);
  });
});

describe("log entry form", () => {
  afterEach(() => jest.restoreAllMocks());

  it("edits one row's day, start and count and leaves the other rows alone", async () => {
    const { writes: posts } = fakeApi(logRoutes({ type: "unclear", text: "" }));

    const yesterday = inDays(-1);

    pickOnAndroid(atNoon(yesterday), new Date(`${yesterday}T07:30`));
    await openLogForm([{ habit: "walk", start_time: "00:00", minutes: 20 }], "walked");
    await userEvent.press(await screen.findByRole("button", { name: "Add another" }));

    await userEvent.press(screen.getAllByLabelText(`Day: ${TODAY}`)[0]!);
    await userEvent.press(screen.getByLabelText("Started at: 12:00 AM"));
    await userEvent.press(screen.getAllByRole("button", { name: "Water" })[1]!);
    await userEvent.paste(screen.getByLabelText("How many times"), "4");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posts.at(-1)?.path).toBe("/api/log/entries"));
    expect(posts.at(-1)?.body).toEqual({
      text: "walked",
      log: [
        { habit: "walk", date: yesterday, start_time: "07:30", minutes: 20 },
        { habit: "water", date: TODAY, count: 4 },
      ],
    });
  });

  it("disables Save and says why while offline", async () => {
    fakeApi(logRoutes({ type: "unclear", text: "" }));

    setOnline(false);
    await renderRouter(APP_DIR, { initialUrl: "/log-entry" });

    expect(await screen.findByText("Logging needs a connection.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("opens the form when the Habits carry no logged durations", async () => {
    fakeApi({ "/api/habits": () => ({ habits: HABITS, goals: [], counts: {} }) });

    await renderRouter(APP_DIR, { initialUrl: "/log-entry" });

    expect(await screen.findByRole("button", { name: "Add another" })).toBeOnTheScreen();
  });

  it("says so when the Habits can't be read", async () => {
    setRouteQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    fakeApi();

    await renderRouter(APP_DIR, { initialUrl: "/log-entry" });

    expect(await screen.findByText("Couldn't load Habits.")).toBeOnTheScreen();
  });
});
