import { render, screen, userEvent } from "@testing-library/react-native";

import { torontoDay } from "@/core";
import { DateField } from "@/ui";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { pickOnAndroid } from "../../../jest/android-picker";

const open = pickOnAndroid();

// Each test starts on dialogs that pick nothing.
afterEach(() => pickOnAndroid().mockClear());

const openedWith = () => open.mock.calls.at(-1)?.[0];

describe("DateField", () => {
  it("opens on its day, bounded by min and max", async () => {
    await render(
      <DateField
        label="Day"
        value="2026-11-14"
        min="2026-11-08"
        max="2026-12-01"
        onChange={jest.fn()}
      />,
    );

    await userEvent.press(screen.getByLabelText("Day: 2026-11-14"));

    expect(openedWith()).toMatchObject({
      value: new Date(2026, 10, 14),
      minimumDate: new Date(2026, 10, 8),
      maximumDate: new Date(2026, 11, 1),
    });
  });

  it("with no day yet, says so and opens on the earliest day allowed", async () => {
    await render(<DateField label="Day" value="" min="2026-11-08" onChange={jest.fn()} />);

    expect(screen.getByText("Pick a day")).toBeOnTheScreen();
    await userEvent.press(screen.getByLabelText("Day: not picked"));

    expect(openedWith()?.value).toEqual(new Date(2026, 10, 8));
    expect(openedWith()).not.toHaveProperty("maximumDate");
  });

  it("with no day and no bound, opens on the Toronto today", async () => {
    await render(<DateField label="Day" value="" onChange={jest.fn()} />);

    await userEvent.press(screen.getByLabelText("Day: not picked"));

    const today = torontoDay(new Date());
    expect(openedWith()?.value).toEqual(new Date(`${today}T00:00`));
    expect(openedWith()).not.toHaveProperty("minimumDate");
  });

  it("answers the picked day as YYYY-MM-DD", async () => {
    const onChange = jest.fn();

    pickOnAndroid(new Date(2026, 0, 5));
    await render(<DateField label="Day" value="2026-11-14" onChange={onChange} />);

    await userEvent.press(screen.getByLabelText("Day: 2026-11-14"));

    expect(onChange).toHaveBeenCalledWith("2026-01-05");
  });
});
