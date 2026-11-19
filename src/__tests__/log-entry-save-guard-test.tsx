import { renderRouter, screen } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";
import type * as React from "react";
import type * as ReactNative from "react-native";

import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setRouteQueryClient } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { habit } from "../../jest/fixtures";

jest.mock("@/lib/data/data-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockDataProvider(),
);

jest.mock("@/lib/auth/auth-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockAuthProvider(),
);

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockUniwind(),
);

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

// The real footer disables Save while the form isn't ready, so only a stand-in can press it then.
jest.mock("@/components/log-save-footer", () => ({
  LogSaveFooter: ({ onSave }: { onSave: () => void }) =>
    jest
      .requireActual<typeof React>("react")
      .createElement(jest.requireActual<typeof ReactNative>("react-native").Pressable, {
        role: "button",
        "aria-label": "Press Save",
        onPress: onSave,
      }),
}));

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

beforeEach(() => setRouteQueryClient(createQueryClient()));

afterEach(resetRouteMocks);

it("sends nothing when Save is pressed before the form is ready", async () => {
  const { writes } = fakeApi({
    "/api/habits": () => ({
      habits: [habit()],
      goals: [],
      counts: {},
      durations: {},
    }),
  });

  await renderRouter(APP_DIR, { initialUrl: "/log-entry" });
  await userEvent.press(await screen.findByRole("button", { name: "Press Save" }));

  expect(writes).toEqual([]);
});
