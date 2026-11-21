import { render, screen, userEvent } from "@testing-library/react-native";

import { CelebrationProvider } from "@/components/celebration";
import { HabitsDueToday } from "@/components/today/habits-due-today";
import type { HabitsBody } from "@/lib/data/habits";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit, timedHabit } from "../../../jest/fixtures";
import type * as SilencedAlarms from "@/lib/alarms/silenced-alarms.android";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useIsFocused: () => true,
  Link: ({ children }: { children: unknown }) => children,
}));

jest.mock("@/lib/data/data-provider", () => ({ useIsOnline: () => true }));

jest.mock("@/lib/data/circles", () => ({
  useCircles: () => ({ data: undefined }),
  useCreateCircle: () => ({ mutate: jest.fn(), isPending: false }),
  useFollowHabit: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock("@/lib/alarms/silenced-alarms", () =>
  jest.requireActual<typeof SilencedAlarms>("@/lib/alarms/silenced-alarms.android"),
);

jest.mock("expo-sqlite/kv-store", () => {
  const items = new Map<string, string>();

  return {
    __esModule: true,
    default: {
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => items.set(key, value),
    },
  };
});

interface TrackerState {
  data: HabitsBody | undefined;
  isError: boolean;
}

const mockTracker: TrackerState = { data: undefined, isError: false };

jest.mock("@/lib/data/streaks", () => ({
  ...jest.requireActual<object>("@/lib/data/streaks"),
  useHabitStreaks: () => () => null,
}));

jest.mock("@/lib/data/check-ins", () => ({
  ...jest.requireActual<object>("@/lib/data/check-ins"),
  useCheckIns: () => ({ data: { checkIns: [] } }),
}));

jest.mock("@/lib/data/habits", () => ({
  ...jest.requireActual<object>("@/lib/data/habits"),
  useHabitTracker: () => mockTracker,
  useCheckHabit: () => jest.fn(),
  useSaveHabit: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
  useAddDuration: () => ({ mutate: jest.fn(), isPending: false }),
  useReschedule: () => ({ mutate: jest.fn(), isPending: false }),
}));

// Friday 2026-11-06 at local noon: the same Day in Toronto and in UTC, where CI runs.
beforeEach(() => jest.setSystemTime(new Date(2026, 10, 6, 12, 0)));

const evening = { time: "18:00", kind: "alarm" } as const;

async function showToday(body: HabitsBody) {
  mockTracker.data = body;

  await render(
    <CelebrationProvider>
      <HabitsDueToday />
    </CelebrationProvider>,
  );
}

const silence = (name: string) => ({ name: `Silence ${name}'s alarm today` });

describe("silencing today's alarm from Today", () => {
  it("silences a Habit's ring with one tap, and a second tap brings it back", async () => {
    await showToday({ habits: [habit({ alarm: evening })] });

    await userEvent.press(screen.getByRole("checkbox", silence("Walk")));
    expect(screen.getByRole("checkbox", silence("Walk"))).toBeChecked();

    await userEvent.press(screen.getByRole("checkbox", silence("Walk")));
    expect(screen.getByRole("checkbox", silence("Walk"))).not.toBeChecked();
  });

  it("offers it on a timed Habit", async () => {
    await showToday({ habits: [timedHabit({ id: "read", name: "Read", alarm: evening })] });

    expect(screen.getByRole("checkbox", silence("Read"))).toBeOnTheScreen();
  });

  it.each([
    ["has no alarm", habit()],
    ["rang earlier today", habit({ alarm: { time: "07:00", kind: "alarm" } })],
  ])("isn't offered on a Habit that %s", async (_name, walk) => {
    await showToday({ habits: [walk] });

    expect(screen.getByRole("checkbox", { name: "Walk done today" })).toBeOnTheScreen();
    expect(screen.queryByRole("checkbox", silence("Walk"))).not.toBeOnTheScreen();
  });

  it("isn't offered once today's Day is logged, which already keeps it quiet", async () => {
    await showToday({ habits: [habit({ alarm: evening })], counts: { "2026-11-06": { walk: 1 } } });

    await userEvent.press(screen.getByRole("button", { name: "Done today (1)" }));

    expect(screen.getByRole("checkbox", { name: "Walk done today" })).toBeChecked();
    expect(screen.queryByRole("checkbox", silence("Walk"))).not.toBeOnTheScreen();
  });

  it("stays offered on a weekly count Habit whose week is below its target, which still rings", async () => {
    const weekly = habit({
      alarm: evening,
      record: "count",
      target: { type: "weekly", count: 3, days: [] },
    });

    await showToday({ habits: [weekly], counts: { "2026-11-06": { walk: 1 } } });

    await userEvent.press(screen.getByRole("button", { name: "Done today (1)" }));

    expect(screen.getByRole("checkbox", silence("Walk"))).toBeOnTheScreen();
  });
});
