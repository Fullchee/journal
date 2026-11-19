import { currentPeriod, type CloseDraft, type CloseSourcesBody } from "@/core";
import { QueryClient } from "@tanstack/react-query";
import { act, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";
import { router } from "expo-router";
import { Alert, Platform } from "react-native";

import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError } from "@/lib/api/errors";

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
import { fakeApi, pendingApi, reply, type Respond } from "../../jest/fake-api";

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

const QUARTER: CloseSourcesBody = {
  kind: "quarter",
  period: "2026-Q3",
  sources: [
    { kind: "week", period: "2026-W27", body: "Started sitting." },
    { kind: "month", period: "2026-07", body: null },
  ],
  signals: ["- Sleep: 80 nights, average 7h 10m"],
  goals: [
    { id: 1, title: "Cultivate Meditation", why: "Calm", habits: ["Sit"] },
    { id: 2, title: "Run", why: "", habits: [] },
  ],
  existing: null,
};

const YEAR: CloseSourcesBody = {
  ...QUARTER,
  kind: "year",
  period: "2026",
  sources: [{ kind: "quarter", period: "2026-Q1", body: "Winter." }],
  goals: [],
};

const PATH = "/api/close/quarter/2026-Q3";

function serve(sources: CloseSourcesBody, routes: Record<string, Respond> = {}) {
  return fakeApi({
    [PATH]: reply(sources),
    "/api/close/year/2026": reply(YEAR),
    [`PUT ${PATH}`]: reply({ id: 7, body: "saved" }),
    "PUT /api/close/year/2026": reply({ id: 8, body: "saved" }),
    ...routes,
  });
}

const open = (url = "/close-period?kind=quarter&period=2026-Q3") =>
  renderRouter(APP_DIR, { initialUrl: url });

const pressSave = () => userEvent.press(screen.getByRole("button", { name: "Save" }));

const answerConfirm = (choice: "Cancel" | "Replace" | "Discard") =>
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

it("shows the sources, notes the missing ones, and lists the signals", async () => {
  serve(QUARTER);
  await open();

  expect(
    within(await screen.findByTestId("source-2026-W27")).getByText("Started sitting."),
  ).toBeOnTheScreen();
  expect(screen.getByText("Not written: 2026-07")).toBeOnTheScreen();
  expect(screen.getByText("Sleep: 80 nights, average 7h 10m")).toBeOnTheScreen();
  expect(
    screen.getByText("What actually shifted this quarter, and which practice genuinely stuck?"),
  ).toBeOnTheScreen();
});

it("stops when the period has nothing written or logged", async () => {
  serve({ ...QUARTER, sources: [{ kind: "week", period: "2026-W27", body: null }], signals: [] });
  await open();

  expect(
    await screen.findByText("Nothing written or logged in 2026-Q3, so there is nothing to close."),
  ).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
});

it("with the AI failing, the sources stay and a hand-written close saves with a carry for each Goal", async () => {
  const { writes } = serve(QUARTER, {
    [`POST ${PATH}/draft`]: reply(new ApiError(503, { error: "draft unavailable" })),
  });

  await open();
  await screen.findByText("Started sitting.");

  await userEvent.press(screen.getByRole("button", { name: "Draft with AI" }));

  expect(
    await screen.findByText("The AI draft failed; write the close yourself below."),
  ).toBeOnTheScreen();
  expect(screen.getByText("Started sitting.")).toBeOnTheScreen();

  await userEvent.paste(screen.getByLabelText("Arc"), "A slow start.");
  await userEvent.paste(screen.getByLabelText("Closing answer"), "Sitting stuck.");
  await pressSave();

  expect(await screen.findByText("Saved")).toBeOnTheScreen();
  expect(writes.at(-1)).toEqual({
    path: PATH,
    method: "PUT",
    body: {
      arc: "A slow start.",
      answer: "Sitting stuck.",
      replace: false,
      newGoals: [],
      moves: [
        { goalId: 1, move: "carry", words: "" },
        { goalId: 2, move: "carry", words: "" },
      ],
    },
  });
});

