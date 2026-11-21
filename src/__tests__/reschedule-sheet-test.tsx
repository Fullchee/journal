import { BottomSheet, RescheduleSheet, SkipSheet, Text, type RescheduleSheetProps } from "@/ui";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { TextInput } from "react-native";
import * as Reanimated from "react-native-reanimated";

const sheetProps = (over: Partial<RescheduleSheetProps> = {}): RescheduleSheetProps => ({
  name: "Portage",
  defaultDate: "2026-11-09",
  min: "2026-11-08",
  renderDateField: ({ label, value, onChange }) => (
    <TextInput aria-label={label} value={value} onChangeText={onChange} />
  ),
  onSave: jest.fn(),
  onClose: jest.fn(),
  ...over,
});

const save = () => screen.getByRole("button", { name: "Reschedule" });

describe("RescheduleSheet", () => {
  it("saves the date, the cause and the note", async () => {
    const props = sheetProps();
    await render(<RescheduleSheet {...props} />);

    expect(screen.getByLabelText("New date")).toHaveDisplayValue("2026-11-09");
    await userEvent.press(screen.getByRole("radio", { name: "Put it off" }));
    await userEvent.paste(screen.getByLabelText("Note"), "Too tired");
    await userEvent.press(save());

    expect(props.onSave).toHaveBeenCalledWith({
      to: "2026-11-09",
      cause: "avoidance",
      note: "Too tired",
    });
  });

  it("waits for a cause before saving", async () => {
    const props = sheetProps();
    await render(<RescheduleSheet {...props} />);

    expect(save()).toBeDisabled();
    await userEvent.press(screen.getByRole("radio", { name: "Couldn't — outside" }));
    expect(screen.getByRole("radio", { name: "Couldn't — outside" })).toBeChecked();
    expect(save()).toBeEnabled();
  });

  it.each(["2026-11-07", ""])("refuses the date %j, before the earliest one", async (date) => {
    await render(<RescheduleSheet {...sheetProps()} />);

    await userEvent.press(screen.getByRole("radio", { name: "Put it off" }));
    await userEvent.paste(screen.getByLabelText("New date"), date);

    expect(save()).toBeDisabled();
  });

  it("needs a connection to save", async () => {
    await render(<RescheduleSheet {...sheetProps({ offline: true })} />);

    await userEvent.press(screen.getByRole("radio", { name: "Put it off" }));

    expect(screen.getByText("Rescheduling needs a connection.")).toBeOnTheScreen();
    expect(save()).toBeDisabled();
  });

  it("holds Save while sending", async () => {
    await render(<RescheduleSheet {...sheetProps({ pending: true })} />);

    await userEvent.press(screen.getByRole("radio", { name: "Put it off" }));

    expect(save()).toBeDisabled();
  });

  it("says so when the save failed, and lets it be tried again", async () => {
    await render(<RescheduleSheet {...sheetProps({ failed: true })} />);

    await userEvent.press(screen.getByRole("radio", { name: "Put it off" }));

    expect(screen.getByText("Couldn't reschedule. Try again.")).toBeOnTheScreen();
    expect(save()).toBeEnabled();
  });

  it("closes on Cancel", async () => {
    const props = sheetProps();
    await render(<RescheduleSheet {...props} />);

    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onClose).toHaveBeenCalled();
  });
});

async function renderSkip() {
  const props = { name: "Read", onSave: jest.fn(), onClose: jest.fn() };
  await render(<SkipSheet {...props} />);

  return props;
}

describe("SkipSheet", () => {
  it("saves the cause on one tap, with no note", async () => {
    const props = await renderSkip();

    expect(screen.queryByLabelText("Note")).not.toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Couldn't — outside" }));

    expect(props.onSave).toHaveBeenCalledWith({ cause: "outside", note: "" });
  });

  it("keeps the note behind Add note and saves it with the cause", async () => {
    const props = await renderSkip();

    await userEvent.press(screen.getByRole("button", { name: "Add note" }));
    await userEvent.paste(screen.getByLabelText("Note"), "  Too tired ");
    await userEvent.press(screen.getByRole("button", { name: "Put it off" }));

    expect(props.onSave).toHaveBeenCalledWith({ cause: "avoidance", note: "Too tired" });
  });

  it("closes on Not now without saving", async () => {
    const props = await renderSkip();

    await userEvent.press(screen.getByRole("button", { name: "Not now" }));

    expect([props.onClose.mock.calls.length, props.onSave.mock.calls.length]).toEqual([1, 0]);
  });
});

const openSheet = (onClose = jest.fn()) =>
  render(
    <BottomSheet label="Walk, Saturday 14 November" onClose={onClose}>
      <Text>Inside</Text>
    </BottomSheet>,
  );

describe("BottomSheet", () => {
  it("names the sheet, draws a drag handle and keeps its foot above the gesture bar", async () => {
    await openSheet();

    expect(screen.getByLabelText("Walk, Saturday 14 November")).toBeOnTheScreen();
    expect(screen.getByTestId("sheet-handle", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByTestId("sheet-panel")).toHaveProp(
      "className",
      expect.stringContaining("pb-safe"),
    );
  });

  it("closes from the scrim", async () => {
    const onClose = jest.fn();
    await openSheet(onClose);

    await userEvent.press(screen.getByLabelText("Close"));

    expect(onClose).toHaveBeenCalled();
  });

  it("starts in place with Reduce Motion on", async () => {
    const reduced = jest.spyOn(Reanimated, "useReducedMotion").mockReturnValue(true);
    await openSheet();

    expect(screen.getByLabelText("Walk, Saturday 14 November")).toHaveStyle({
      transform: [{ translateY: 0 }],
    });
    reduced.mockRestore();
  });

  it.each([
    { drag: "a slow long drag", dy: 120, ms: 1000, closes: true },
    { drag: "a short flick", dy: 30, ms: 20, closes: true },
    { drag: "a slow short drag", dy: 40, ms: 1000, closes: false },
  ])("closes on $drag: $closes", async ({ dy, ms, closes }) => {
    const onClose = jest.fn();
    await openSheet(onClose);
    const handle = screen.getByTestId("sheet-handle", { includeHiddenElements: true });

    await fireEvent(handle, "responderGrant", touchAt(0, 0));
    await fireEvent(handle, "responderMove", touchAt(dy, ms));
    await fireEvent(handle, "responderRelease", touchAt(dy, ms));

    expect(onClose).toHaveBeenCalledTimes(closes ? 1 : 0);
  });
});

// One finger on the handle, as React Native's responder system reports it.
function touchAt(pageY: number, ms: number) {
  const touch = {
    touchActive: true,
    startPageX: 0,
    startPageY: 0,
    startTimeStamp: 0,
    currentPageX: 0,
    currentPageY: pageY,
    currentTimeStamp: ms,
    previousPageX: 0,
    previousPageY: 0,
    previousTimeStamp: 0,
  };

  return {
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: ms,
      touchBank: [touch],
    },
  };
}
