import { chartData, isoAt, shiftDay, zoneOf, type CheckIn, type SleepNight } from "@/core";
import { CheckInChart, Text } from "@/ui";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import type * as Uniwind from "uniwind";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn } from "../../jest/fixtures";

const mockWindow = { fontScale: 1 };

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 400, height: 900, scale: 1, fontScale: mockWindow.fontScale }),
}));

beforeEach(() => {
  mockWindow.fontScale = 1;
});

jest.mock("uniwind", () => ({
  ...jest.requireActual<typeof Uniwind>("uniwind"),
  useCSSVariable: (names: string[]) => names.map(() => "#000000"),
}));

// 15:00 in Toronto.
const NOW = new Date("2026-11-04T15:00:00-05:00");
const WIDTH = 356;

const checkInOn = (day: number, score: number, extra: Partial<CheckIn> = {}) =>
  checkIn({
    id: day,
    checkedInAt: isoAt(shiftDay("2026-10-31", day), 12 * 60),
    zone: zoneOf(score),
    score,
    ...extra,
  });

const night: SleepNight = {
  date: "2026-11-03",
  sleepStart: "2026-11-02T22:13",
  sleepEnd: "2026-11-03T06:00",
};

async function renderChart(checkIns: CheckIn[], sleep: SleepNight[] = []) {
  const onSelect = jest.fn();
  await render(
    <CheckInChart
      data={chartData(checkIns, 7, NOW, sleep)}
      empty={<Text>Empty</Text>}
      onSelect={onSelect}
    />,
  );
  await fireEvent(screen.getByTestId("check-in-chart"), "layout", {
    nativeEvent: { layout: { width: WIDTH, height: 200, x: 0, y: 0 } },
  });

  return onSelect;
}

const legend = (name: string) => screen.queryByRole("button", { name: new RegExp(name) });

// The chart's x range is `left` (48 at default text size) to WIDTH - 8 over 7 days (Oct 29 to Nov 5).
const xOfDay = (day: number, left = 48) =>
  left + ((WIDTH - 8 - left) * (day - 29 + (day < 29 ? 31 : 0) + 0.5)) / 7;

it("shows a legend button only for strips with data", async () => {
  await renderChart([checkInOn(3, 6)]);

  expect(legend("Mood")).toBeOnTheScreen();
  expect(legend("Tense, Low and Tired")).not.toBeOnTheScreen();
  expect(legend("Sleep")).not.toBeOnTheScreen();
});

it("shows every strip with data", async () => {
  await renderChart([checkInOn(3, 6, { tense: 2 })], [night]);

  expect(legend("Tense, Low and Tired")).toBeOnTheScreen();
  expect(legend("Sleep")).toBeOnTheScreen();
});

it("shows the empty state it is given when the range has nothing to draw", async () => {
  await render(<CheckInChart data={chartData([], 7, NOW)} empty={<Text>Nothing here</Text>} />);

  expect(screen.getByText("Nothing here")).toBeOnTheScreen();
  expect(screen.queryByTestId("check-in-chart")).not.toBeOnTheScreen();
});

it("tells TalkBack what the Check-ins and sleep show", async () => {
  await renderChart([checkInOn(1, 2), checkInOn(3, 7)], [night, { ...night, date: "2026-11-04" }]);

  expect(screen.getByRole("img")).toHaveAccessibleName(
    /^Check-in chart: 2 Check-ins, lowest Storm, highest Sun, latest Sun on .+\. 2 nights of sleep\.$/,
  );
});

it("counts a single Check-in or night in the singular", async () => {
  await renderChart([checkInOn(3, 5)]);

  expect(screen.getByRole("img")).toHaveAccessibleName(/^Check-in chart: 1 Check-in, /);
});

it("summarises sleep alone when the range has no Check-ins", async () => {
  await renderChart([], [night]);

  expect(screen.getByRole("img")).toHaveAccessibleName("Check-in chart: 1 night of sleep.");
});

it.each([
  [1, 156],
  [1.3, 160],
  [3, 162],
])("grows the time axis with text size %s, up to 150%%", async (fontScale, height) => {
  mockWindow.fontScale = fontScale;
  await renderChart([checkInOn(3, 7)]);

  // The mood strip alone is 132px; the axis below it is the label size plus 12.
  expect(screen.getByTestId("check-in-chart")).toHaveStyle({ height });
});

it("widens the label gutter at large text, so a tap still finds its point", async () => {
  mockWindow.fontScale = 2;
  const picked = checkInOn(3, 7);
  const onSelect = await renderChart([checkInOn(1, 2), picked]);

  // 12px labels at the 150% cap are 18px, so the gutter is 72px.
  await fireEvent.press(screen.getByTestId("check-in-chart-touch"), {
    nativeEvent: { locationX: xOfDay(3, 72), locationY: 10 },
  });

  expect(onSelect).toHaveBeenCalledWith(picked);
});

it("draws a night as one bar from bedtime down to wake", async () => {
  await renderChart([], [night]);

  // Alone, the sleep strip is 96 px tall and runs 10 PM (240 past 18:00) down to 6 AM (720).
  const bar = screen.getByTestId("sleep-bar");
  const pxPerMinute = 96 / (720 - 240);

  expect(bar).toHaveProp("y", 13 * pxPerMinute);
  expect(bar).toHaveProp("height", (720 - 253) * pxPerMinute);
});

it("toggles a strip from the legend", async () => {
  await renderChart([checkInOn(3, 6)], [night]);

  await userEvent.press(legend("Sleep")!);

  expect(legend("Sleep")).toHaveProp("aria-pressed", false);
});

it("a tap on a point shows its time, zone and note and selects it", async () => {
  const picked = checkInOn(3, 7, { note: "Good walk" });
  const onSelect = await renderChart([checkInOn(1, 2), picked]);

  await fireEvent.press(screen.getByTestId("check-in-chart-touch"), {
    nativeEvent: { locationX: xOfDay(3), locationY: 10 },
  });

  expect(onSelect).toHaveBeenCalledWith(picked);
  expect(screen.getByText("Sun (7/8)")).toBeOnTheScreen();
  expect(screen.getByText("Good walk")).toBeOnTheScreen();
});

it("a tap away from every point selects nothing", async () => {
  const onSelect = await renderChart([checkInOn(3, 7)]);

  await fireEvent.press(screen.getByTestId("check-in-chart-touch"), {
    nativeEvent: { locationX: xOfDay(30), locationY: 10 },
  });

  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.queryByTestId("check-in-chart-tooltip")).not.toBeOnTheScreen();
});