it("fills the form from the draft, and the owner corrects a move before saving", async () => {
  const draft: CloseDraft = {
    arc: "Steady.",
    reviews: [
      { goalId: 1, review: "Most mornings.", move: "achieve", revision: "" },
      { goalId: 2, review: "Fewer runs.", move: "revise", revision: "Move daily" },
    ],
    newGoals: [],
  };

  const { writes } = serve(QUARTER, { [`POST ${PATH}/draft`]: reply(draft) });
  await open();
  await screen.findByText("Started sitting.");

  await userEvent.press(screen.getByRole("button", { name: "Draft with AI" }));

  expect(await screen.findByDisplayValue("Steady.")).toBeOnTheScreen();
  expect(screen.getByLabelText("Where Cultivate Meditation stands")).toHaveDisplayValue(
    "Most mornings.",
  );
  expect(screen.getByLabelText("New wording for Run")).toHaveDisplayValue("Move daily");

  await userEvent.paste(screen.getByLabelText("New wording for Run"), " ");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

  await userEvent.press(
    within(screen.getByLabelText("Move for Run")).getByRole("radio", { name: "Retire" }),
  );
  await pressSave();

  expect(await screen.findByText("Saved")).toBeOnTheScreen();
  expect(writes.at(-1)?.body).toMatchObject({
    moves: [
      { goalId: 1, move: "achieve", words: "Most mornings." },
      { goalId: 2, move: "retire", words: "Fewer runs." },
    ],
  });
});

it("asks before replacing a closed period; Cancel sends nothing", async () => {
  const alert = answerConfirm("Cancel");
  const { writes } = serve({ ...QUARTER, existing: { id: 4, body: "Old" } });
  await open();
  await screen.findByText("Started sitting.");

  expect(screen.getByRole("link", { name: /Open the saved close/ })).toBeOnTheScreen();
  await pressSave();

  await waitFor(() =>
    expect(alert).toHaveBeenCalledWith(
      "Replace the close?",
      "2026-Q3 is closed already. Replace its reflection?",
      expect.anything(),
      expect.anything(),
    ),
  );
  expect(writes).toEqual([]);
});

it("replaces a closed period once confirmed", async () => {
  answerConfirm("Replace");
  const { writes } = serve({ ...QUARTER, existing: { id: 4, body: "Old" } });
  await open();
  await screen.findByText("Started sitting.");

  await pressSave();

  expect(await screen.findByText("Saved")).toBeOnTheScreen();
  expect(writes.at(-1)?.body).toMatchObject({ replace: true });
});

it("asks before replacing a close saved elsewhere since the screen opened", async () => {
  answerConfirm("Replace");
  const reads = [QUARTER, { ...QUARTER, existing: { id: 4, body: "Elsewhere" } }];
  const puts: boolean[] = [];

  serve(QUARTER, {
    [PATH]: () => reads.shift() ?? null,
    [`PUT ${PATH}`]: ({ body }) => {
      // SAFETY: the screen only sends a CloseSave, whose replace is always set.
      const replace = (body as { replace: boolean }).replace;

      puts.push(replace);

      if (!replace) throw new ApiError(409, { error: "this period is closed already" });

      return { id: 4, body: "saved" };
    },
  });
  await open();
  await screen.findByText("Started sitting.");

  await pressSave();

  expect(await screen.findByText("Saved")).toBeOnTheScreen();
  expect(puts).toEqual([false, true]);
});

it("keeps a Goal title clash on screen without asking to replace", async () => {
  const alert = answerConfirm("Replace");

  serve(QUARTER, {
    [`PUT ${PATH}`]: reply(new ApiError(409, { error: "a Goal or close with that name exists" })),
  });
  await open();
  await screen.findByText("Started sitting.");

  await pressSave();

  expect(
    await screen.findByText("Couldn't save. Check the title isn't already a goal."),
  ).toBeOnTheScreen();
  expect(alert).not.toHaveBeenCalled();
});

