import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import type { TargetView } from "@/core";

import { GoalTargetSection, HabitTargets } from "@/components/goal-target";
import { WeekTargets } from "@/components/target-review";
import { apiFetch } from "@/lib/api/api-fetch";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../../jest/android-picker";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi, pendingApi, reply } from "../../../jest/fake-api";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

const HABITS = {
  habits: [
    { id: "run", name: "Run" },
    { id: "ride", name: "Ride" },
  ],
};

interface TrackerState {
  data: typeof HABITS | undefined;
}

const mockTracker: TrackerState = { data: HABITS };

jest.mock("@/lib/data/habits", () => ({
  ...jest.requireActual<object>("@/lib/data/habits"),
  useHabitTracker: () => mockTracker,
}));

// Thursday 12 Nov; the Weekly review reads the week before, ending Sunday 8 Nov.
const TODAY = "2026-11-12";
const LAST_SUNDAY = "2026-11-08";

beforeEach(() => {
  jest.mocked(apiFetch).mockClear();
  mockTracker.data = HABITS;
  jest.setSystemTime(new Date(`${TODAY}T10:00:00-05:00`));
});

const CARDIO: TargetView = {
  goalId: 20,
  title: "Cardio",
  state: "active",
  pillar: null,
  target: {
    measure: "minutes",
    number: 150,
    direction: "minimum",
    period: "week",
    start: "2026-10-01",
    reviewedThrough: null,
  },
  habits: ["run"],
  current: { from: "2026-11-09", to: "2026-11-15", value: 95 },
  previous: { from: "2026-11-02", to: "2026-11-08", value: 120 },
  closing: { from: "2026-11-09", to: "2026-11-15", value: 95 },
};

// The Weekly review's view of the week before: its period has ended short.
const ENDED: TargetView = {
  ...CARDIO,
  current: { from: "2026-11-02", to: "2026-11-08", value: 120 },
  previous: null,
  closing: { from: "2026-11-02", to: "2026-11-08", value: 120 },
};

const RACE: TargetView = {
  ...ENDED,
  goalId: 21,
  title: "Race",
  target: { ...CARDIO.target, period: "deadline", deadline: LAST_SUNDAY },
};

const serve = (day: string, targets: TargetView[]) =>
  fakeApi({ [`/api/targets?day=${day}`]: reply({ targets }) });

const show = (node: ReactNode) =>
  render(<QueryClientProvider client={createQueryClient()}>{node}</QueryClientProvider>);

