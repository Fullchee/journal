import { QueryClient, QueryClientProvider, dehydrate } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { BriefBody, BriefRow } from "@/core";
import { Share } from "react-native";

import SessionBriefScreen from "@/app/session-brief";
import { apiFetch } from "@/lib/api/api-fetch";
import type * as DataProvider from "@/lib/data/data-provider";
import { ApiError } from "@/lib/api/errors";
import type { WindowBody } from "@/lib/data/session-brief";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { resetRouteMocks, setOnline } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, pendingApi, reply } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../jest/android-picker";

// The real predicate needs the persister's storage; the rule is the same: only `persist` queries are stored.
jest.mock("@/lib/data/data-provider", () => ({
  ...jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockDataProvider(),
  shouldPersistQuery: jest.requireActual<typeof DataProvider>("@/lib/data/data-provider")
    .shouldPersistQuery,
}));

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const mockWindow = { width: 390 };

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWindow.width, height: 900, scale: 1, fontScale: 1 }),
}));

const WINDOW: WindowBody = {
  start: "2026-11-01",
  calendar: "found",
  today: "2026-11-07",
  coach: "Dr. Rao",
};

const ROW: BriefRow = {
  day: "2026-11-03",
  time: "9:15 AM",
  zone: "Rain",
  score: 3,
  where: "Home",
  doing: "Work",
  onMyMind: "Deadline",
  note: "",
  tense: "A lot",
  low: "",
  tired: "A lot",
  tiredButWired: true,
};

const BRIEF: BriefBody = {
  facts: {
    start: "2026-11-01",
    end: "2026-11-07",
    rows: [ROW],
    sleep: [],
    lows: [ROW],
    highs: [],
    habits: [{ name: "Walk", days: 2 }],
    oneOffs: [],
    skips: [],
  },
  prose: { summary: "A slow week.", patterns: ["Low on workdays"], toRaise: "Sleep." },
};

const briefRoutes = ({
  lastSession = WINDOW,
  brief = BRIEF,
}: {
  lastSession?: WindowBody;
  brief?: BriefBody | Error;
}) => ({
  "/api/session-brief-window": reply(lastSession),
  "/api/session-brief": reply(brief),
});

// Each render gets a fresh client; the holder lets tests and cleanup reach it.
const rendered = { client: new QueryClient() };

async function renderBrief() {
  rendered.client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={rendered.client}>
      <SessionBriefScreen />
    </QueryClientProvider>,
  );
}

const rewriteBrief = () => userEvent.press(screen.getByRole("button", { name: "Rewrite brief" }));

beforeEach(() => {
  mockWindow.width = 390;
  jest.mocked(apiFetch).mockReset();
});

afterEach(() => {
  rendered.client.unmount();
  rendered.client.clear();
  resetRouteMocks();
});

it("starts at the last session and says where the date came from", async () => {
  fakeApi(briefRoutes({}));
  await renderBrief();

  expect(await screen.findByLabelText("Since: 2026-11-01")).toBeOnTheScreen();
  expect(screen.getByText(/Starts at your last session with Dr\. Rao/)).toBeOnTheScreen();
});

it("asks to reconnect the calendar as an alert", async () => {
  fakeApi(
    briefRoutes({ lastSession: { ...WINDOW, calendar: "not-connected", start: "2026-10-31" } }),
  );
  await renderBrief();

  expect(await screen.findByRole("alert")).toHaveTextContent(/reconnect it/);
});

it("writes the brief on open from the last session, one card per Check-in on a phone", async () => {
  fakeApi(briefRoutes({}));
  await renderBrief();
  await screen.findByLabelText("Since: 2026-11-01");

  expect(apiFetch).toHaveBeenCalledWith(
    "/api/session-brief?start=2026-11-01",
    expect.anything(),
    expect.anything(),
  );
  expect(await screen.findByText(/A slow week/)).toBeOnTheScreen();
  expect(screen.getByText("Where: Home")).toBeOnTheScreen();
  expect(screen.getByText("• Walk: 2 days")).toBeOnTheScreen();
  expect(screen.getByText("• Tense: A lot on 1 of 1 Check-in")).toBeOnTheScreen();
  expect(
    screen.getByText("• Tired but wired (Tense and Tired both A lot): 1 Check-in"),
  ).toBeOnTheScreen();
  expect(screen.queryByText("On my mind")).toBeNull();
  expect(screen.queryByText("Skips")).toBeNull();
});

