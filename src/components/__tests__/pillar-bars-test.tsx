import { render, screen } from "@testing-library/react-native";

import type { PillarBar } from "@/core";

import { PillarBars } from "@/components/pillar-bars";
import { useIsOnline } from "@/lib/data/data-provider";

interface PillarsState {
  data: { bars: PillarBar[] } | undefined;
  isError: boolean;
}

const mockPillars: PillarsState = { data: undefined, isError: false };

jest.mock("@/lib/data/pillars", () => ({ usePillarBars: () => mockPillars }));

jest.mock("@/lib/data/data-provider", () => ({ useIsOnline: jest.fn(() => true) }));

const SLEEP: PillarBar = {
  pillar: "sleep",
  title: "Restorative sleep",
  state: "scored",
  score: 70,
  value: "6 h 40 m a night",
  line: "Enough: 7 h a night",
  change: -30,
};

const show = async (bars: PillarBar[] | undefined, isError = false) => {
  mockPillars.data = bars === undefined ? undefined : { bars };
  mockPillars.isError = isError;
  await render(<PillarBars end="2026-11-15" />);
};

beforeEach(() => jest.mocked(useIsOnline).mockReturnValue(true));

test("a scored bar shows its fill, value, line and change", async () => {
  await show([SLEEP, { ...SLEEP, pillar: "activity", title: "Physical activity", change: null }]);

  expect(screen.getAllByRole("progressbar")[0]).toHaveAccessibilityValue({ now: 70 });
  expect(screen.getAllByText("6 h 40 m a night")).toHaveLength(2);
  expect(screen.getByText("Enough: 7 h a night · Down 30 from the 7 days before")).toBeTruthy();
  expect(screen.getByText("Enough: 7 h a night")).toBeTruthy();
});

test("too little data shows an empty dashed track, and no source shows no track", async () => {
  await show([
    {
      pillar: "sleep",
      title: "Restorative sleep",
      state: "thin",
      message: "Not enough data: 3 of 7 nights",
    },
    {
      pillar: "stress",
      title: "Stress management",
      state: "none",
      message: "Link a Habit to see this",
    },
  ]);

  expect(screen.getByText("Not enough data: 3 of 7 nights")).toBeTruthy();
  expect(screen.getByText("Link a Habit to see this")).toBeTruthy();
  expect(screen.getAllByTestId("thin-track")).toHaveLength(1);
  expect(screen.queryByRole("progressbar")).toBeNull();
});

test("no pillar Goals shows nothing", async () => {
  await show([]);

  expect(screen.queryByText("Pillars")).toBeNull();
});

test("says when it is loading, failed or offline", async () => {
  await show(undefined);
  expect(screen.getByText("Reading the pillars…")).toBeTruthy();

  await show(undefined, true);
  expect(screen.getByText("The pillar bars need a connection.")).toBeTruthy();

  jest.mocked(useIsOnline).mockReturnValue(false);
  await show(undefined);
  expect(screen.getByText("The pillar bars need a connection.")).toBeTruthy();
});