describe("GoalTargetSection", () => {
  it("shows the Target's progress and the Habits it measures", async () => {
    serve(TODAY, [CARDIO]);

    await show(<GoalTargetSection goalId={20} />);

    expect(await screen.findByText("95 / 150 min this week")).toBeOnTheScreen();
    expect(screen.getByText("Measures: Run")).toBeOnTheScreen();
  });

  it("a Signal Target names no Habits", async () => {
    serve(TODAY, [{ ...CARDIO, target: { ...CARDIO.target, measure: "sleep" }, habits: [] }]);

    await show(<GoalTargetSection goalId={20} />);

    expect(await screen.findByText(/a night this week/)).toBeOnTheScreen();
    expect(screen.queryByText(/Measures/)).toBeNull();
  });

  it("a screen time Target lists each Day's total across devices", async () => {
    fakeApi({
      [`/api/targets?day=${TODAY}`]: reply({
        targets: [
          {
            ...CARDIO,
            target: { ...CARDIO.target, measure: "screen-time", direction: "limit", number: 180 },
            habits: [],
            current: { ...CARDIO.current, value: 150 },
          },
        ],
      }),
      "/api/screen-time?from=2026-11-06": reply({ days: [{ day: TODAY, minutes: 150 }] }),
    });

    await show(<GoalTargetSection goalId={20} />);

    expect(await screen.findByText("2 h 30 m a day this week, limit 3 h")).toBeOnTheScreen();
    expect(await screen.findByText("Today")).toBeOnTheScreen();
  });

  it("sets a Target on a Goal without one", async () => {
    const { writes } = serve(TODAY, []);

    await show(<GoalTargetSection goalId={20} />);
    await userEvent.press(await screen.findByText("Set a target"));
    await userEvent.press(screen.getByRole("radio", { name: "Times" }));
    await userEvent.press(screen.getByRole("radio", { name: "Limit" }));
    await userEvent.press(screen.getByRole("radio", { name: "Monthly" }));
    await userEvent.paste(screen.getByLabelText("Number of times (optional)"), "5");
    await userEvent.press(screen.getByText("Save"));

    await waitFor(() =>
      expect(writes).toEqual([
        {
          path: "/api/targets/20",
          method: "PUT",
          body: { measure: "times", direction: "limit", number: 5, period: "month" },
        },
      ]),
    );
    expect(await screen.findByText("Set a target")).toBeOnTheScreen();
  });

  it("a deadline Target needs its date, and a number must be whole and above 0", async () => {
    const { writes } = serve(TODAY, [CARDIO]);
    pickOnAndroid(new Date(2026, 11, 31));

    await show(<GoalTargetSection goalId={20} />);
    await userEvent.press(await screen.findByText("Edit target"));
    await userEvent.press(screen.getByRole("radio", { name: "Deadline" }));

    expect(screen.getByText("Save")).toBeDisabled();

    await userEvent.press(screen.getByText("Pick a day"));
    await userEvent.clear(screen.getByLabelText("Number of minutes (optional)"));
    await userEvent.paste(screen.getByLabelText("Number of minutes (optional)"), "0");

    expect(screen.getByText("Save")).toBeDisabled();

    await userEvent.clear(screen.getByLabelText("Number of minutes (optional)"));
    await userEvent.press(screen.getByText("Save"));

    await waitFor(() =>
      expect(writes[0]?.body).toEqual({
        measure: "minutes",
        direction: "minimum",
        number: null,
        period: "deadline",
        deadline: "2026-12-31",
      }),
    );
  });

  it("removes a Target, and Cancel leaves it", async () => {
    const { writes } = serve(TODAY, [CARDIO]);

    await show(<GoalTargetSection goalId={20} />);
    await userEvent.press(await screen.findByText("Edit target"));
    await userEvent.press(screen.getByText("Cancel"));
    await userEvent.press(screen.getByText("Edit target"));
    await userEvent.press(screen.getByText("Remove target"));

    await waitFor(() => expect(writes).toEqual([{ path: "/api/targets/20", method: "DELETE" }]));
  });

  it("editing a deadline Target starts from its date", async () => {
    serve(TODAY, [{ ...RACE, goalId: 20 }]);

    await show(<GoalTargetSection goalId={20} />);
    await userEvent.press(await screen.findByText("Edit target"));

    expect(screen.getByLabelText(`Deadline: ${LAST_SUNDAY}`)).toBeOnTheScreen();
  });

  it("names no Habits before the Habits load", async () => {
    serve(TODAY, [CARDIO]);
    mockTracker.data = undefined;

    await show(<GoalTargetSection goalId={20} />);

    expect(await screen.findByText("95 / 150 min this week")).toBeOnTheScreen();
    expect(screen.queryByText(/Measures/)).toBeNull();
  });

  it("shows nothing until the Targets load", async () => {
    pendingApi();

    await show(<GoalTargetSection goalId={20} />);

    expect(screen.queryByText("Target")).toBeNull();
  });
});

describe("HabitTargets", () => {
  it("lists the active Goals whose Target measures the Habit", async () => {
    serve(TODAY, [
      CARDIO,
      { ...CARDIO, goalId: 22, title: "Old cardio", state: "retired" },
      { ...CARDIO, goalId: 23, title: "Cycling", habits: ["ride"] },
    ]);

    await show(<HabitTargets habitId="run" />);

    expect(await screen.findByText("Cardio")).toBeOnTheScreen();
    expect(screen.getByText("95 / 150 min this week")).toBeOnTheScreen();
    expect(screen.queryByText("Old cardio")).toBeNull();
    expect(screen.queryByText("Cycling")).toBeNull();
  });

  it("shows nothing when no Target measures the Habit", async () => {
    serve(TODAY, [CARDIO]);

    await show(<HabitTargets habitId="ride" />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByText("Targets")).toBeNull();
  });
});

