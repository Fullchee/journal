import { render, screen, userEvent } from "@testing-library/react-native";

import { FullScreenAlarmPrompt } from "@/components/habits/full-screen-alarm-prompt";

interface AccessState {
  value: { granted: boolean; open: () => void } | null;
}

const mockAccess: AccessState = { value: null };

jest.mock("@/lib/alarms/full-screen-alarms", () => ({
  useFullScreenAlarms: () => mockAccess.value,
}));

const SETTING = { name: "Allow full-screen alarms" };

test("a phone that blocks full-screen alarms gets a button to the setting", async () => {
  const open = jest.fn();
  mockAccess.value = { granted: false, open };

  await render(<FullScreenAlarmPrompt />);
  await userEvent.press(screen.getByRole("button", SETTING));

  expect(screen.getByText(/Alarms ring as a plain notification/)).toBeOnTheScreen();
  expect(open).toHaveBeenCalledTimes(1);
});

test.each([
  ["a phone that allows full-screen alarms", { granted: true, open: jest.fn() }],
  ["off Android", null],
])("%s shows no prompt", async (_, access) => {
  mockAccess.value = access;

  await render(<FullScreenAlarmPrompt />);

  expect(screen.queryByRole("button", SETTING)).not.toBeOnTheScreen();
});
