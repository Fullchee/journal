import { Toaster } from "@/ui";
import { act, render, renderHook, screen, userEvent } from "@testing-library/react-native";
import { Linking } from "react-native";

import { useApkUpdateToast } from "@/lib/apk-update/use-apk-update-toast.android";
import { useApkUpdateToast as useWebApkUpdateToast } from "@/lib/apk-update/use-apk-update-toast";

interface MockUpdates {
  isEnabled: boolean;
  runtimeVersion: string | null;
}

const mockUpdates: MockUpdates = {
  isEnabled: true,
  runtimeVersion: "installed-fingerprint",
};

jest.mock("expo-updates", () => ({
  get isEnabled() {
    return mockUpdates.isEnabled;
  },
  get runtimeVersion() {
    return mockUpdates.runtimeVersion;
  },
}));

const fetchSpy = jest.spyOn(globalThis, "fetch");
const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

const MESSAGE = "A new version of Journal is ready to install.";

function latestRelease(body: string, status = 200) {
  fetchSpy.mockResolvedValue(new Response(body, { status }));
}

function App() {
  useApkUpdateToast();

  return <Toaster bottomOffset={80} />;
}

async function launch() {
  await render(<App />);
  // Let the fetch and its body settle.
  await act(() => Promise.resolve());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdates.isEnabled = true;
  mockUpdates.runtimeVersion = "installed-fingerprint";
});

afterEach(async () => {
  await act(() => jest.runOnlyPendingTimers());
});

it("offers the latest APK when its native code differs, and opens its download", async () => {
  latestRelease("new-fingerprint\n");
  await launch();

  expect(fetchSpy).toHaveBeenCalledWith(
    "https://github.com/Fullchee/journal/releases/latest/download/runtime-version.txt",
  );
  await userEvent.press(await screen.findByRole("button", { name: "Install" }));

  expect(openURL).toHaveBeenCalledWith(
    "https://github.com/Fullchee/journal/releases/latest/download/journal.apk",
  );
  expect(screen.queryByText(MESSAGE)).not.toBeOnTheScreen();
});

it("stays quiet when the latest APK has this one's native code", async () => {
  latestRelease("installed-fingerprint\n");
  await launch();

  expect(screen.queryByText(MESSAGE)).not.toBeOnTheScreen();
});

it("stays quiet when the latest release has no runtime version", async () => {
  latestRelease("Not Found", 404);
  await launch();

  expect(screen.queryByText(MESSAGE)).not.toBeOnTheScreen();
});

it("stays quiet offline", async () => {
  fetchSpy.mockRejectedValue(new TypeError("Network request failed"));
  await launch();

  expect(screen.queryByText(MESSAGE)).not.toBeOnTheScreen();
});

it.each([
  ["a development build", { isEnabled: false, runtimeVersion: "installed-fingerprint" }],
  ["a build without a runtime version", { isEnabled: true, runtimeVersion: null }],
])("skips the check in %s", async (_name, updates) => {
  Object.assign(mockUpdates, updates);
  await launch();

  expect(fetchSpy).not.toHaveBeenCalled();
});

it("does nothing off Android", async () => {
  await renderHook(useWebApkUpdateToast);

  expect(fetchSpy).not.toHaveBeenCalled();
});
