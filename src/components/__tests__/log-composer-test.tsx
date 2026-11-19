import type { Logged } from "@/core";
import { act, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import type * as ReactNative from "react-native";
import { DeviceEventEmitter, Platform } from "react-native";

import { LogComposer } from "@/components/log-composer";
import { dismissModal } from "@/components/modal-header";
import { useLogDraft } from "@/hooks/use-log-draft";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../../jest/route-mocks";

jest.mock("@/hooks/use-log-draft", () => ({ useLogDraft: jest.fn() }));

jest.mock("@/components/modal-header", () => ({ dismissModal: jest.fn() }));

// The Receipt's own Undo is covered by the log box route tests; here only its Done matters.
jest.mock("@/components/log-receipt", () => {
  const { Pressable, Text } = jest.requireActual<typeof ReactNative>("react-native");

  return {
    LogReceipt: ({ logged, onDone }: { logged: Logged; onDone: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onDone}>
        <Text>{logged.text}</Text>
      </Pressable>
    ),
  };
});

jest.mock("@/lib/data/data-provider", () => ({ useIsOnline: () => true }));

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../../jest/route-mocks").mockUniwind(),
);

const open = jest.fn<Promise<boolean>, [string]>();
const dismissReceipt = jest.fn();
const LOGGED: Logged = { type: "logged", text: "Logged Walk.", action: 1 };

beforeEach(() => {
  open.mockReset().mockResolvedValue(true);
  dismissReceipt.mockReset();
  jest.mocked(dismissModal).mockReset();
  jest.mocked(useLogDraft).mockReturnValue({
    open,
    busy: false,
    unclear: "",
    receipt: null,
    dismissReceipt,
  });
  jest.replaceProperty(Platform, "OS", "web");
});

afterEach(() => jest.restoreAllMocks());

interface WebKey {
  key: string;
  shiftKey?: boolean;
  isComposing?: boolean;
}

async function pressKey(nativeEvent: WebKey) {
  await render(<LogComposer />);
  const input = screen.getByLabelText("Log something");

  await userEvent.paste(input, " walked 20 min ");
  await fireEvent(input, "keyPress", { nativeEvent, preventDefault: jest.fn() });
}

describe("LogComposer on web", () => {
  it("opens one row tall, matching the Send button", async () => {
    await render(<LogComposer />);

    expect(screen.getByLabelText("Log something")).toHaveProp("rows", 1);
  });

  it("grows to fit the placeholder when large text wraps it", async () => {
    await render(<LogComposer />);

    expect(screen.getByLabelText("Log something")).toHaveProp(
      "className",
      expect.stringContaining("web:field-sizing-content"),
    );
  });

  it("sends the trimmed text on Enter", async () => {
    await pressKey({ key: "Enter" });

    expect(open).toHaveBeenCalledWith("walked 20 min");
  });

  it.each([
    ["Shift+Enter, which starts a new line", { key: "Enter", shiftKey: true }],
    ["an IME confirming a word", { key: "Enter", isComposing: true }],
    ["any other key", { key: "a" }],
  ])("does not send on %s", async (_name, nativeEvent) => {
    await pressKey(nativeEvent);

    expect(open).not.toHaveBeenCalled();
  });
});

describe("LogComposer on submit", () => {
  it("sends the trimmed text from the keyboard's send key", async () => {
    await render(<LogComposer />);
    const input = screen.getByLabelText("Log something");

    await userEvent.paste(input, " walked ");
    await fireEvent(input, "submitEditing");

    expect(open).toHaveBeenCalledWith("walked");
  });

  it("sends nothing while the box is empty", async () => {
    await render(<LogComposer />);

    await fireEvent(screen.getByLabelText("Log something"), "submitEditing");

    expect(open).not.toHaveBeenCalled();
  });
});

it("leaves the row count to native, which grows from one line", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  await render(<LogComposer />);

  expect(screen.getByLabelText("Log something")).not.toHaveProp("rows");
});

const isHidden = () =>
  /\bhidden\b/.test(String(screen.getByTestId("log-composer").props["className"]));

const showKeyboard = () => act(() => DeviceEventEmitter.emit("keyboardDidShow", {}));

describe("LogComposer with the keyboard open", () => {
  it("stays in view while the composer is the field being typed in", async () => {
    await render(<LogComposer />);

    await fireEvent(screen.getByLabelText("Log something"), "focus");
    await showKeyboard();

    expect(isHidden()).toBe(false);
  });

  it("steps aside while another field is typed in", async () => {
    await render(<LogComposer />);

    await showKeyboard();

    expect(isHidden()).toBe(true);
  });

  it("steps aside when focus moves from the composer to another field", async () => {
    await render(<LogComposer />);
    const input = screen.getByLabelText("Log something");

    await fireEvent(input, "focus");
    await showKeyboard();
    await fireEvent(input, "blur");

    expect(isHidden()).toBe(true);
  });

  it("comes back once the keyboard closes", async () => {
    await render(<LogComposer />);

    await showKeyboard();
    await act(() => DeviceEventEmitter.emit("keyboardDidHide", {}));

    expect(isHidden()).toBe(false);
  });
});

describe("LogComposer with a Receipt", () => {
  beforeEach(() => {
    jest.mocked(useLogDraft).mockReturnValue({
      open,
      busy: false,
      unclear: "",
      receipt: LOGGED,
      dismissReceipt,
    });
  });

  it("clears the Receipt on Done and stays on Today", async () => {
    await render(<LogComposer />);

    await userEvent.press(screen.getByRole("button", { name: "Logged Walk." }));

    expect(dismissReceipt).toHaveBeenCalled();
    expect(dismissModal).not.toHaveBeenCalled();
  });

  it("clears the Receipt and closes the log modal on Done", async () => {
    await render(<LogComposer replace />);

    await userEvent.press(screen.getByRole("button", { name: "Logged Walk." }));

    expect(dismissReceipt).toHaveBeenCalled();
    expect(dismissModal).toHaveBeenCalled();
  });
});
