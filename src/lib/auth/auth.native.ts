import {
  AuthRequest,
  refreshAsync,
  exchangeCodeAsync,
  TokenError,
  TokenResponse,
} from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { ENV } from "varlock/env";

import { PRODUCTION_ORIGIN } from "@/lib/api/config";
import { NetworkError, SignedOutError } from "@/lib/api/errors";
import type { AuthStatus } from "@/lib/auth/auth-status";

const CLIENT_ID = ENV.EXPO_PUBLIC_ACCESS_CLIENT_ID;

const discovery = {
  authorizationEndpoint: ENV.EXPO_PUBLIC_ACCESS_AUTHORIZE_URL,
  tokenEndpoint: ENV.EXPO_PUBLIC_ACCESS_TOKEN_URL,
};

// Access allows only redirects listed exactly, so this is fixed rather than built per build (Expo Go's exp:// never matches).
const REDIRECT_URI = "dev.fullchee.journal://oauth";

// Access issues tokens for one protected app, named by its origin.
const extraParams = { resource: PRODUCTION_ORIGIN };

// A grant is issued for one API origin, so a token kept for another origin never refreshes here.
const REFRESH_TOKEN_KEY = `access.refreshToken.${new URL(PRODUCTION_ORIGIN).host}`;

// Refresh before the token has under a minute left, so a request never races its expiry.
const FRESH_MARGIN_SECONDS = -60;

// Access rejects a PKCE challenge that doesn't start with a letter or digit.
const ACCEPTED_CHALLENGE = /^[A-Z0-9]/i;

interface Session {
  accessToken: TokenResponse | null;
  refreshing: Promise<TokenResponse> | null;
}

const session: Session = {
  accessToken: null,
  refreshing: null,
};

const listeners = new Set<(status: AuthStatus) => void>();

const announce = (status: AuthStatus) => listeners.forEach((listener) => listener(status));

export function subscribeAuthStatus(listener: (status: AuthStatus) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * A stored refresh token means signed in, even offline; whether Access still honours it shows on the next refresh.
 */
export async function loadAuthStatus(): Promise<AuthStatus> {
  // keep() never stores an empty refresh token.
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);

  return refreshToken === null ? "signed-out" : "signed-in";
}

async function keep(token: TokenResponse) {
  session.accessToken = token;

  // Access may rotate the refresh token; a response without one keeps the old one valid.
  if (token.refreshToken !== undefined && token.refreshToken !== "")
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token.refreshToken);

  return token;
}

async function forgetSession() {
  session.accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

async function refresh(): Promise<TokenResponse> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);

  if (refreshToken === null) throw new SignedOutError();

  try {
    const token = await refreshAsync({ clientId: CLIENT_ID, refreshToken, extraParams }, discovery);

    return await keep(token);
  } catch (error) {
    // Only Access saying the grant is gone signs out.
    if (error instanceof TokenError && error.code === "invalid_grant") {
      await forgetSession();
      announce("signed-out");
      throw new SignedOutError();
    }

    // Any other failure (offline, a 5xx, a bad response) keeps the session and is retried later.
    throw new NetworkError(error);
  }
}

// One refresh at a time: the queue replays several requests at once and each needs the same new token.
async function refreshOnce() {
  try {
    return await refresh();
  } finally {
    session.refreshing = null;
  }
}

async function freshAccessToken() {
  const current = session.accessToken;

  if (
    current !== null &&
    current.accessToken !== "" &&
    TokenResponse.isTokenFresh(current, FRESH_MARGIN_SECONDS)
  )
    return current.accessToken;

  session.refreshing ??= refreshOnce();
  const token = await session.refreshing;

  return token.accessToken;
}

export async function authorize(init: RequestInit): Promise<RequestInit> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${await freshAccessToken()}`);

  return { ...init, headers };
}

/** Access may revoke a token early; dropping it makes the retry refresh first. */
export function recoverFromUnauthorized(): Promise<boolean> {
  session.accessToken = null;

  return Promise.resolve(true);
}

async function promptableRequest(): Promise<AuthRequest> {
  const request = new AuthRequest({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, extraParams });
  const { codeChallenge } = await request.getAuthRequestConfigAsync();

  return codeChallenge !== undefined && ACCEPTED_CHALLENGE.test(codeChallenge)
    ? request
    : promptableRequest();
}

/** Opens Access's login in a Custom Tab; a dismissed tab or a refused login leaves the user signed out. */
export async function signIn(): Promise<AuthStatus> {
  const request = await promptableRequest();
  const result = await request.promptAsync(discovery);

  if (result.type !== "success") return "signed-out";

  const token = await exchangeCodeAsync(
    {
      clientId: CLIENT_ID,
      code: result.params["code"] ?? "",
      redirectUri: REDIRECT_URI,
      extraParams: { ...extraParams, code_verifier: request.codeVerifier ?? "" },
    },
    discovery,
  );

  await keep(token);
  announce("signed-in");

  return "signed-in";
}

export async function signOut() {
  await forgetSession();
  announce("signed-out");
}
