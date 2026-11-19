import { CelebrationDrawing } from "@/ui";
import { act, render, screen, userEvent } from "@testing-library/react-native";
import { NotificationFeedbackType, notificationAsync } from "expo-haptics";
import { Platform, Pressable, Text } from "react-native";
import * as Reanimated from "react-native-reanimated";
import * as z from "zod/mini";

import { CelebrationProvider, useCelebrate } from "@/components/celebration";

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success" },
}));

// Celebrations are decoration, hidden from screen readers.
const hidden = { includeHiddenElements: true };

// react-native-svg leaves out a zero offset, which draws the whole line.
const undrawn = (testID: string) =>
  z.number().parse(screen.getByTestId(testID, hidden).props["strokeDashoffset"] ?? 0);

beforeEach(() => jest.useFakeTimers());

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function Milestone() {
  const { celebrate, stop } = useCelebrate();

  return (
    <>
      <Pressable role="button" onPress={() => celebrate({ kind: "milestone" })}>
        <Text>Milestone</Text>
      </Pressable>
      <Pressable role="button" onPress={stop}>
        <Text>Stop</Text>
      </Pressable>
    </>
  );
}

describe("useCelebrate", () => {
  it("always plays a big drawing over the screen for a milestone, with a haptic on Android", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    jest.spyOn(Math, "random").mockReturnValue(0.99);
    await render(
      <CelebrationProvider>
        <Milestone />
      </CelebrationProvider>,
    );

    await userEvent.press(screen.getByRole("button", { name: "Milestone" }));

    expect(screen.getByTestId("celebration overlay", hidden)).toHaveProp("pointerEvents", "none");
    expect(screen.getByTestId("leaf", hidden)).toBeOnTheScreen();
    expect(notificationAsync).toHaveBeenCalledWith(NotificationFeedbackType.Success);
  });

  it("removes the drawing once it finishes, or at once on stop", async () => {
    await render(
      <CelebrationProvider>
        <Milestone />
      </CelebrationProvider>,
    );

    await userEvent.press(screen.getByRole("button", { name: "Milestone" }));
    await act(() => jest.advanceTimersByTime(1500));
    expect(screen.queryByTestId("celebration overlay", hidden)).not.toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Milestone" }));
    await userEvent.press(screen.getByRole("button", { name: "Stop" }));
    expect(screen.queryByTestId("celebration overlay", hidden)).not.toBeOnTheScreen();
  });

  it("needs a CelebrationProvider above it", async () => {
    jest.spyOn(console, "error").mockImplementation(() => null);

    await expect(render(<Milestone />)).rejects.toThrow(
      "A celebration needs a CelebrationProvider above it.",
    );
  });
});

describe("CelebrationDrawing", () => {
  it("draws the mini tick in about 300 ms, then fades it", async () => {
    const onDone = jest.fn();

    await render(<CelebrationDrawing celebration={{ size: "mini" }} onDone={onDone} />);

    expect(undrawn("tick line")).toBe(24);
    await act(() => jest.advanceTimersByTime(549));
    expect(onDone).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("starts the leaf folded with its midrib undrawn", async () => {
    await render(
      <CelebrationDrawing celebration={{ size: "big", drawing: "leaf" }} onDone={jest.fn()} />,
    );

    expect(undrawn("leaf midrib")).toBe(51);
    expect(screen.getByTestId("leaf blade", hidden)).toHaveStyle({
      transform: [{ rotate: "-40deg" }, { scale: 0.6 }],
    });
  });

  it.each([
    { drawing: "tick", celebration: { size: "mini" }, line: "tick line" },
    { drawing: "leaf", celebration: { size: "big", drawing: "leaf" }, line: "leaf midrib" },
    { drawing: "sprout", celebration: { size: "big", drawing: "sprout" }, line: "sprout line" },
  ] as const)(
    "with reduced motion shows the finished $drawing, unfaded",
    async ({ drawing, celebration, line }) => {
      jest.spyOn(Reanimated, "useReducedMotion").mockReturnValue(true);

      await render(<CelebrationDrawing celebration={celebration} onDone={jest.fn()} />);

      expect(undrawn(line)).toBe(0);
      expect(screen.getByTestId(drawing, hidden)).toHaveStyle({ opacity: 1 });
    },
  );

  it("shows the leaf open with reduced motion", async () => {
    jest.spyOn(Reanimated, "useReducedMotion").mockReturnValue(true);

    await render(
      <CelebrationDrawing celebration={{ size: "big", drawing: "leaf" }} onDone={jest.fn()} />,
    );

    expect(screen.getByTestId("leaf blade", hidden)).toHaveStyle({
      transform: [{ rotate: "0deg" }, { scale: 1 }],
    });
  });
});