describe("WeekTargets", () => {
  it("shows each active Target and asks once about a period that ended short", async () => {
    const { writes } = serve(LAST_SUNDAY, [ENDED, { ...ENDED, goalId: 22, state: "retired" }]);

    await show(<WeekTargets end={LAST_SUNDAY} />);

    expect(await screen.findByText("120 / 150 min last week")).toBeOnTheScreen();
    expect(screen.queryByText("Achieved")).toBeNull();

    await userEvent.press(screen.getByText("Keep"));

    await waitFor(() =>
      expect(writes).toEqual([
        {
          path: "/api/targets/20/review",
          method: "POST",
          body: { answer: "keep", through: LAST_SUNDAY },
        },
      ]),
    );
  });

  it("Adjust asks for the new number; Let go drops it", async () => {
    const { writes } = serve(LAST_SUNDAY, [ENDED]);

    await show(<WeekTargets end={LAST_SUNDAY} />);
    await userEvent.press(await screen.findByText("Adjust"));
    await userEvent.paste(screen.getByLabelText("New number"), "120");
    await userEvent.press(screen.getByText("Save"));
    await userEvent.press(screen.getByText("Let go"));

    await waitFor(() =>
      expect(writes.map(({ body }) => body)).toEqual([
        { answer: "adjust", through: LAST_SUNDAY, number: 120 },
        { answer: "let-go", through: LAST_SUNDAY },
      ]),
    );
  });

  it("a deadline Target also offers Achieved", async () => {
    const { writes } = serve(LAST_SUNDAY, [RACE]);

    await show(<WeekTargets end={LAST_SUNDAY} />);
    await userEvent.press(await screen.findByText("Achieved"));

    await waitFor(() =>
      expect(writes[0]?.body).toEqual({ answer: "achieved", through: LAST_SUNDAY }),
    );
  });

  it("asks beneath the progress line without repeating it", async () => {
    serve(LAST_SUNDAY, [ENDED]);

    await show(<WeekTargets end={LAST_SUNDAY} />);

    expect(await screen.findByText("Keep the number, adjust it or let it go?")).toBeOnTheScreen();
    expect(screen.getAllByText(/120 \/ 150 min/)).toHaveLength(1);
  });

  it("names a month that closed early in the week", async () => {
    // October ends on the Saturday; the week's last Day already sits in November.
    serve("2026-11-01", [
      {
        ...ENDED,
        target: { ...CARDIO.target, period: "month" },
        current: { from: "2026-11-01", to: "2026-11-30", value: 0 },
        closing: { from: "2026-10-01", to: "2026-10-31", value: 90 },
      },
    ]);

    await show(<WeekTargets end="2026-11-01" />);

    expect(
      await screen.findByText(
        "Ended at 90 / 150 min last month. Keep the number, adjust it or let it go?",
      ),
    ).toBeOnTheScreen();
  });

  it("leaves out a Pillar Goal's Target: its bar already shows the week", async () => {
    serve(LAST_SUNDAY, [
      { ...ENDED, goalId: 30, title: "Sleep well", pillar: "sleep" },
      { ...ENDED, previous: null, closing: null },
    ]);

    await show(<WeekTargets end={LAST_SUNDAY} />);

    expect(await screen.findByText("Cardio")).toBeOnTheScreen();
    expect(screen.queryByText("Sleep well")).toBeNull();
    expect(screen.queryByText("Keep")).toBeNull();
  });

  it("shows nothing without an active Target", async () => {
    serve(LAST_SUNDAY, []);

    await show(<WeekTargets end={LAST_SUNDAY} />);

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByText("Targets")).toBeNull();
  });
});
