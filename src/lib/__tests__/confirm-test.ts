import { Alert, Platform, type AlertButton, type AlertOptions } from "react-native";

import { confirm } from "@/lib/confirm";

const ask = { title: "Delete", message: "This can't be undone.", action: "Delete it" };

afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = "ios";
});

function alertWith(press: (buttons: AlertButton[], options: AlertOptions) => void) {
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons, options) => {
    press(buttons ?? [], options ?? {});
  });
}

describe("confirm", () => {
  it("asks with the browser's own dialog on web", async () => {
    Platform.OS = "web";
    const browserConfirm = jest.fn(() => true);
    Object.assign(globalThis, { confirm: browserConfirm });

    await expect(confirm(ask)).resolves.toBe(true);
    expect(browserConfirm).toHaveBeenCalledWith("Delete\n\nThis can't be undone.");
  });

  it("resolves true when the action button is pressed", async () => {
    alertWith((buttons) => {
      buttons.find(({ text }) => text === "Delete it")?.onPress?.();
    });

    await expect(confirm(ask)).resolves.toBe(true);
  });

  it("resolves false on Cancel", async () => {
    alertWith((buttons) => {
      buttons.find(({ text }) => text === "Cancel")?.onPress?.();
    });

    await expect(confirm(ask)).resolves.toBe(false);
  });

  it("resolves false when the dialog is dismissed", async () => {
    alertWith((_buttons, options) => options.onDismiss?.());

    await expect(confirm(ask)).resolves.toBe(false);
  });
});