it("leaves out Tense, Low and Tired when no Check-in answered them", async () => {
  const unanswered = { ...ROW, tense: "", tired: "", tiredButWired: false } as const;
  fakeApi(briefRoutes({ brief: { ...BRIEF, facts: { ...BRIEF.facts, rows: [unanswered] } } }));
  await renderBrief();
  await screen.findByLabelText("Since: 2026-11-01");

  expect(await screen.findByText(/A slow week/)).toBeOnTheScreen();
  expect(screen.queryByText("Tense, Low and Tired")).toBeNull();
});

it("lists Skips with avoidance flagged", async () => {
  const skip = {
    name: "Run",
    date: "2026-11-04",
    cause: "avoidance",
    note: "tired",
    flagged: true,
  } as const;

  fakeApi(briefRoutes({ brief: { ...BRIEF, facts: { ...BRIEF.facts, skips: [skip] } } }));
  await renderBrief();
  await screen.findByLabelText("Since: 2026-11-01");

  expect(
    await screen.findByText("• 2026-11-04 Run: avoidance (flagged) “tired”"),
  ).toBeOnTheScreen();
});

it("shows Day by day as a table on a wide screen", async () => {
  mockWindow.width = 1024;
  fakeApi(briefRoutes({}));
  await renderBrief();
  await screen.findByLabelText("Since: 2026-11-01");

  expect(await screen.findByText("On my mind")).toBeOnTheScreen();
  expect(screen.getByText("Rain (3)")).toBeOnTheScreen();
});

