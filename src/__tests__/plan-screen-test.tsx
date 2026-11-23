import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, within } from "@testing-library/react-native";
import { planActionTask, type PlanTask } from "@/core";

import PlanScreen from "@/app/plan";
import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError, NetworkError } from "@/lib/api/errors";
import { BlocksResult, type BusyBody, type PlanBody } from "@/lib/data/plan";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { resetRouteMocks, setOnline } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { scrollableAround } from "../../jest/scrollable";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, pendingApi, reply } from "../../jest/fake-api";

jest.mock("@/lib/data/data-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockDataProvider(),
);

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockUniwind(),
);

const task = (id: string, content: string): PlanTask => ({
  id,
  content,
  projectId: "personal-project",
  sectionId: null,
  priority: 1,
  dueDate: "2026-11-07",
  labels: [],
  source: "todoist",
});

const PLAN: PlanBody = {
  zone: "Rain",
  reminders: "- Walk outside",
  tasks: [task("1", "Laundry"), task("2", "Old idea")],
  workPlan: [],
  proposals: {
    "1": { disposition: "keep", reason: "Due today", minutes: 45 },
    "2": { disposition: "keep", reason: "Stale", minutes: 30 },
  },
};

interface Answers {
  plan?: PlanBody | Error;
  busy?: BusyBody | Error;
  triage?: Error | { postponed: number; dropped: number };
  blocks?: BlocksResult | Error;
}

const planRoutes = ({
  plan = PLAN,
  busy = { status: "ok", busy: [] },
  triage,
  blocks,
}: Answers) => ({
  "/api/plan/tasks": reply(plan),
  "/api/plan/busy": reply(busy),
  "POST /api/plan/triage": reply(triage),
  "POST /api/plan/blocks": reply(blocks ?? { status: "ok", events: 1, tasks: 1 }),
});

// Each render gets a fresh client; the holder lets cleanup reach it.
const rendered = { client: new QueryClient() };

async function renderPlan() {
  rendered.client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  await render(
    <QueryClientProvider client={rendered.client}>
      <PlanScreen />
    </QueryClientProvider>,
  );
}

const press = (name: string | RegExp) => userEvent.press(screen.getByRole("button", { name }));

const chooseForOldIdea = (option: string) =>
  userEvent.press(
    within(screen.getByLabelText("Disposition for Old idea")).getByRole("radio", { name: option }),
  );

beforeEach(() => jest.mocked(apiFetch).mockReset());

afterEach(() => {
  rendered.client.unmount();
  rendered.client.clear();
  resetRouteMocks();
});

it("says planning needs a connection when offline", async () => {
  setOnline(false);
  // Offline, TanStack pauses the fetch, so it never settles.
  pendingApi();

  await renderPlan();

  expect(screen.getByText("Planning needs a connection.")).toBeOnTheScreen();
});

it("shows placeholder rows while the tasks load", async () => {
  pendingApi();

  await renderPlan();

  expect(screen.getByRole("progressbar", { name: "Reading your tasks…" })).toBeOnTheScreen();
});

it("retries a server error once before showing it", async () => {
  fakeApi(planRoutes({ plan: new ApiError(500, null) }));

  await renderPlan();
  await screen.findByText("Couldn't load your tasks.");

  expect(
    jest.mocked(apiFetch).mock.calls.filter(([path]) => path.startsWith("/api/plan/tasks")),
  ).toHaveLength(2);
});

it("shows a refusal at once, without retrying", async () => {
  fakeApi(planRoutes({ plan: new ApiError(403, null) }));

  await renderPlan();
  await screen.findByText("Couldn't load your tasks.");

  expect(
    jest.mocked(apiFetch).mock.calls.filter(([path]) => path.startsWith("/api/plan/tasks")),
  ).toHaveLength(1);
});

it("says so when nothing is due", async () => {
  fakeApi(planRoutes({ plan: { ...PLAN, tasks: [] } }));

  await renderPlan();

  expect(await screen.findByText("Nothing overdue, today or tomorrow.")).toBeOnTheScreen();
  expect(screen.getByText("Rain: reach for")).toBeOnTheScreen();
});

it("renders the reach-for reminders as Markdown", async () => {
  fakeApi(planRoutes({ plan: PLAN }));

  await renderPlan();

  expect(
    within(await screen.findByTestId("reach-for")).getByText("- Walk outside"),
  ).toBeOnTheScreen();
});

it("renders task names as Markdown and labels them in plain text", async () => {
  const name = "**Call** the [GP](https://example.com)";

  fakeApi(
    planRoutes({
      plan: { ...PLAN, reminders: "", tasks: [task("3", name)], proposals: null },
      triage: { postponed: 0, dropped: 0 },
    }),
  );
  await renderPlan();

  expect(within(await screen.findByTestId("triage-3")).getByText(name)).toBeOnTheScreen();
  expect(screen.getByLabelText("Disposition for Call the GP")).toBeOnTheScreen();
  await press("Confirm triage");

  expect(within(await screen.findByTestId("block-task-3")).getByText(name)).toBeOnTheScreen();
  expect(screen.getByLabelText("Minutes for Call the GP")).toBeOnTheScreen();
  expect(
    within(await screen.findByLabelText("Day timeline")).getByText(/Call the GP$/),
  ).toBeOnTheScreen();
});

