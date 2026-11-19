// Web: Access guards the whole origin and sets the CF_Authorization cookie, so the app holds no token.
// The native twin is auth.native.ts; both export the same functions.
import type { AuthStatus } from "@/lib/auth/auth-status";

export { loadAuthStatus, subscribeAuthStatus } from "@/lib/auth/always-signed-in";

const RELOADED_AT_KEY = "auth.reloadedAt";

// A second 401 this soon after a reload means Access let the login through but the API still refuses; stop reloading.
const RELOAD_COOLDOWN_MS = 60_000;

/**
 * `manual` turns Access's redirect to its login page into a readable opaque response instead of a CORS failure.
 */
export const authorize = (init: RequestInit): Promise<RequestInit> =>
  Promise.resolve({ ...init, redirect: "manual" });

/**
 * A full reload sends the browser through Access's login, which renews the cookie. The reload replaces the page,
 * so the request is never retried here.
 */
export function recoverFromUnauthorized(): Promise<boolean> {
  const reloadedAt = Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);

  if (Date.now() - reloadedAt >= RELOAD_COOLDOWN_MS) {
    sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
    window.location.reload();
  }

  return Promise.resolve(false);
}

export const signIn = (): Promise<AuthStatus> => {
  window.location.reload();

  return Promise.resolve("signed-in");
};

export const signOut = (): Promise<void> => {
  window.location.assign("/cdn-cgi/access/logout");

  return Promise.resolve();
};
