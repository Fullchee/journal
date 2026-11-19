import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { extractExpoPathFromURL } from "expo-router/build/fork/extractPathFromURL";
import { renderRouter, screen } from "expo-router/testing-library";
import * as z from "zod/mini";

// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes, resetRouteMocks } from "../../jest/route-mocks";
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

// Screens stay loading: no request ever answers, and only the route matters here.
jest.mock("@/lib/api/api-fetch", () => ({
  apiFetch: () => Promise.withResolvers<never>().promise,
}));

const APP_DIR = "./src/app";

beforeAll(() => preloadRoutes(APP_DIR));

afterEach(resetRouteMocks);

// Every page URL of the SvelteKit `journal` app (src/routes); docs/url-parity.md keeps the same table.
const JOURNAL_URLS: [string, string[]][] = [
  ["/", ["(tabs)"]],
  ["/?zone=Sun", ["(tabs)"]],
  ["/check-ins", ["(tabs)", "check-ins"]],
  ["/habits", ["(tabs)", "habits"]],
  ["/library", ["(tabs)", "(notes)", "library"]],
  ["/library/walk", ["(tabs)", "(notes)", "library", "[id]"]],
  ["/notes", ["(tabs)", "(notes)", "notes"]],
  ["/notes?type=goals", ["(tabs)", "(notes)", "notes"]],
  ["/notes/goals/12", ["(tabs)", "(notes)", "notes", "[type]", "[id]"]],
  ["/notes/health-records/4", ["(tabs)", "(notes)", "notes", "[type]", "[id]"]],
  ["/connections", ["(tabs)", "connections"]],
  ["/connections/3", ["(tabs)", "connections", "[id]"]],
  ["/plan", ["plan"]],
  ["/session-brief", ["session-brief"]],
  ["/health-plan", ["(tabs)", "(notes)", "health-plan"]],
];

it.each(JOURNAL_URLS)("opens journal URL %s on its screen", async (url, segments) => {
  await renderRouter(APP_DIR, { initialUrl: url });

  expect(screen).toHaveSegments(segments);
});

const ExpoConfig = z.object({ scheme: z.string(), android: z.object({ package: z.string() }) });
const AppJson = z.object({ expo: ExpoConfig });

const appJson = readFileSync(path.join(__dirname, "../../app.json"), "utf8");
const { expo } = AppJson.parse(JSON.parse(appJson));

const routedPath = (deepLink: string) => `/${extractExpoPathFromURL([], deepLink)}`;

it("registers the Android scheme the deep links use", () => {
  expect(expo.scheme).toBe(expo.android.package);
});

// renderRouter drops a custom scheme's host, so this runs the native URL-to-path step, which reads the host as the first path part.
it.each(JOURNAL_URLS)(
  "opens Android deep link to journal URL %s on its screen",
  async (url, segments) => {
    await renderRouter(APP_DIR, { initialUrl: routedPath(`${expo.scheme}://${url.slice(1)}`) });

    expect(screen).toHaveSegments(segments);
  },
);

it("keeps the ids and query of an Android deep link", async () => {
  const deepLink = `${expo.scheme}://notes/goals/12?from=widget`;

  await renderRouter(APP_DIR, { initialUrl: routedPath(deepLink) });

  expect(screen).toHaveSearchParams({ type: "goals", id: "12", from: "widget" });
});

it.each([
  ["/library/walk", { id: "walk" }],
  ["/notes/goals/12", { type: "goals", id: "12" }],
  ["/connections/3", { id: "3" }],
])("keeps the ids in %s", async (url, params) => {
  await renderRouter(APP_DIR, { initialUrl: url });

  expect(screen).toHaveSearchParams(params);
});

it("keeps Habit filters from the query string", async () => {
  await renderRouter(APP_DIR, { initialUrl: "/habits?kind=bad&startFrom=2026-01-01" });

  expect(screen).toHavePathname("/habits");
  expect(screen).toHaveSearchParams({ kind: "bad", startFrom: "2026-01-01" });
});

it.each([
  ["/habits?edit=walk", "/habit/walk"],
  ["/?log", "/log"],
])("turns the screen-picking param in %s into %s", async (url, pathname) => {
  await renderRouter(APP_DIR, { initialUrl: url });

  expect(screen).toHavePathname(pathname);
});

// Workers static assets serve public/privacy.html at /privacy, as Pages did for journal.
it.each(["privacy.html", "terms.html"])("ships journal static page %s", (file) => {
  expect(existsSync(path.join(__dirname, "../../public", file))).toBe(true);
});
