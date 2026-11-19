import { Sprout } from "@/ui";
import { act, render, screen } from "@testing-library/react-native";
import * as Reanimated from "react-native-reanimated";
import * as z from "zod/mini";

const LENGTH = 136;

// The sprout is decoration, hidden from screen readers.
const line = () => screen.getByTestId("sprout line", { includeHiddenElements: true });
const sprout = () => screen.getByTestId("sprout", { includeHiddenElements: true });

// react-native-svg leaves out a zero offset, which draws the whole line.
const undrawnLength = () => z.number().parse(line().props["strokeDashoffset"] ?? 0);

beforeEach(() => jest.useFakeTimers());

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("starts with the line undrawn and finishes after the drawing and the fade", async () => {
  const onDone = jest.fn();

  await render(<Sprout onDone={onDone} />);

  expect(undrawnLength()).toBe(LENGTH);
  await act(() => jest.advanceTimersByTime(1399));
  expect(onDone).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(1));
  expect(onDone).toHaveBeenCalledTimes(1);
});

it("with reduced motion shows the finished sprout and removes it after 1.2 s, with no fade", async () => {
  jest.spyOn(Reanimated, "useReducedMotion").mockReturnValue(true);
  const onDone = jest.fn();

  await render(<Sprout onDone={onDone} />);

  expect(undrawnLength()).toBe(0);
  expect(sprout()).toHaveStyle({ opacity: 1 });
  await act(() => jest.advanceTimersByTime(1199));
  expect(onDone).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(1));
  expect(onDone).toHaveBeenCalledTimes(1);
});

it("stops its timer when removed early", async () => {
  const onDone = jest.fn();

  await render(<Sprout onDone={onDone} />);
  await screen.unmount();
  await act(() => jest.advanceTimersByTime(2000));

  expect(onDone).not.toHaveBeenCalled();
});
