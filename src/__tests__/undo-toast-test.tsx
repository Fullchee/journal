import { showUndoToast, Toaster } from "@/ui";
import { act, render, screen, userEvent } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

const screenReaderOn = jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled");

// TalkBack's toggle, as the Toaster subscribed to it.
const talkBack = { change: jest.fn<undefined, [boolean]>(), remove: jest.fn() };

jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((_event, handler) => {
  talkBack.change.mockImplementation((on) => {
    handler(on);
  });

  return { remove: talkBack.remove };
});

async function mountToaster(readerOn: boolean) {
  screenReaderOn.mockResolvedValue(readerOn);
  const view = await render(<Toaster bottomOffset={80} />);
  // Let the screen reader lookup settle.
  await act(() => Promise.resolve());

  return view;
}

async function undoToast() {
  const onUndo = jest.fn();
  const onClose = jest.fn();

  await act(() => showUndoToast({ id: "action", message: "Done · Stretch", onUndo, onClose }));

  return { onUndo, onClose };
}

beforeEach(() => jest.useFakeTimers());

afterEach(async () => {
  await act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

it("offers Undo for 10 seconds", async () => {
  await mountToaster(false);
  const { onClose } = await undoToast();

  await act(() => jest.advanceTimersByTime(9999));
  expect(screen.getByText("Done · Stretch")).toBeOnTheScreen();

  await act(() => jest.advanceTimersByTime(1));
  expect(screen.queryByText("Done · Stretch")).not.toBeOnTheScreen();
  expect(onClose).toHaveBeenCalled();
});

it("waits for a dismiss while a screen reader is on", async () => {
  await mountToaster(true);
  await undoToast();

  await act(() => jest.advanceTimersByTime(60_000));

  expect(screen.getByText("Done · Stretch")).toBeOnTheScreen();
});

it("follows TalkBack turning on after launch, and stops following on unmount", async () => {
  const view = await mountToaster(false);

  await act(() => talkBack.change(true));
  await undoToast();
  await act(() => jest.advanceTimersByTime(60_000));
  expect(screen.getByText("Done · Stretch")).toBeOnTheScreen();

  await act(() => talkBack.change(false));
  await view.unmount();
  expect(talkBack.remove).toHaveBeenCalled();
});

it("runs Undo and closes the toast", async () => {
  await mountToaster(false);
  const { onUndo } = await undoToast();

  await userEvent.press(screen.getByRole("button", { name: "Undo" }));

  expect(onUndo).toHaveBeenCalled();
  expect(screen.queryByText("Done · Stretch")).not.toBeOnTheScreen();
});