it("offers a retry when the tasks fail to load", async () => {
  fakeApi(planRoutes({ plan: new ApiError(500, null) }));

  await renderPlan();

  expect(await screen.findByText("Couldn't load your tasks.")).toBeOnTheScreen();
});

it("tries the tasks again when asked", async () => {
  fakeApi(planRoutes({ plan: new ApiError(500, null) }));
  await renderPlan();
  await screen.findByText("Couldn't load your tasks.");

  fakeApi(planRoutes({}));
  await press("Try again");

  expect(await screen.findByText("- Walk outside")).toBeOnTheScreen();
});

it("says planning needs a connection when it drops mid-plan", async () => {
  fakeApi(planRoutes({}));
  await renderPlan();
  await screen.findByText("- Walk outside");

  await act(() => setOnline(false));

  expect(screen.getByText("Planning needs a connection.")).toBeOnTheScreen();
});

it("shows no reach-for section when there are no reminders and nothing is due", async () => {
  fakeApi(planRoutes({ plan: { ...PLAN, reminders: "", tasks: [] } }));

  await renderPlan();

  expect(await screen.findByText("Nothing overdue, today or tomorrow.")).toBeOnTheScreen();
  expect(screen.queryByText("Rain: reach for")).toBeNull();
});

// Answers every request as the fake does, except a POST to `path`, which never settles.
function holdPost(path: string) {
  const answer = jest.mocked(apiFetch).getMockImplementation();

  jest
    .mocked(apiFetch)
    .mockImplementation((requested, init, schema) =>
      requested === path && init.method === "POST"
        ? Promise.withResolvers<never>().promise
        : (answer?.(requested, init, schema) ?? Promise.resolve(undefined)),
    );
}

it("shows the triage saving while Todoist answers", async () => {
  fakeApi(planRoutes({ plan: { ...PLAN, reminders: "" } }));
  holdPost("/api/plan/triage");
  await renderPlan();
  await screen.findByText("Laundry");
  await chooseForOldIdea("Drop");

  await press("Confirm triage");

  expect(await screen.findByRole("button", { name: "Saving to Todoist…" })).toBeDisabled();
});

it("shows the blocks writing while the calendar answers", async () => {
  fakeApi(planRoutes({ plan: { ...PLAN, reminders: "" } }));
  holdPost("/api/plan/blocks");
  await renderPlan();
  await screen.findByText("Laundry");
  await press("Confirm triage");
  await screen.findByLabelText("Day timeline");

  await press("Confirm and write to calendar");

  expect(
    await screen.findByRole("button", { name: "Writing to Google Calendar and Todoist…" }),
  ).toBeDisabled();
});

it("walks reach for, triage and blocks, writing each confirmed step", async () => {
  fakeApi(planRoutes({ triage: { postponed: 0, dropped: 1 } }));
  await renderPlan();

  expect(await screen.findByText("- Walk outside")).toBeOnTheScreen();
  await press("Next");

  expect(screen.getByText(/Due today/)).toBeOnTheScreen();
  await chooseForOldIdea("Drop");
  await press("Confirm triage");

  const triage: unknown = expect.objectContaining({ postpone: [], drop: ["2"] });

  expect(apiFetch).toHaveBeenCalledWith("/api/plan/triage", { method: "POST", body: triage });
  expect(await screen.findByLabelText("Day timeline")).toBeOnTheScreen();
  expect(screen.getByLabelText("Minutes for Laundry")).toHaveDisplayValue("45");
  expect(screen.queryByLabelText("Minutes for Old idea")).toBeNull();

  await press("Confirm and write to calendar");

  const blocks: unknown = expect.objectContaining({
    blocks: [expect.objectContaining({ taskIds: ["1"] })],
  });

  expect(apiFetch).toHaveBeenCalledWith(
    "/api/plan/blocks",
    { method: "POST", body: blocks },
    BlocksResult,
  );
  expect(await screen.findByText(/Done\. The blocks are on your calendar/)).toBeOnTheScreen();
});

it("skips the triage write when every task is kept", async () => {
  fakeApi(planRoutes({ plan: { ...PLAN, reminders: "" } }));
  await renderPlan();

  await screen.findByText("Laundry");
  await press("Confirm triage");

  expect(await screen.findByLabelText("Day timeline")).toBeOnTheScreen();
  expect(apiFetch).not.toHaveBeenCalledWith("/api/plan/triage", expect.anything());
});

