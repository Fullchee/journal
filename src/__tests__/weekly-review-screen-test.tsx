import {
  CLOSING_QUESTION,
  lastFullWeek,
  weekLabel,
  type WeekDay,
  type WeeklyReviewBody,
} from "@/core";
import { QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { act, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";
import { Alert, Platform } from "react-native";

import { ApiError } from "@/lib/api/errors";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import {
  preloadRoutes,
  resetRouteMocks,
  routeQueryClient,
  setOnline,
  setRouteQueryClient,
} from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, reply, type Respond } from "../../jest/fake-api";

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

const day = (date: string, fields: Partial<WeekDay> = {}): WeekDay => ({
  day: date,
  checkIns: [],
  sleep: null,
  activity: null,
  habits: [],
  ...fields,
});

const DAYS: WeekDay[] = [
  day("2026-11-02"),
  day("2026-11-03", {
    sleep: { date: "2026-11-03", durationMin: 420, sleepScore: 80 },
    habits: ["Walk"],
  }),
  day("2026-11-04"),
  day("2026-11-05", {
    activity: {
      date: "2026-11-05",
      steps: 9000,
      moderateMin: null,
      vigorousMin: null,
      restingHr: null,
      avgStress: 30,
    },
  }),
  day("2026-11-06"),
  day("2026-11-07"),
  day("2026-11-08", {
    checkIns: [
      {
        day: "2026-11-08",
        time: "23:30",
        zone: "Rain",
        score: 3,
        where: "Home",
        doing: "Reading",
        onMyMind: "",
        note: "tired",
        tense: "",
        low: "",
        tired: "",
        tiredButWired: false,
      },
    ],
  }),
];

const DRAFT = `## Directions\n\n- **Move every day**: Energy; walked most mornings\n\n${CLOSING_QUESTION}\n`;

const REVIEW: WeeklyReviewBody = {
  week: "2026-W45",
  days: DAYS,
  goals: [{ title: "Move every day", why: "Energy", habits: ["Walk"] }],
  existing: null,
  draft: DRAFT,
  drafted: true,
};

function serve(review: WeeklyReviewBody, routes: Record<string, Respond> = {}) {
  return fakeApi({
    "/api/weekly-review?week=2026-W45": reply(review),
    "POST /api/notes/reflections": reply({ id: 9 }),
    "PUT /api/notes/reflections/4": reply(null),
    ...routes,
  });
}

const open = () => renderRouter(APP_DIR, { initialUrl: "/weekly-review?week=2026-W45" });

const pressSave = () => userEvent.press(screen.getByRole("button", { name: "Save" }));

/** Answers the replace dialog with the button named `choice`. */
const answerConfirm = (choice: "Cancel" | "Replace") =>
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.text === choice)?.onPress?.();
  });

beforeEach(() => {
  setRouteQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
});

afterEach(() => {
  jest.restoreAllMocks();
  resetRouteMocks();
});

it("lists the week by Toronto day, hiding empty days", async () => {
  serve(REVIEW);
  await open();

  expect(await screen.findByRole("heading", { name: "Sun Nov 8" })).toBeOnTheScreen();
  expect(screen.getByText("2026-W45 · Nov 2–8")).toBeOnTheScreen();
  expect(screen.getByText("23:30 Rain (3) · Home, Reading · “tired”")).toBeOnTheScreen();
  expect(screen.getByText("Sleep: 7.0h, sleep score 80")).toBeOnTheScreen();
  expect(screen.getByText("Activity: 9,000 steps, stress 30")).toBeOnTheScreen();
  expect(screen.getByText("Habits: Walk")).toBeOnTheScreen();
  expect(screen.queryByText("Mon Nov 2")).toBeNull();
  expect(screen.getByLabelText("Retro")).toHaveDisplayValue(DRAFT);
});

it("says when the week has nothing logged", async () => {
  serve({ ...REVIEW, days: [day("2026-11-02")] });
  await open();

  expect(await screen.findByText("Nothing logged this week.")).toBeOnTheScreen();
});

