import type { ReviewEvent, ReviewNote } from "@/core";
import { QueryClient } from "@tanstack/react-query";
import { renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

import { ApiError } from "@/lib/api/errors";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setRouteQueryClient } from "../../jest/route-mocks";
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

const DAY = "2026-11-12";

const event = (over: Partial<ReviewEvent>): ReviewEvent => ({
  eventId: "gym",
  habit: "gym-habit",
  habitName: "Group gym",
  record: "check",
  summary: "120 Parl workout",
  startTime: "19:00",
  minutes: 90,
  removed: false,
  assumeDone: true,
  ownCalendar: true,
  ...over,
});

const GYM = event({});

const SIT = event({
  eventId: "sit",
  habit: "sit-habit",
  habitName: "Group meditation",
  summary: "Zoom sit",
  startTime: "07:00",
  assumeDone: false,
});

const CANCELLED = event({
  eventId: "class",
  summary: "Pilates",
  startTime: "19:30",
  removed: true,
  ownCalendar: false,
});

const DELETED_RUN = event({
  eventId: "run",
  habit: "run-habit",
  habitName: "Run",
  record: "duration",
  summary: "Club run",
  removed: true,
});

const ok = (events: ReviewEvent[], reviewed = false, notes: ReviewNote[] = []) => ({
  status: "ok",
  day: DAY,
  reviewed,
  events,
  notes,
});

const NOTE: ReviewNote = { name: "Side projects", note: "Android wrapper" };

const serve = (review: Respond, routes: Record<string, Respond> = {}) =>
  fakeApi({ [`/api/evening-review?day=${DAY}`]: review, ...routes });

/** The labels of a radio group's choices, in order. */
const choicesIn = (name: string) =>
  within(screen.getByLabelText(name))
    .getAllByRole("radio")
    .map((radio) => String(within(radio).getByText(/./).props["children"]));

const open = () => renderRouter(APP_DIR, { initialUrl: `/evening-review?day=${DAY}` });

