import "react-native-gesture-handler/jestSetup";

import { timeoutManager } from "@tanstack/react-query";
import { existsSync, readdirSync } from "node:fs";

jest.mock("react-native-reanimated", () =>
  jest.requireActual<object>("react-native-reanimated/mock"),
);

jest.mock("react-native-notify-kit", () =>
  jest.requireActual<object>("react-native-notify-kit/jest-mock"),
);

// Loading the real SDK starts a cleanup interval that keeps Jest from exiting; tests never send events anyway.
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  wrap: <T>(component: T) => component,
  wrapExpoRouterErrorBoundary: <T>(boundary: T) => boundary,
  expoRouterIntegration: jest.fn(() => ({ name: "ExpoRouter" })),
  consoleLoggingIntegration: jest.fn(() => ({ name: "ConsoleLogs" })),
}));

jest.mock("../modules/journal-android", () => ({
  __esModule: true,
  default: {
    setAlarms: jest.fn(),
    setHabits: jest.fn(),
    clearTileSession: jest.fn(),
    alarmSound: jest.fn(() => ({ title: "Default alarm" })),
    pickAlarmSound: jest.fn(() => Promise.resolve(null)),
    createAlarmChannel: jest.fn(() => "alarms-sound"),
  },
}));

// Its views are native components with no view manager under Jest; the shipped mock renders the Markdown as plain text.
jest.mock("react-native-enriched-markdown", () =>
  jest.requireActual<object>("react-native-enriched-markdown/jest"),
);

// d3 ships only .mjs entry points, which jest-expo's transform skips; its UMD builds load as CommonJS.
const mockD3s = new Set(
  (require.resolve.paths("d3") ?? [])
    .filter((dir) => existsSync(dir))
    .flatMap((dir) => readdirSync(dir))
    .filter((name) => name.startsWith("d3-") && require.resolve(name).endsWith(".mjs")),
);

for (const mockD3 of mockD3s) {
  jest.doMock(mockD3, () =>
    jest.requireActual<object>(require.resolve(mockD3).replace(/\.mjs$/, ".min.js")),
  );
}

// TanStack's gc and retry timers outlive a test, and MutationCache.clear() leaves each mutation's 5-minute gc timer
// running; unref'd, they no longer keep Jest from exiting. Jest's fake timers return Node timer objects too.
timeoutManager.setTimeoutProvider({
  setTimeout: (callback, delay) => setTimeout(callback, delay).unref(),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (callback, delay) => setInterval(callback, delay).unref(),
  clearInterval: (id) => clearInterval(id),
});
