import { filtersFromParams, isoAt, torontoDay, type Circle } from "@/core";
import { render, screen, userEvent } from "@testing-library/react-native";

import { HabitCircle, NewSeasonCircleOffer } from "@/components/habits/habit-circle";
import { HabitDayDetail } from "@/components/habits/habit-day-detail";
import { HabitFilterBar } from "@/components/habits/habit-filter-bar";
import { HistorySummary } from "@/components/habits/habit-history";
import { useIsOnline } from "@/lib/data/data-provider";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit, timedHabit } from "../../../jest/fixtures";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { InSafeArea } from "../../../jest/safe-area";

interface CirclesState {
  data: { circles: Circle[] };
}

const mockCircles: CirclesState = { data: { circles: [] } };

const mockMutations = {
  create: { mutate: jest.fn(), isPending: false, isError: false },
  follow: { mutate: jest.fn(), isPending: false, isError: false },
  remove: { mutate: jest.fn(), isPending: false, isError: false },
};

jest.mock("@/lib/data/circles", () => ({
  useCircles: () => mockCircles,
  useCreateCircle: () => mockMutations.create,
  useFollowHabit: () => mockMutations.follow,
}));

jest.mock("@/lib/data/data-provider", () => ({ useIsOnline: jest.fn() }));

jest.mock("@/lib/data/habits", () => ({ useDeleteDuration: () => mockMutations.remove }));

const TODAY = torontoDay(new Date());

const circle = (over: Partial<Circle>): Circle => ({
  id: 1,
  name: "Boat 2020",
  habitId: null,
  followsFrom: null,
  members: [],
  ...over,
});

const idle = () => ({ mutate: jest.fn(), isPending: false, isError: false });

beforeEach(() => {
  jest.mocked(useIsOnline).mockReturnValue(true);
  mockCircles.data = { circles: [] };
  mockMutations.create = idle();
  mockMutations.follow = idle();
  mockMutations.remove = idle();
});

describe("HabitFilterBar", () => {
  const filters = filtersFromParams(new URLSearchParams());

  it.each([true, false])("picks a kind when wide is %s", async (isWide) => {
    const onChange = jest.fn();

    await render(<HabitFilterBar filters={filters} onChange={onChange} isWide={isWide} />);
    await userEvent.press(screen.getByRole("button", { name: "Good" }));

    expect(onChange).toHaveBeenCalledWith({ kind: "good" });
  });
});

describe("HistorySummary", () => {
  it("labels a weekly Habit's strip in weeks", async () => {
    await render(
      <HistorySummary
        history={{
          kind: "good",
          unit: "week",
          hits: 1,
          misses: 0,
          periods: [{ label: "Week of 9 Nov", start: "2026-11-09", mark: "hit" }],
        }}
      />,
    );

    expect(screen.getByLabelText("Last 7 weeks")).toBeOnTheScreen();
    expect(screen.queryByText(/Strength/)).toBeNull();
  });

  it("shows the Strength as a percentage", async () => {
    await render(
      <HistorySummary
        history={{ kind: "good", unit: "day", hits: 0, misses: 0, periods: [] }}
        strength={0.64}
      />,
    );

    expect(screen.getByText("Strength 64%")).toBeOnTheScreen();
  });
});

describe("HabitDayDetail", () => {
  const walk = timedHabit({ id: "walk" });
  const entry = { id: 4, startTime: isoAt(TODAY, 8 * 60), minutes: 20 };

  const show = (date: string, durations = {}) =>
    render(
      <HabitDayDetail detail={{ habit: walk, date }} durations={durations} onClose={jest.fn()} />,
      { wrapper: InSafeArea },
    );

  it("deletes an entry with what its Undo needs to log it again", async () => {
    const eight = { id: 4, startTime: "08:00", minutes: 20 };
    await show(TODAY, { [TODAY]: { walk: [eight] } });

    await userEvent.press(screen.getByRole("button", { name: "Delete Walk at 8:00 AM" }));

    expect(mockMutations.remove.mutate).toHaveBeenCalledWith({
      ...eight,
      date: TODAY,
      habit: "walk",
      name: "Walk",
    });
  });

  it("says when nothing was logged on a past day", async () => {
    await show("2026-01-05");

    expect(screen.getByText("Nothing logged this day.")).toBeOnTheScreen();
  });

  it("says deleting needs a connection when offline", async () => {
    jest.mocked(useIsOnline).mockReturnValue(false);

    await show(TODAY, { [TODAY]: { walk: [entry] } });

    expect(screen.getByText("Deleting needs a connection.")).toBeOnTheScreen();
  });

  it("says when a delete fails", async () => {
    mockMutations.remove.isError = true;

    await show(TODAY, { [TODAY]: { walk: [entry] } });

    expect(screen.getByText("Couldn't delete. Try again.")).toBeOnTheScreen();
  });
});

const hasData = (circles: Circle[]) => {
  mockCircles.data = { circles };
};

describe("HabitCircle", () => {
  const recurring = habit({ id: "walk" });

  it("says when picking a Circle fails", async () => {
    hasData([circle({})]);
    mockMutations.follow.isError = true;

    await render(<HabitCircle draft={recurring} />);

    expect(screen.getByText("Couldn't save. Try again.")).toBeOnTheScreen();
  });

  it("says when stopping a follow fails", async () => {
    hasData([circle({ habitId: "walk" })]);
    mockMutations.follow.isError = true;

    await render(<HabitCircle draft={recurring} />);

    expect(screen.getByText("Couldn't save. Try again.")).toBeOnTheScreen();
  });

  it("says when making this year's Circle fails", async () => {
    hasData([circle({ habitId: "walk", followsFrom: "2020-01-01" })]);
    mockMutations.create.isError = true;

    await render(
      <NewSeasonCircleOffer
        habit={habit({ id: "walk", seasons: [{ start: TODAY, end: null }] })}
        today={new Date()}
      />,
    );

    expect(screen.getByText("Couldn't make the Circle. Try again.")).toBeOnTheScreen();
  });
});
