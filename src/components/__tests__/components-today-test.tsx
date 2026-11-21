import { shiftDay, torontoDay, type Counts } from "@/core";
import { render, screen, userEvent } from "@testing-library/react-native";

import { CelebrationProvider } from "@/components/celebration";
import { HabitsDueToday } from "@/components/today/habits-due-today";
import { SeasonNudges } from "@/components/today/season-nudges";
import { HealthPlanCard } from "@/components/today/health-plan-card";
import type { HabitsBody } from "@/lib/data/habits";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit, timedHabit } from "../../../jest/fixtures";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../../jest/route-mocks";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useIsFocused: () => true,
  Link: ({ children }: { children: unknown }) => children,
}));

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../../jest/route-mocks").mockUniwind(),
);

jest.mock("@/lib/data/data-provider", () => ({ useIsOnline: () => true }));

jest.mock("@/lib/data/circles", () => ({
  useCircles: () => ({ data: undefined }),
  useCreateCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useFollowHabit: () => ({ mutate: jest.fn(), isPending: false }),
}));

interface TrackerState {
  data: HabitsBody | undefined;
  isError: boolean;
}

const mockTracker: TrackerState = { data: undefined, isError: false };

interface CheckInsState {
  data: { checkIns: { zone: string; checkedInAt: string }[] } | undefined;
}

const mockCheckIns: CheckInsState = {
  data: { checkIns: [{ zone: "Storm", checkedInAt: new Date().toISOString() }] },
};

const mockData = {
  save: { mutate: jest.fn(), isPending: false, isError: false },
  plan: { data: undefined },
};

const mockCheck = jest.fn();

jest.mock("@/lib/data/streaks", () => ({
  ...jest.requireActual<object>("@/lib/data/streaks"),
  useHabitStreaks: () => () => null,
  useCheckInStreak: () => null,
}));

jest.mock("@/lib/data/check-ins", () => ({
  ...jest.requireActual<object>("@/lib/data/check-ins"),
  useCheckIns: () => mockCheckIns,
}));

jest.mock("@/lib/data/notes", () => ({
  ...jest.requireActual<object>("@/lib/data/notes"),
  useHealthPlan: () => mockData.plan,
}));

jest.mock("@/lib/data/habits", () => ({
  ...jest.requireActual<object>("@/lib/data/habits"),
  useHabitTracker: () => mockTracker,
  useSaveHabit: () => mockData.save,
  useCheckHabit: () => mockCheck,
  useAddDuration: () => ({ mutate: jest.fn(), isPending: false }),
  useDeleteDuration: () => ({ mutate: jest.fn(), isPending: false }),
  useReschedule: () => ({ mutate: jest.fn(), isPending: false }),
}));

describe("HabitsDueToday", () => {
  it("opens a timed Habit's day from a body with no counts or durations, and closes it", async () => {
    const body: HabitsBody = { habits: [timedHabit({ id: "walk", name: "Walk" })] };

    mockTracker.data = body;

    await render(
      <CelebrationProvider>
        <HabitsDueToday />
      </CelebrationProvider>,
    );
    await userEvent.press(screen.getByLabelText("Walk today: show entries"));

    expect(screen.getByText("Nothing logged this day.")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Done" }));

    expect(screen.queryByText("Nothing logged this day.")).not.toBeOnTheScreen();
  });
});

describe("HabitsDueToday Tiny versions", () => {
  const run = habit({ id: "run", name: "Run 5 km", tinyVersion: "Put on running shoes" });

  const showWithCheckIn = async (zone: string | null, habits = [run], counts: Counts = {}) => {
    mockTracker.data = { habits, counts };
    mockCheckIns.data = {
      checkIns: zone === null ? [] : [{ zone, checkedInAt: new Date().toISOString() }],
    };

    await render(
      <CelebrationProvider>
        <HabitsDueToday />
      </CelebrationProvider>,
    );
  };

  it.each(["Rain", "Storm"])("shows the Tiny version after a %s Check-in today", async (zone) => {
    await showWithCheckIn(zone);

    expect(screen.getByText("Tiny: Put on running shoes")).toBeOnTheScreen();
  });

  it.each(["Cloud", "Sun", null])("hides the Tiny version after a %s Check-in", async (zone) => {
    await showWithCheckIn(zone);

    expect(screen.queryByText(/^Tiny:/)).not.toBeOnTheScreen();
  });

  it("hides it while the Check-ins are still loading", async () => {
    await showWithCheckIn("Storm");
    mockCheckIns.data = undefined;
    await screen.rerender(
      <CelebrationProvider>
        <HabitsDueToday />
      </CelebrationProvider>,
    );

    expect(screen.queryByText(/^Tiny:/)).not.toBeOnTheScreen();
  });

  it("shows no line for a Habit without a Tiny version", async () => {
    await showWithCheckIn("Storm", [habit({ id: "read", name: "Read" })]);

    expect(screen.queryByText(/^Tiny:/)).not.toBeOnTheScreen();
  });

  it("drops the line once the Habit is Done today", async () => {
    await showWithCheckIn("Storm", [run], { [torontoDay(new Date())]: { run: 1 } });

    await userEvent.press(screen.getByRole("button", { name: "Done today (1)" }));

    expect(screen.getByRole("checkbox", { name: "Run 5 km done today" })).toBeChecked();
    expect(screen.queryByText(/^Tiny:/)).not.toBeOnTheScreen();
  });

  it("records an ordinary Done from a row that shows its Tiny version", async () => {
    mockCheck.mockClear();
    await showWithCheckIn("Storm");

    await userEvent.press(screen.getByRole("checkbox", { name: "Run 5 km done today" }));

    expect(mockCheck).toHaveBeenCalledWith({
      date: torontoDay(new Date()),
      habit: "run",
      count: 1,
    });
  });
});

describe("SeasonNudges", () => {
  it("says when an answer fails to save", async () => {
    const today = torontoDay(new Date());
    const lastYear = `${String(Number(today.slice(0, 4)) - 1)}${today.slice(4)}`;

    mockData.save.isError = true;

    await render(
      <SeasonNudges
        today={new Date()}
        body={{
          habits: [
            habit({
              id: "boat",
              name: "Dragon boat",
              seasons: [{ start: lastYear, end: shiftDay(lastYear, 30) }],
            }),
          ],
        }}
      />,
    );

    expect(screen.getByText("Couldn't save. Try again.")).toBeOnTheScreen();
  });
});

describe("HealthPlanCard", () => {
  it("shows only the way to the plan while the plan has not loaded", async () => {
    await render(<HealthPlanCard />);

    expect(screen.getByText("Open the Health plan")).toBeOnTheScreen();
  });
});