it("says writing the brief needs a connection when offline", async () => {
  setOnline(false);
  pendingApi();
  await renderBrief();

  expect(screen.getByText("Writing the brief needs a connection.")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Rewrite brief" })).toBeDisabled();
});

it("says so when the brief fails", async () => {
  fakeApi(briefRoutes({ brief: new ApiError(502, null) }));
  await renderBrief();
  await screen.findByLabelText("Since: 2026-11-01");

  expect(await screen.findByText("Couldn't write the brief. Try again.")).toBeOnTheScreen();
});

it("shares the brief as Markdown text", async () => {
  const share = jest
    .spyOn(Share, "share")
    .mockResolvedValue({ action: "sharedAction", activityType: undefined });

  fakeApi(briefRoutes({}));
  await renderBrief();
  await screen.findByLabelText("Since: 2026-11-01");
  await screen.findByText(/A slow week/);

  await userEvent.press(screen.getByRole("button", { name: "Share" }));

  const message: unknown = expect.stringContaining("# Session brief: 2026-11-01 to 2026-11-07");

  expect(share).toHaveBeenCalledWith({ message });
});

it("shows the night before a Low on screen and in the shared Markdown", async () => {
  const share = jest
    .spyOn(Share, "share")
    .mockResolvedValue({ action: "sharedAction", activityType: undefined });

  const storm: BriefRow = { ...ROW, day: "2026-11-10", zone: "Storm", score: 1, onMyMind: "" };
  const line = "2026-11-10 9:15 AM, Storm, Home, Work · after 5.2h sleep";

  fakeApi(
    briefRoutes({
      brief: {
        ...BRIEF,
        facts: {
          ...BRIEF.facts,
          rows: [storm],
          lows: [storm],
          sleep: [{ date: "2026-11-10", durationMin: 310, sleepScore: 41 }],
        },
      },
    }),
  );
  await renderBrief();
  await screen.findByLabelText("Since: 2026-11-01");

  expect(await screen.findByText(`• ${line}`)).toBeOnTheScreen();

  await userEvent.press(screen.getByRole("button", { name: "Share" }));

  const message: unknown = expect.stringContaining(`## Lows\n\n- ${line}\n`);

  expect(share).toHaveBeenCalledWith({ message });
});

it("writes the brief again from the same date", async () => {
  fakeApi(briefRoutes({}));
  await renderBrief();
  await screen.findByLabelText("Since: 2026-11-01");
  await screen.findByText(/A slow week/);

  await rewriteBrief();

  await waitFor(() =>
    expect(
      jest.mocked(apiFetch).mock.calls.filter(([path]) => path.startsWith("/api/session-brief?")),
    ).toHaveLength(2),
  );
});

it("starts a week back and says so when the last session can't be found", async () => {
  fakeApi({ ...briefRoutes({}), "/api/session-brief-window": reply(new ApiError(502, null)) });
  await renderBrief();

  expect(
    await screen.findByText("Couldn't look up your last session, so this covers the last 7 days."),
  ).toBeOnTheScreen();
});

it("says so when the brief can't be shared", async () => {
  jest.spyOn(Share, "share").mockRejectedValue(new Error("no share sheet"));
  fakeApi(briefRoutes({}));
  await renderBrief();
  await screen.findByLabelText("Since: 2026-11-01");
  await screen.findByText(/A slow week/);

  await userEvent.press(screen.getByRole("button", { name: "Share" }));

  expect(await screen.findByText("Couldn't share the brief.")).toBeOnTheScreen();
});

it("never stores the brief and drops it on leaving", async () => {
  const { shouldPersistQuery } = jest.requireMock<typeof DataProvider>("@/lib/data/data-provider");
  fakeApi(briefRoutes({}));
  const view = await renderBrief();
  await screen.findByLabelText("Since: 2026-11-01");
  await screen.findByText(/A slow week/);

  const persisted = dehydrate(rendered.client, {
    shouldDehydrateQuery: shouldPersistQuery,
  }).queries;

  expect(persisted.map((query) => query.queryKey)).toEqual([]);

  await view.unmount();

  await waitFor(() =>
    expect(rendered.client.getQueryCache().findAll({ queryKey: ["session-brief"] })).toEqual([]),
  );
});

const briefCalls = () =>
  jest
    .mocked(apiFetch)
    .mock.calls.map(([path]) => path)
    .filter((path) => path.startsWith("/api/session-brief?"));

it("rewrites the brief from a new date", async () => {
  pickOnAndroid(new Date(2026, 10, 4));
  fakeApi(briefRoutes({}));
  await renderBrief();
  await screen.findByText(/A slow week/);

  await userEvent.press(screen.getByLabelText("Since: 2026-11-01"));
  await rewriteBrief();

  await waitFor(() =>
    expect(briefCalls()).toEqual([
      "/api/session-brief?start=2026-11-01",
      "/api/session-brief?start=2026-11-04",
    ]),
  );
});

const saveBrief = async () => {
  await screen.findByText(/A slow week/);
  await userEvent.press(screen.getByRole("button", { name: "Save as Health record" }));
};

it("saves the brief as a Health record named for its window, then links to it", async () => {
  const { writes } = fakeApi({
    ...briefRoutes({}),
    "POST /api/notes/health-records": reply({ id: 12 }),
  });

  await renderBrief();
  await saveBrief();
  const markdown: unknown = expect.stringContaining("# Session brief: 2026-11-01 to 2026-11-07");

  expect(
    await screen.findByText("Saved as the Health record “Session brief, Nov 1 to Nov 7”."),
  ).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Save as Health record" })).toBeDisabled();
  expect(screen.getByText("Open the Health record")).toBeOnTheScreen();
  expect(writes).toEqual([
    {
      path: "/api/notes/health-records",
      method: "POST",
      body: {
        title: "Session brief, Nov 1 to Nov 7",
        body: markdown,
      },
    },
  ]);
});

it("says a Health record with the brief's title exists", async () => {
  fakeApi({
    ...briefRoutes({}),
    "POST /api/notes/health-records": reply(new ApiError(409, null)),
  });

  await renderBrief();
  await saveBrief();

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't save: a Health record named “Session brief, Nov 1 to Nov 7” exists.",
  );
});

it("says so when saving the brief fails", async () => {
  fakeApi({
    ...briefRoutes({}),
    "POST /api/notes/health-records": reply(new ApiError(500, null)),
  });

  await renderBrief();
  await saveBrief();

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save the brief. Try again.");
});

it("can't save the brief offline", async () => {
  fakeApi(briefRoutes({}));
  await renderBrief();
  await screen.findByText(/A slow week/);

  await act(() => setOnline(false));

  expect(screen.getByRole("button", { name: "Save as Health record" })).toBeDisabled();
});
