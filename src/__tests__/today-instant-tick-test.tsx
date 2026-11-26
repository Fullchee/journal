import { onlineManager } from "@tanstack/react-query";
import { act, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

import { apiFetch } from "@/lib/api/api-fetch";
import { createQueryClient } from "@/lib/data/query-client";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks, setRouteQueryClient } from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { fakeApi } from "../../jest/fake-api";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { checkIn, habit } from "../../jest/fixtures";
// eslint-disable-next-line no-restricted-imports -- Jest maps sonner-native to this stand-in, so both are one module
import { toast } from "../../jest/sonner-native";

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

jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

beforeEach(() => {
  // The mini tick, never a big drawing.
  jest.spyOn(Math, "random").mockReturnValue(0.9);
  setRouteQueryClient(createQueryClient());
});

afterEach(() => {
  toast.dismiss();
  resetRouteMocks();
  jest.restoreAllMocks();
});

// The server never answers a write, so whatever Today shows came from the tap alone.
async function renderWithPendingWrites() {
  fakeApi({
    "/api/check-ins": () => ({ checkIns: [checkIn({})] }),
    "/api/check-ins?at": () => ({ place: null }),
    "/api/habits": () => ({
      habits: [habit({ id: "read", name: "Read" }), habit({ id: "stretch", name: "Stretch" })],
      counts: {},
      durations: {},
    }),
    "/api/connections": () => ({ connections: [] }),
    "/api/health-plan": () => ({ item: { body: "", updatedAt: null } }),
  });
  const answer = jest.mocked(apiFetch).getMockImplementation();

  jest
    .mocked(apiFetch)
    .mockImplementation((...request) =>
      request[1].method === "POST" ? new Promise<never>(jest.fn()) : answer!(...request),
    );
  await renderRouter(APP_DIR, { initialUrl: "/today" });
  await screen.findByText("Read");
}

const undo = () =>
  userEvent.press(within(screen.getByTestId("toast")).getByRole("button", { name: "Undo" }));

describe("Ticking a Habit on Today", () => {
  it("drops the row from the due list while its save is pending", async () => {
    await renderWithPendingWrites();

    await userEvent.press(screen.getByRole("checkbox", { name: "Read done today" }));

    expect(screen.queryByText("Read")).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Done today (1)" })).toBeOnTheScreen();
    expect(screen.getByText("Stretch")).toBeOnTheScreen();
  });

  it("plays the tick on the closed Done today list the row moved into", async () => {
    await renderWithPendingWrites();

    await userEvent.press(screen.getByRole("checkbox", { name: "Read done today" }));

    const tick = screen.getByTestId("celebration on read", { includeHiddenElements: true });

    const toggle = screen.getByRole("button", { name: "Done today (1)" });

    expect(within(tick).getByTestId("tick", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(toggle.parent).toContainElement(tick);
    expect(toggle.parent).not.toContainElement(screen.getByText("Stretch"));
  });

  it("keeps the same Done today toggle through opening, closing and the next tick", async () => {
    await renderWithPendingWrites();
    await userEvent.press(screen.getByRole("checkbox", { name: "Read done today" }));
    const toggle = screen.getByRole("button", { name: "Done today (1)" });

    await userEvent.press(toggle);
    expect(screen.getByRole("button", { name: "Done today (1)" })).toBe(toggle);

    await userEvent.press(toggle);
    expect(screen.getByRole("button", { name: "Done today (1)" })).toBe(toggle);

    await userEvent.press(screen.getByRole("checkbox", { name: "Stretch done today" }));
    expect(screen.getByRole("button", { name: "Done today (2)" })).toBe(toggle);
  });

  it("puts the row back on Undo while both saves are pending", async () => {
    await renderWithPendingWrites();

    await userEvent.press(screen.getByRole("checkbox", { name: "Read done today" }));
    expect(screen.queryByText("Read")).not.toBeOnTheScreen();
    await undo();

    expect(screen.getByRole("checkbox", { name: "Read done today" })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /^Done today/ })).not.toBeOnTheScreen();
  });

  it("keeps the row off the due list while the save waits offline", async () => {
    await renderWithPendingWrites();
    await act(() => onlineManager.setOnline(false));

    await userEvent.press(screen.getByRole("checkbox", { name: "Read done today" }));

    expect(screen.queryByText("Read")).not.toBeOnTheScreen();
    await waitFor(() => expect(screen.getByText("Offline")).toBeOnTheScreen());
    // Later renders read the cache, which holds the queued check.
    await userEvent.press(screen.getByRole("button", { name: "Done today (1)" }));
    expect(screen.getByRole("checkbox", { name: "Read done today" })).toBeChecked();
  });
});
