// Maestro twin of auth.native.ts, swapped in by metro.config.cjs when JOURNAL_E2E=1.
// The local `wrangler pages dev` API reads DEV_EMAIL from `.maestro/api/wrangler.toml` when a request has no Access JWT, so no token is sent.
import type { AuthStatus } from "@/lib/auth/auth-status";

export { loadAuthStatus, subscribeAuthStatus } from "@/lib/auth/always-signed-in";

export const authorize = (init: RequestInit): Promise<RequestInit> => Promise.resolve(init);

/** A 401 from the local API means DEV_EMAIL is missing; retrying can't fix that. */
export const recoverFromUnauthorized = (): Promise<boolean> => Promise.resolve(false);

export const signIn = (): Promise<AuthStatus> => Promise.resolve("signed-in");

export const signOut = (): Promise<void> => Promise.resolve();