it("steps back a week", async () => {
  const { writes } = serve(REVIEW, {
    "/api/weekly-review?week=2026-W44": reply({ ...REVIEW, week: "2026-W44", days: [] }),
  });

  await open();
  await screen.findByText("Sun Nov 8");

  await userEvent.press(screen.getByRole("button", { name: "Prev" }));

  expect(await screen.findByText("2026-W44 · Oct 26–Nov 1")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  expect(writes).toEqual([]);
});

describe("the typed retro", () => {
  it("survives Prev and Next", async () => {
    serve(REVIEW, {
      "/api/weekly-review?week=2026-W44": reply({ ...REVIEW, week: "2026-W44", days: [] }),
    });
    await open();
    await screen.findByText("Sun Nov 8");
    await userEvent.paste(screen.getByLabelText("Retro"), "My week.");

    await userEvent.press(screen.getByRole("button", { name: "Prev" }));
    await screen.findByText("2026-W44 · Oct 26–Nov 1");
    expect(await screen.findByLabelText("Retro")).toHaveDisplayValue(DRAFT);

    await userEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByLabelText("Retro")).toHaveDisplayValue("My week.");
  });

  it("asks before Back drops it, and not once it is back to the draft", async () => {
    const alert = answerConfirm("Cancel");

    serve(REVIEW);
    await open();
    await screen.findByText("Sun Nov 8");
    await userEvent.paste(screen.getByLabelText("Retro"), "My week.");

    await act(() => router.replace("/session-brief"));

    expect(alert).toHaveBeenCalledWith(
      "Discard edits?",
      "The retro you wrote is not saved.",
      expect.any(Array),
      expect.any(Object),
    );
    expect(screen).toHavePathname("/weekly-review");

    await userEvent.paste(screen.getByLabelText("Retro"), DRAFT);
    await act(() => router.replace("/session-brief"));

    await waitFor(() => expect(screen).toHavePathname("/session-brief"));
    expect(alert).toHaveBeenCalledTimes(1);
  });
});

it("opens on the last full week with Next disabled past the current one", async () => {
  fakeApi({ "/api/weekly-review": reply(REVIEW) });
  await renderRouter(APP_DIR, { initialUrl: "/weekly-review" });

  const lastWeek = weekLabel(lastFullWeek(new Date()));

  expect(await screen.findByText(lastWeek)).toBeOnTheScreen();
  await userEvent.press(screen.getByRole("button", { name: "Next" }));

  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});

it("saves a new week with one POST", async () => {
  const { writes } = serve(REVIEW);
  await open();
  await screen.findByText("Sun Nov 8");

  await userEvent.paste(screen.getByLabelText("Retro"), "My week.");
  await pressSave();

  expect(await screen.findByText("Saved")).toBeOnTheScreen();
  expect(writes).toEqual([
    {
      path: "/api/notes/reflections",
      method: "POST",
      body: { periodKind: "week", period: "2026-W45", body: "My week." },
    },
  ]);
});

it("asks before replacing a saved retro; Cancel sends nothing", async () => {
  const alert = answerConfirm("Cancel");
  const { writes } = serve({ ...REVIEW, existing: { id: 4, body: "Old" } });
  await open();
  await screen.findByText("Sun Nov 8");

  expect(screen.getByRole("link", { name: /Open the saved retro/ })).toBeOnTheScreen();
  await pressSave();

  await waitFor(() =>
    expect(alert).toHaveBeenCalledWith(
      "Replace the retro?",
      "A retro for 2026-W45 exists. Replace it?",
      expect.anything(),
      expect.anything(),
    ),
  );
  expect(writes).toEqual([]);
  expect(screen.queryByText("Saved")).toBeNull();
});

it("replaces a saved retro with a PUT once confirmed", async () => {
  answerConfirm("Replace");
  const { writes } = serve({ ...REVIEW, existing: { id: 4, body: "Old" } });
  await open();
  await screen.findByText("Sun Nov 8");

  await pressSave();

  expect(await screen.findByText("Saved")).toBeOnTheScreen();
  expect(writes).toEqual([
    { path: "/api/notes/reflections/4", method: "PUT", body: { body: DRAFT } },
  ]);
});

