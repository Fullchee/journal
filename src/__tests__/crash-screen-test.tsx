import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/app/_layout";

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 900 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

const replace = jest.spyOn(router, "replace").mockImplementation(jest.fn());

async function crash() {
  const retry = jest.fn(() => Promise.resolve());

  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ErrorBoundary error={new Error("Invalid time value")} retry={retry} />
    </SafeAreaProvider>,
  );

  return retry;
}

beforeEach(() => replace.mockClear());

it("says what happened in plain words, without the raw error", async () => {
  await crash();

  expect(screen.getByRole("heading", { name: "This screen stopped working." })).toBeOnTheScreen();
  expect(screen.queryByText(/Invalid time value/)).not.toBeOnTheScreen();
});

it("retries the screen", async () => {
  const retry = await crash();

  await userEvent.press(screen.getByRole("button", { name: "Retry" }));

  expect(retry).toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});

it("goes back to Today and clears the error", async () => {
  const retry = await crash();

  await userEvent.press(screen.getByRole("button", { name: "Back to Today" }));

  expect(replace).toHaveBeenCalledWith("/");
  await waitFor(() => expect(retry).toHaveBeenCalled());
});
