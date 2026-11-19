import { shiftDay, torontoDay, type Target } from "@/core";
import { renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

import type { HabitsBody } from "@/lib/data/habits";
import type * as DateFieldModule from "@/ui/components/date-field";
import type { DateFieldProps } from "@/ui/components/date-field";
import type * as ReactNative from "react-native";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setRouteQueryClient } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../jest/fixtures";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../jest/android-picker";

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

// The web date input can be emptied; this button stands in for that on the native picker.
jest.mock("@/ui/components/date-field", () => {
  const actual = jest.requireActual<typeof DateFieldModule>("@/ui/components/date-field");
  const { Pressable } = jest.requireActual<typeof ReactNative>("react-native");

  return {
    DateField: (props: DateFieldProps) => (
      <>
        <actual.DateField {...props} />
        <Pressable aria-label={`Clear ${props.label}`} onPress={() => props.onChange("")} />
      </>
    ),
  };
});

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

beforeEach(() => setRouteQueryClient(createQueryClient()));

afterEach(resetRouteMocks);

const TODAY = torontoDay(new Date());

const MONTH_AGO = shiftDay(TODAY, -30);

const ONCE: Target = { type: "once", count: 1, days: [] };

// The Android date dialog shows local fields, so a Day is local midnight.
const pickDay = (day: string) => pickOnAndroid(new Date(`${day}T00:00`));

const tracker = (): HabitsBody => ({
  habits: [
    habit({ startDate: MONTH_AGO }),
    habit({ id: "portage", name: "Portage", target: ONCE, startDate: TODAY }),
  ],
  counts: {},
  durations: {},
});

function serve() {
  return fakeApi({
    "/api/habits": tracker,
    "/api/streaks": () => ({ counts: {}, durations: {}, skips: {}, restPeriods: [] }),
    "/api/check-ins": () => ({ checkIns: [] }),
    "POST /api/habits": () => ({ id: "stretch" }),
  });
}

async function createStretch(url: string) {
  const { writes } = serve();

  await renderRouter(APP_DIR, { initialUrl: url });
  await userEvent.paste(await screen.findByLabelText("Name"), "Stretch");
  // A new good Habit is Scheduled, which needs a time before it saves.
  await userEvent.press(screen.getByRole("button", { name: "Add time" }));

  return writes;
}

const save = (name = "Save") => userEvent.press(screen.getByRole("button", { name }));

describe("Habit editor Started date", () => {
  it("lands on the new Habit's History when it started before today", async () => {
    pickDay(MONTH_AGO);
    const writes = await createStretch("/habits?edit=new");

    await userEvent.press(screen.getByLabelText(`Started: ${TODAY}`));
    expect(
      screen.getByText("You can log past days on its History after saving."),
    ).toBeOnTheScreen();
    await save();

    await waitFor(() => expect(screen).toHavePathname("/habit/stretch/history"));
    expect(writes.map(({ body }) => body)).toEqual([
      expect.objectContaining({ name: "Stretch", startDate: MONTH_AGO }),
    ]);
  });

  it("closes the editor when the new Habit starts today", async () => {
    await createStretch("/habits?edit=new");

    await save();

    await waitFor(() => expect(screen).toHavePathname("/habits"));
  });

  it("closes the editor when the new Habit's Started date is cleared", async () => {
    await createStretch("/habits?edit=new");

    await userEvent.press(screen.getByLabelText("Clear Started"));
    await save();

    await waitFor(() => expect(screen).toHavePathname("/habits"));
  });

  it("logs the log box's entry first, even when the Habit started before today", async () => {
    pickDay(MONTH_AGO);
    await createStretch(`/habit/new?entry=${JSON.stringify({ minutes: 20 })}`);

    await userEvent.press(screen.getByLabelText(`Started: ${TODAY}`));
    await save("Save and log");

    await waitFor(() => expect(screen).toHavePathname("/log-entry"));
  });

  it("closes the editor after an edit to a saved Habit's Started date", async () => {
    pickDay(shiftDay(TODAY, -40));
    const { writes } = serve();

    await renderRouter(APP_DIR, { initialUrl: "/habits?edit=walk" });
    await userEvent.press(await screen.findByLabelText(`Started: ${MONTH_AGO}`));
    await save();

    await waitFor(() => expect(screen).toHavePathname("/habits"));
    expect(writes.map(({ body }) => body)).toEqual([
      expect.objectContaining({ id: "walk", startDate: shiftDay(TODAY, -40) }),
    ]);
  });

  it("opens History from Log a past day on a saved recurring Habit", async () => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: "/habit/walk" });

    const logPastDay = await screen.findByRole("button", { name: "Log a past day for Walk" });

    expect(within(logPastDay).getByText("Log a past day")).toBeOnTheScreen();

    await userEvent.press(logPastDay);

    expect(screen).toHavePathname("/habit/walk/history");
  });

  it.each(["/habit/portage", "/habit/new"])("has no Log a past day on %s", async (url) => {
    serve();
    await renderRouter(APP_DIR, { initialUrl: url });

    expect(await screen.findByLabelText("Name")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Log a past day/ })).not.toBeOnTheScreen();
  });
});
