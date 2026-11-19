// Web (Access let the page load) and the Maestro build start signed in and never change status.
import type { AuthStatus } from "@/lib/auth/auth-status";

function unsubscribe() {
  // The status never changes, so there is no listener to drop.
}

export const subscribeAuthStatus = (_listener: (status: AuthStatus) => void) => unsubscribe;

export const loadAuthStatus = (): Promise<AuthStatus> => Promise.resolve("signed-in");
