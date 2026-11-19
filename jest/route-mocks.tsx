// Mocks for tests that render routes. jest.mock factories can't close over imports, so each test file wires them with
// `jest.mock('@/lib/data/data-provider', () => jest.requireActual('<path>/jest/route-mocks').mockDataProvider())`
// and imports the setters below; both resolve to one module instance per test file.
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { getMockContext } from "expo-router/testing-library";
import { useSyncExternalStore, type ReactNode } from "react";
import type * as Uniwind from "uniwind";

import type { AuthStatus } from "@/lib/auth/auth-status";

interface RouteMockState {
  client: QueryClient | undefined;
  online: boolean;
  authStatus: AuthStatus | "loading";
}

const state: RouteMockState = {
  client: undefined,
  online: true,
  authStatus: "signed-in",
};

const listeners = new Set<() => void>();

export const signIn = jest.fn(() => Promise.resolve());
export const signOut = jest.fn(() => Promise.resolve());

/** The client every DataProvider uses until resetRouteMocks(); tests seed its cache before rendering. */
export const routeQueryClient = () => (state.client ??= new QueryClient());

/**
 * For tests that need the app's capture defaults (createQueryClient), which a mocked data module can't register.
 */
export function setRouteQueryClient(next: QueryClient) {
  state.client = next;
}

const notify = () => listeners.forEach((listener) => listener());

/** Disables online-only forms without pausing queries; onlineManager.setOnline(false) does both. */
export function setOnline(value: boolean) {
  state.online = value;
  notify();
}

export function setAuthStatus(status: AuthStatus | "loading") {
  state.authStatus = status;
  notify();
}

/**
 * Requiring every route opens thousands of files; on a loaded machine that alone outlasts the first test's timeout.
 * Run it in beforeAll: a synchronous hook has no timeout, and renderRouter then finds the routes in the module registry.
 */
export function preloadRoutes(appDir: string) {
  const context = getMockContext(appDir);

  for (const key of context.keys()) context(key);
}

export function resetRouteMocks() {
  state.client?.clear();
  state.client = undefined;
  state.online = true;
  state.authStatus = "signed-in";
  onlineManager.setOnline(true);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const unsubscribe = onlineManager.subscribe(listener);

  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}

/** No persister, storage or connectivity watcher: route tests exercise screens, not the data layer. */
export const mockDataProvider = () => ({
  DataProvider: ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={routeQueryClient()}>{children}</QueryClientProvider>
  ),
  useIsOnline: () =>
    useSyncExternalStore(subscribe, () => state.online && onlineManager.isOnline()),
});

export const mockAuthProvider = () => ({
  useAuth: () => ({
    status: useSyncExternalStore(subscribe, () => state.authStatus),
    signIn,
    signOut,
  }),
});

/**
 * Uniwind's stylesheet isn't compiled in Jest, so tokens are absent and components fall back to their defaults.
 */
export const mockUniwind = () => ({
  ...jest.requireActual<typeof Uniwind>("uniwind"),
  // eslint-disable-next-line eslint-react/no-unnecessary-use-prefix -- replaces Uniwind's hook of this name
  useCSSVariable: (names: string | string[]) =>
    Array.isArray(names) ? Array.from({ length: names.length }) : undefined,
});
