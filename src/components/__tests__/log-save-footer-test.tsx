import { render, screen, userEvent } from "@testing-library/react-native";
import { router } from "expo-router";

import { LogSaveFooter } from "@/components/log-save-footer";
import { ApiError } from "@/lib/api/errors";

jest.mock("expo-router", () => ({ router: { canGoBack: () => true, back: jest.fn() } }));

describe("LogSaveFooter", () => {
  it("saves, and Cancel closes the modal", async () => {
    const onSave = jest.fn();

    await render(<LogSaveFooter error={null} reason={null} disabled={false} onSave={onSave} />);
    await userEvent.press(screen.getByRole("button", { name: "Save" }));
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("shows the API's reason when Save is refused", async () => {
    const error = new ApiError(409, { error: "Already logged." });

    await render(<LogSaveFooter error={error} reason={null} disabled onSave={jest.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Already logged.");
    expect(screen.getByRole("alert")).toHaveProp("accessibilityLiveRegion", "assertive");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("says beside Save why it is off, as a polite status", async () => {
    await render(<LogSaveFooter error={null} reason="Pick a Habit." disabled onSave={jest.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Pick a Habit.");
    expect(screen.getByRole("status")).toHaveProp("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveProp("accessibilityLiveRegion", "polite");
  });
});
