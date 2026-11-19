import { render, screen, userEvent } from "@testing-library/react-native";

import { minutesOf, torontoTime } from "@/core";
import { TimeField } from "@/ui";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../../jest/android-picker";

const open = pickOnAndroid();

// Each test starts on dialogs that pick nothing.
afterEach(() => pickOnAndroid().mockClear());

const openedWith = () => open.mock.calls.at(-1)?.[0];

describe("TimeField", () => {
  it("opens the clock on its time", async () => {
    await render(<TimeField label="Alarm time" value="07:05" onChange={jest.fn()} />);

    await userEvent.press(screen.getByLabelText("Alarm time: 7:05 AM"));

    expect(openedWith()?.mode).toBe("time");
    expect([openedWith()?.value.getHours(), openedWith()?.value.getMinutes()]).toEqual([7, 5]);
  });

  it("asks for a time and opens the clock on Toronto's now before one is picked", async () => {
    await render(<TimeField label="Starts at" value="" onChange={jest.fn()} />);

    await userEvent.press(screen.getByText("Pick a time"));

    expect(screen.getByLabelText("Starts at: not picked")).toBeOnTheScreen();
    const opened = openedWith()?.value ?? new Date(NaN);
    const shown = opened.getHours() * 60 + opened.getMinutes();
    const now = minutesOf(torontoTime(new Date()));
    expect(Math.abs(shown - now)).toBeLessThanOrEqual(1);
  });

  it("shows its time with AM or PM and answers the picked time as HH:MM", async () => {
    const onChange = jest.fn();

    pickOnAndroid(new Date(2026, 0, 5, 21, 9));
    await render(<TimeField label="Alarm time" value="08:00" onChange={onChange} />);

    await userEvent.press(screen.getByLabelText("Alarm time: 8:00 AM"));

    expect(onChange).toHaveBeenCalledWith("21:09");
  });
});
