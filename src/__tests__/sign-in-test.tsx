import { renderRouter, screen } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import {
  preloadRoutes,
  resetRouteMocks,
  setAuthStatus,
  setOnline,
  signIn,
  signOut,
} from "../../jest/route-mocks";
// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import type * as RouteMocks from "../../jest/route-mocks";

jest.mock("@/lib/data/data-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockDataProvider(),
);

jest.mock("@/lib/auth/auth-provider", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockAuthProvider(),
);

jest.mock("uniwind", () =>
  jest.requireActual<typeof RouteMocks>("../../jest/route-mocks").mockUniwind(),
);

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

beforeEach(() => {
  setAuthStatus("signed-out");
  jest.clearAllMocks();
});

afterEach(resetRouteMocks);

it("sends a signed-out user from a deep link to sign in", async () => {
  await renderRouter(APP_DIR, { initialUrl: "/habits" });

  expect(screen).toHavePathname("/sign-in");
  await userEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(signIn).toHaveBeenCalled();
});

it("tells anyone but the owner the app is the owner's", async () => {
  setAuthStatus("not-owner");
  await renderRouter(APP_DIR);

  expect(screen.getByText("This app is for the owner")).toBeOnTheScreen();
  await userEvent.press(screen.getByRole("button", { name: "Sign out" }));
  expect(signOut).toHaveBeenCalled();
});

it("disables sign in offline", async () => {
  setOnline(false);
  await renderRouter(APP_DIR);

  expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  expect(screen.getByText("Offline. Signing in needs a connection.")).toBeOnTheScreen();
});

it("shows nothing while the stored session loads", async () => {
  setAuthStatus("loading");
  await renderRouter(APP_DIR);

  expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
});

it("keeps a signed-in owner out of the sign-in screen", async () => {
  setAuthStatus("signed-in");
  await renderRouter(APP_DIR, { initialUrl: "/sign-in" });

  expect(screen).not.toHavePathname("/sign-in");
});