it("asks before replacing a retro saved elsewhere since the screen opened", async () => {
  answerConfirm("Replace");
  const reviews = [REVIEW, { ...REVIEW, existing: { id: 4, body: "Saved elsewhere" } }];

  const { writes } = serve(REVIEW, {
    "/api/weekly-review?week=2026-W45": () => reviews.shift() ?? null,
    "POST /api/notes/reflections": reply(
      new ApiError(409, { error: "a note with that title exists" }),
    ),
  });

  await open();
  await screen.findByText("Sun Nov 8");

  await pressSave();

  expect(await screen.findByText("Saved")).toBeOnTheScreen();
  expect(writes.map((write) => `${write.method} ${write.path}`)).toEqual([
    "POST /api/notes/reflections",
    "PUT /api/notes/reflections/4",
  ]);
});

it("keeps the typed retro when reading the week again fails", async () => {
  let reads = 0;

  serve(REVIEW, {
    "/api/weekly-review?week=2026-W45": () => {
      reads += 1;

      if (reads > 1) throw new ApiError(502, null);

      return REVIEW;
    },
  });

  await open();
  await screen.findByText("Sun Nov 8");
  await userEvent.paste(screen.getByLabelText("Retro"), "Half a thought.");

  await act(() => routeQueryClient().refetchQueries({ queryKey: ["weekly-review", "2026-W45"] }));

  expect(reads).toBe(2);
  expect(screen.getByLabelText("Retro")).toHaveDisplayValue("Half a thought.");
  expect(screen.queryByText("Couldn't read the week. Try again.")).toBeNull();
});

it("keeps a clashing save on screen when no saved retro turns up to replace", async () => {
  const alert = answerConfirm("Replace");

  const { writes } = serve(REVIEW, {
    "POST /api/notes/reflections": reply(
      new ApiError(409, { error: "a note with that title exists" }),
    ),
  });

  await open();
  await screen.findByText("Sun Nov 8");

  await pressSave();

  expect(
    await screen.findByText(
      "Couldn't save: another retro for this week clashes. Your text is still here; try again.",
    ),
  ).toBeOnTheScreen();
  expect(alert).not.toHaveBeenCalled();
  expect(writes.map((write) => `${write.method} ${write.path}`)).toEqual([
    "POST /api/notes/reflections",
  ]);
  expect(screen.queryByText("Saved")).toBeNull();
});

it("says why a save failed", async () => {
  serve(REVIEW, { "POST /api/notes/reflections": reply(new ApiError(500, null)) });
  await open();
  await screen.findByText("Sun Nov 8");

  await pressSave();

  expect(
    await screen.findByText("Couldn't save. Your text is still here; try again."),
  ).toBeOnTheScreen();
});

it("still shows the week when the AI fails, and saves a hand-written retro", async () => {
  const skeleton = `## Directions\n\n- **Move every day**: Energy\n\n${CLOSING_QUESTION}\n`;
  const { writes } = serve({ ...REVIEW, draft: skeleton, drafted: false });
  await open();

  expect(
    await screen.findByText("The AI draft failed; write it yourself below."),
  ).toBeOnTheScreen();
  expect(screen.getByText("Sun Nov 8")).toBeOnTheScreen();

  await userEvent.paste(screen.getByLabelText("Retro"), "Written by hand.");
  await pressSave();

  expect(await screen.findByText("Saved")).toBeOnTheScreen();
  expect(writes[0]?.body).toEqual({
    periodKind: "week",
    period: "2026-W45",
    body: "Written by hand.",
  });
});

it("says the week could not be read", async () => {
  serve(REVIEW, { "/api/weekly-review?week=2026-W45": reply(new ApiError(502, null)) });
  await open();

  expect(await screen.findByText("Couldn't read the week. Try again.")).toBeOnTheScreen();
});

it("needs a connection to write the retro", async () => {
  setOnline(false);
  serve(REVIEW);
  await open();

  expect(screen.getByText("Writing the retro needs a connection.")).toBeOnTheScreen();
});

it("disables Save and says why when the connection drops with the retro open", async () => {
  serve(REVIEW);
  await open();
  await screen.findByLabelText("Retro");

  await act(() => setOnline(false));

  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getByText("Saving needs a connection.")).toBeOnTheScreen();
});

it("sizes the retro box on web", async () => {
  jest.replaceProperty(Platform, "OS", "web");
  serve(REVIEW);
  await open();

  expect(await screen.findByLabelText("Retro")).toBeOnTheScreen();
});