it("keeps the choices when Todoist refuses the triage", async () => {
  fakeApi(
    planRoutes({
      plan: { ...PLAN, reminders: "", proposals: null },
      triage: new ApiError(502, null),
    }),
  );
  await renderPlan();

  expect(await screen.findByText(/every task starts on keep/)).toBeOnTheScreen();
  await chooseForOldIdea("Postpone");
  await press("Confirm triage");

  expect(await screen.findByText(/Couldn't update Todoist/)).toBeOnTheScreen();
  expect(
    within(screen.getByLabelText("Disposition for Old idea")).getByRole("radio", {
      name: "Postpone",
    }),
  ).toBeChecked();
});

it("says the calendar needs reconnecting and checks again on request", async () => {
  fakeApi(planRoutes({ plan: { ...PLAN, reminders: "" }, busy: { status: "not-connected" } }));
  await renderPlan();

  await screen.findByText("Laundry");
  await press("Confirm triage");

  expect(await screen.findByText(/Google Calendar isn't connected/)).toBeOnTheScreen();
  fakeApi(planRoutes({ plan: { ...PLAN, reminders: "" } }));
  await press("Check calendar again");

  expect(await screen.findByLabelText("Day timeline")).toBeOnTheScreen();
});

it("keeps the estimates when the blocks fail to write", async () => {
  fakeApi(planRoutes({ plan: { ...PLAN, reminders: "" }, blocks: new NetworkError(null) }));
  await renderPlan();

  await screen.findByText("Laundry");
  await press("Confirm triage");
  await screen.findByLabelText("Day timeline");
  await userEvent.paste(screen.getByLabelText("Minutes for Laundry"), "20");
  await press("Confirm and write to calendar");

  expect(await screen.findByText(/Couldn't write the blocks/)).toBeOnTheScreen();
  expect(screen.getByLabelText("Minutes for Laundry")).toHaveDisplayValue("20");
});

it("takes the first tap beside a Minutes field while the keyboard is open", async () => {
  fakeApi(planRoutes({ plan: { ...PLAN, reminders: "" } }));
  await renderPlan();

  await screen.findByText("Laundry");
  await press("Confirm triage");

  expect(scrollableAround(await screen.findByLabelText("Minutes for Laundry"))).toHaveProp(
    "keyboardShouldPersistTaps",
    "handled",
  );
});

it("shows a calendar failure from the write in place of the timeline", async () => {
  fakeApi(planRoutes({ plan: { ...PLAN, reminders: "" }, blocks: { status: "unreachable" } }));
  await renderPlan();

  await screen.findByText("Laundry");
  await press("Confirm triage");
  await screen.findByLabelText("Day timeline");
  await press("Confirm and write to calendar");

  expect(await screen.findByText(/Google Calendar didn't answer/)).toBeOnTheScreen();
});

it("says so when the busy times fail to load", async () => {
  fakeApi(planRoutes({ plan: { ...PLAN, reminders: "" }, busy: new NetworkError(null) }));
  await renderPlan();

  await screen.findByText("Laundry");
  await press("Confirm triage");

  expect(screen.getByRole("progressbar", { name: "Reading your calendar…" })).toBeOnTheScreen();
  expect(await screen.findByText("Couldn't reach the app. Try again.")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Check calendar again" })).toBeOnTheScreen();
});

it("has nothing to block when every task is dropped", async () => {
  fakeApi(planRoutes({ plan: { ...PLAN, reminders: "", tasks: [task("2", "Old idea")] } }));
  await renderPlan();

  await screen.findByText("Old idea");
  await chooseForOldIdea("Drop");
  await press("Confirm triage");

  expect(await screen.findByText("No tasks kept, so nothing to block.")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Confirm and write to calendar" })).toBeNull();
});

describe("the Work Plan", () => {
  // 09:00 on a Monday in Toronto, so the plan targets a workday with job hours left.
  beforeEach(() => jest.setSystemTime(new Date("2026-11-09T14:00:00Z")));

  const merge = planActionTask(
    { id: "merge:web#1", kind: "merge", ticket: "APP-7", pr: "web#1", url: null, title: "Search" },
    "2026-11-09",
  );

  it("asks for the planned day and blocks its actions without triaging them", async () => {
    fakeApi(planRoutes({ plan: { ...PLAN, tasks: [], workPlan: [merge] } }));
    await renderPlan();

    await screen.findByText("- Walk outside");
    await press("Next");

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/plan/tasks?day=2026-11-09",
      expect.anything(),
      expect.anything(),
    );
    expect(screen.queryByText("2. Triage")).toBeNull();
    expect(screen.getByLabelText("Minutes for Merge web#1: APP-7 Search")).toHaveDisplayValue("30");
    await screen.findByLabelText("Day timeline");
    await press("Confirm and write to calendar");

    const blocks: unknown = expect.objectContaining({
      blocks: [expect.objectContaining({ taskIds: [] })],
    });

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/plan/blocks",
      { method: "POST", body: blocks },
      BlocksResult,
    );
  });

  it("joins the kept Todoist tasks in the Blocks step", async () => {
    fakeApi(planRoutes({ plan: { ...PLAN, reminders: "", workPlan: [merge] } }));
    await renderPlan();

    await screen.findByText("Laundry");
    expect(screen.queryByTestId("triage-merge:web#1")).toBeNull();
    await press("Confirm triage");

    expect(await screen.findByLabelText("Minutes for Laundry")).toBeOnTheScreen();
    expect(screen.getByLabelText("Minutes for Merge web#1: APP-7 Search")).toBeOnTheScreen();
  });
});