beforeEach(() => {
  setRouteQueryClient(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
});

afterEach(() => {
  resetRouteMocks();
});

it("starts assume done events ticked and ask ones unticked, then confirms the picks", async () => {
  const { writes } = serve(reply(ok([SIT, GYM])));

  await open();

  expect(await screen.findByText("7:00 PM · Group gym")).toBeOnTheScreen();
  expect(screen.getByText("Thu 12 Nov")).toBeOnTheScreen();

  const gym = screen.getByLabelText("What happened at 120 Parl workout?");
  const sit = screen.getByLabelText("What happened at Zoom sit?");

  expect(screen.getAllByRole("radio", { name: "Done", checked: true })).toHaveLength(1);
  expect(gym).toContainElement(screen.getByRole("radio", { name: "Done", checked: true }));
  expect(sit).toContainElement(screen.getByRole("radio", { name: "Didn't", checked: true }));

  await userEvent.press(within(gym).getByRole("radio", { name: "Skip: avoidance" }));
  await userEvent.press(within(sit).getByRole("radio", { name: "Done" }));
  await userEvent.press(screen.getByRole("button", { name: "Confirm day" }));

  await waitFor(() =>
    expect(writes).toEqual([
      {
        path: "/api/evening-review",
        method: "POST",
        body: {
          day: DAY,
          answers: [
            { eventId: "sit", done: true },
            { eventId: "gym", done: false, cause: "avoidance" },
          ],
        },
      },
    ]),
  );
});

it("lists removed events apart, logging nothing by default, outside first when someone else cancelled", async () => {
  const { writes } = serve(reply(ok([CANCELLED, DELETED_RUN])));

  await open();

  expect(await screen.findByRole("heading", { name: "Removed from calendar" })).toBeOnTheScreen();
  expect(screen.queryByRole("radio", { name: "Done" })).toBeNull();

  expect(choicesIn("What happened at Pilates?")).toEqual([
    "Log nothing",
    "Skip: outside",
    "Skip: avoidance",
  ]);
  expect(choicesIn("What happened at Club run?")).toEqual(["Log nothing"]);
  expect(screen.getAllByRole("radio", { name: "Log nothing", checked: true })).toHaveLength(2);
  expect(screen.getAllByRole("radio", { name: "Skip: outside" })).toHaveLength(1);

  await userEvent.press(screen.getByRole("radio", { name: "Skip: outside" }));
  await userEvent.press(screen.getByRole("button", { name: "Confirm day" }));

  await waitFor(() =>
    expect(writes[0]?.body).toEqual({
      day: DAY,
      answers: [
        { eventId: "class", done: false, cause: "outside" },
        { eventId: "run", done: false },
      ],
    }),
  );
});

it("offers avoidance first on my own calendar", async () => {
  serve(reply(ok([{ ...CANCELLED, ownCalendar: true }])));

  await open();
  await screen.findByRole("heading", { name: "Removed from calendar" });

  expect(choicesIn("What happened at Pilates?")).toEqual([
    "Log nothing",
    "Skip: avoidance",
    "Skip: outside",
  ]);
});

it("reviews today when no day is given", async () => {
  fakeApi({ "/api/evening-review": reply(ok([], true)) });
  await renderRouter(APP_DIR, { initialUrl: "/evening-review" });

  expect(await screen.findByText("This day is confirmed.")).toBeOnTheScreen();
});

it("says a confirmed day is confirmed", async () => {
  serve(reply(ok([], true)));
  await open();
  expect(await screen.findByText("This day is confirmed.")).toBeOnTheScreen();
});

it("points to a Habit's page when the day has no linked events", async () => {
  serve(reply(ok([])));
  await open();
  expect(
    await screen.findByText(
      "No linked events on this day. Link a calendar series from a Habit's page.",
    ),
  ).toBeOnTheScreen();
});

it.each([
  ["not-connected", "Google Calendar isn't connected. Run scripts/setup-google-calendar.sh."],
  ["unreachable", "Couldn't reach Google Calendar."],
])("explains a %s calendar", async (status, text) => {
  serve(reply({ status, notes: [] }));
  await open();
  expect(await screen.findByText(text)).toBeOnTheScreen();
  expect(screen.queryByText("Notes")).not.toBeOnTheScreen();
});

it("lists the Day's notes beside the events", async () => {
  serve(reply(ok([SIT], false, [NOTE, NOTE])));
  await open();

  expect(await screen.findByText("Notes")).toBeOnTheScreen();
  expect(screen.getAllByText("Side projects: Android wrapper")).toHaveLength(2);
});

it("lists the Day's notes when the calendar can't be reached", async () => {
  serve(reply({ status: "unreachable", notes: [NOTE] }));
  await open();

  expect(await screen.findByText("Couldn't reach Google Calendar.")).toBeOnTheScreen();
  expect(screen.getByText("Side projects: Android wrapper")).toBeOnTheScreen();
});

it("offers Try again when the review can't load", async () => {
  let calls = 0;

  serve(() => {
    calls += 1;

    // A 4xx is not retried, so the error shows at once.
    if (calls === 1) throw new ApiError(400, null);

    return ok([], true);
  });
  await open();

  expect(await screen.findByText("Couldn't load the review.")).toBeOnTheScreen();
  await userEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("This day is confirmed.")).toBeOnTheScreen();
});

it("shows the day as confirmed after the morning pass beat me to it", async () => {
  let reviewed = false;

  serve(() => ok([GYM], reviewed), {
    "POST /api/evening-review": () => {
      reviewed = true;
      throw new ApiError(409, { error: "already reviewed" });
    },
  });
  await open();

  await userEvent.press(await screen.findByRole("button", { name: "Confirm day" }));
  expect(await screen.findByText("This day is confirmed.")).toBeOnTheScreen();
});

it("says so when the confirm fails", async () => {
  serve(reply(ok([GYM])), {
    "POST /api/evening-review": reply(new ApiError(503, { status: "unreachable" })),
  });
  await open();

  await userEvent.press(await screen.findByRole("button", { name: "Confirm day" }));
  expect(
    await screen.findByText("Couldn't save. Check the connection and try again."),
  ).toBeOnTheScreen();
});