it("a year close sends only the picked Goals, as edited", async () => {
  const draft: CloseDraft = {
    arc: "A year.",
    reviews: [],
    newGoals: [{ title: "Sleep by 11" }, { title: "Write" }],
  };

  const { writes } = serve(YEAR, { "POST /api/close/year/2026/draft": reply(draft) });
  await open("/close-period?kind=year&period=2026");
  await screen.findByText("Winter.");

  expect(screen.getByText("No Goals proposed. Draft to get some.")).toBeOnTheScreen();
  await userEvent.press(screen.getByRole("button", { name: "Draft with AI" }));
  await screen.findByDisplayValue("Sleep by 11");

  await userEvent.paste(screen.getByLabelText("Proposed Goal 2"), "Write weekly");
  await userEvent.press(screen.getByRole("checkbox", { name: "Pick proposed Goal 2" }));
  expect(screen.getByRole("checkbox", { name: "Pick proposed Goal 2" })).toBeChecked();
  await pressSave();

  expect(await screen.findByText("Saved")).toBeOnTheScreen();
  expect(writes.at(-1)?.body).toEqual(
    expect.objectContaining({ newGoals: [{ title: "Write weekly" }] }),
  );
});

it("switching rung opens the current year, and Next stops at the current period", async () => {
  const year = currentPeriod("year", new Date());

  fakeApi({
    [`/api/close/quarter/${currentPeriod("quarter", new Date())}`]: reply(QUARTER),
    [`/api/close/year/${year}`]: reply({ ...YEAR, period: year }),
  });
  await open("/close-period");

  await screen.findByText("Started sitting.");
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

  await userEvent.press(screen.getByRole("radio", { name: "Year" }));

  expect(await screen.findByText(year)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

  await userEvent.press(screen.getByRole("button", { name: "Prev" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

  await userEvent.press(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText(year)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});

it("says so when the period can't be read", async () => {
  fakeApi();
  await open();

  expect(await screen.findByText("Couldn't read the period. Try again.")).toBeOnTheScreen();
});

it("waits for a connection to read the period offline", async () => {
  pendingApi();
  setOnline(false);
  await open();

  expect(await screen.findByText("Closing a period needs a connection.")).toBeOnTheScreen();
});

it("disables Save and says why when the connection drops", async () => {
  serve(QUARTER);
  await open();
  await screen.findByText("Started sitting.");

  await act(() => setOnline(false));

  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getByText("Saving needs a connection.")).toBeOnTheScreen();
});

it("sizes the Arc and answer boxes on web", async () => {
  jest.replaceProperty(Platform, "OS", "web");
  serve(QUARTER);
  await open();

  expect(await screen.findByLabelText("Arc")).toBeOnTheScreen();
  expect(screen.getByLabelText("Closing answer")).toBeOnTheScreen();
});

it("shows Drafting… while the AI writes", async () => {
  serve(QUARTER);
  const answer = jest.mocked(apiFetch).getMockImplementation();

  jest
    .mocked(apiFetch)
    .mockImplementation((path, init, schema) =>
      init.method === "POST" && path.endsWith("/draft")
        ? Promise.withResolvers<never>().promise
        : (answer?.(path, init, schema) ?? Promise.resolve(undefined)),
    );
  await open();
  await screen.findByText("Started sitting.");

  await userEvent.press(screen.getByRole("button", { name: "Draft with AI" }));

  expect(await screen.findByRole("button", { name: "Drafting…" })).toBeDisabled();
});

it("keeps a Goal the draft doesn't mention, and saves a revised wording", async () => {
  const draft: CloseDraft = {
    arc: "Steady.",
    reviews: [{ goalId: 2, review: "Fewer runs.", move: "revise", revision: "Move daily" }],
    newGoals: [],
  };

  const { writes } = serve(QUARTER, { [`POST ${PATH}/draft`]: reply(draft) });
  await open();
  await screen.findByText("Started sitting.");

  await userEvent.press(screen.getByRole("button", { name: "Draft with AI" }));
  await screen.findByDisplayValue("Steady.");
  await pressSave();

  expect(await screen.findByText("Saved")).toBeOnTheScreen();
  expect(writes.at(-1)?.body).toMatchObject({
    moves: [
      { goalId: 1, move: "carry", words: "" },
      { goalId: 2, move: "revise", revision: "Move daily", words: "Fewer runs." },
    ],
  });
});

it("sends nothing when Cancel answers the ask to replace a close saved elsewhere", async () => {
  answerConfirm("Cancel");
  const reads = [QUARTER, { ...QUARTER, existing: { id: 4, body: "Elsewhere" } }];

  const { writes } = serve(QUARTER, {
    [PATH]: () => reads.shift() ?? null,
    [`PUT ${PATH}`]: reply(new ApiError(409, { error: "this period is closed already" })),
  });

  await open();
  await screen.findByText("Started sitting.");
  await pressSave();

  await waitFor(() => expect(reads).toHaveLength(0));
  expect(writes).toHaveLength(1);
  expect(screen.queryByText("Saved")).toBeNull();
});

it("shows a failed save and doesn't look for a close saved elsewhere", async () => {
  const alert = answerConfirm("Replace");
  serve(QUARTER, { [`PUT ${PATH}`]: reply(new ApiError(500, { error: "boom" })) });
  await open();
  await screen.findByText("Started sitting.");
  await pressSave();

  expect(
    await screen.findByText("Couldn't save. Your text is still here; try again."),
  ).toBeOnTheScreen();
  expect(alert).not.toHaveBeenCalled();
});

it("after a save, editing again starts from the Goals still active", async () => {
  const reads = [
    QUARTER,
    { ...QUARTER, goals: QUARTER.goals.slice(1), existing: { id: 7, body: "saved" } },
  ];

  answerConfirm("Replace");
  const { writes } = serve(QUARTER, { [PATH]: () => reads.shift() ?? null });

  await open();
  await screen.findByText("Started sitting.");
  await userEvent.press(
    within(screen.getByLabelText("Move for Cultivate Meditation")).getByRole("radio", {
      name: "Achieve",
    }),
  );
  await pressSave();

  expect(await screen.findByText("Saved")).toBeOnTheScreen();
  expect(screen.getByRole("link", { name: /Open the 2026-Q3 close/ })).toBeOnTheScreen();

  await userEvent.press(screen.getByRole("button", { name: "Edit the close" }));
  await screen.findByText("Started sitting.");

  expect(screen.queryByText("Cultivate Meditation")).toBeNull();
  await pressSave();

  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]?.body).toEqual(
    expect.objectContaining({ replace: true, moves: [{ goalId: 2, move: "carry", words: "" }] }),
  );
});

it("does not resend a clashing save when the Goals changed since the screen opened", async () => {
  const alert = answerConfirm("Replace");

  const reads = [
    QUARTER,
    { ...QUARTER, goals: QUARTER.goals.slice(1), existing: { id: 4, body: "Elsewhere" } },
  ];

  const { writes } = serve(QUARTER, {
    [PATH]: () => (reads.length > 1 ? reads.shift() : reads[0]) ?? null,
    [`PUT ${PATH}`]: reply(new ApiError(409, { error: "this period is closed already" })),
  });

  await open();
  await screen.findByText("Started sitting.");
  await userEvent.paste(screen.getByLabelText("Where Run stands"), "Twice a week.");
  await pressSave();

  expect(
    await screen.findByText(
      "The Goals changed while you wrote. The Goal review now lists the current Goals: check it, then save again.",
    ),
  ).toBeOnTheScreen();
  expect(alert).not.toHaveBeenCalled();
  expect(writes).toHaveLength(1);
  await waitFor(() =>
    expect(screen.getByRole("link", { name: /Open the saved close/ })).toBeOnTheScreen(),
  );
  expect(screen.queryByLabelText("Where Cultivate Meditation stands")).toBeNull();
  expect(screen.getByLabelText("Where Run stands")).toHaveDisplayValue("Twice a week.");
});

const leave = () => act(() => router.replace("/session-brief"));

describe("drafts", () => {
  it("keeps what was typed across Prev, Next and a rung change", async () => {
    serve(QUARTER, { "/api/close/quarter/2026-Q2": reply({ ...QUARTER, period: "2026-Q2" }) });
    await open();
    await screen.findByText("Started sitting.");

    await userEvent.paste(screen.getByLabelText("Arc"), "A slow start.");
    await userEvent.press(screen.getByRole("button", { name: "Prev" }));
    await screen.findByText("2026-Q2");
    expect(await screen.findByLabelText("Arc")).toHaveDisplayValue("");

    await userEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByLabelText("Arc")).toHaveDisplayValue("A slow start.");
  });

  it("asks before Back drops a typed close, and stays on Cancel", async () => {
    const alert = answerConfirm("Cancel");

    serve(QUARTER);
    await open();
    await screen.findByText("Started sitting.");
    await userEvent.paste(screen.getByLabelText("Closing answer"), "Sitting stuck.");

    await leave();

    expect(alert).toHaveBeenCalledWith(
      "Discard edits?",
      "The close you wrote is not saved.",
      expect.any(Array),
      expect.any(Object),
    );
    expect(screen).toHavePathname("/close-period");
    expect(screen.getByLabelText("Closing answer")).toHaveDisplayValue("Sitting stuck.");
  });

  it("leaves once Discard is chosen", async () => {
    answerConfirm("Discard");
    serve(QUARTER);
    await open();
    await screen.findByText("Started sitting.");
    await userEvent.paste(screen.getByLabelText("Closing answer"), "Sitting stuck.");

    await leave();

    await waitFor(() => expect(screen).toHavePathname("/session-brief"));
  });

  it("leaves without asking once the typed text is cleared again", async () => {
    const alert = jest.spyOn(Alert, "alert");

    serve(QUARTER);
    await open();
    await screen.findByText("Started sitting.");
    await userEvent.paste(screen.getByLabelText("Where Run stands"), "x");
    await userEvent.paste(screen.getByLabelText("Where Run stands"), "");

    await leave();

    await waitFor(() => expect(screen).toHavePathname("/session-brief"));
    expect(alert).not.toHaveBeenCalled();
  });

  it("asks before the AI draft replaces typed text, and keeps it on Cancel", async () => {
    const alert = answerConfirm("Cancel");
    const { writes } = serve(QUARTER, { [`POST ${PATH}/draft`]: reply(null) });

    await open();
    await screen.findByText("Started sitting.");
    await userEvent.paste(screen.getByLabelText("Where Run stands"), "Twice a week.");
    await userEvent.press(screen.getByRole("button", { name: "Draft with AI" }));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Replace your text?",
        expect.any(String),
        expect.any(Array),
        expect.any(Object),
      ),
    );
    expect(writes).toEqual([]);
    expect(screen.getByLabelText("Where Run stands")).toHaveDisplayValue("Twice a week.");
  });

  it("replaces typed text with the AI draft once confirmed, keeping the closing answer", async () => {
    answerConfirm("Replace");

    const draft: CloseDraft = {
      arc: "Steady.",
      reviews: [{ goalId: 1, review: "Most mornings.", move: "carry", revision: "" }],
      newGoals: [],
    };

    serve(YEAR, { "POST /api/close/year/2026/draft": reply(draft) });
    await open("/close-period?kind=year&period=2026");
    await screen.findByText("Winter.");
    await userEvent.paste(screen.getByLabelText("Arc"), "Mine.");
    await userEvent.paste(screen.getByLabelText("Closing answer"), "Kept.");
    await userEvent.press(screen.getByRole("button", { name: "Draft with AI" }));

    expect(await screen.findByDisplayValue("Steady.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Closing answer")).toHaveDisplayValue("Kept.");
  });

  it("asks before the AI draft replaces a picked Goal", async () => {
    const alert = answerConfirm("Cancel");

    const draft: CloseDraft = { arc: "", reviews: [], newGoals: [{ title: "Write weekly" }] };

    serve(YEAR, { "POST /api/close/year/2026/draft": reply(draft) });
    await open("/close-period?kind=year&period=2026");
    await screen.findByText("Winter.");
    await userEvent.press(screen.getByRole("button", { name: "Draft with AI" }));
    await userEvent.press(await screen.findByRole("checkbox", { name: "Pick proposed Goal 1" }));
    await userEvent.press(screen.getByRole("button", { name: "Draft with AI" }));

    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
  });
});
