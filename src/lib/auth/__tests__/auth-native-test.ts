import {
  AuthRequest,
  TokenError,
  TokenResponse,
  exchangeCodeAsync,
  refreshAsync,
} from "expo-auth-session";
import type * as AuthSession from "expo-auth-session";

import type * as Errors from "@/lib/api/errors";
import type * as AuthNative from "@/lib/auth/auth.native";

jest.mock("expo-auth-session", () => ({
  ...jest.requireActual<typeof AuthSession>("expo-auth-session"),
  refreshAsync: jest.fn(),
  exchangeCodeAsync: jest.fn(),
}));

// The `mock` prefix lets jest.mock's hoisting allow it inside the factory.
const mockStored = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockStored.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockStored.set(key, value);

    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockStored.delete(key);

    return Promise.resolve();
  }),
}));

const REFRESH_TOKEN_KEY = "access.refreshToken.journal.fullchee.workers.dev";
const refresh = jest.mocked(refreshAsync);

const tokenResponse = (accessToken: string, refreshToken?: string) =>
  new TokenResponse({
    accessToken,
    expiresIn: 900,
    ...(refreshToken !== undefined && { refreshToken }),
  });

// Each test gets fresh module state: no in-memory token, no refresh in flight.
function load() {
  let auth!: typeof AuthNative;
  let errors!: typeof Errors;

  jest.isolateModules(() => {
    auth = jest.requireActual("@/lib/auth/auth.native");
    errors = jest.requireActual("@/lib/api/errors");
  });

  return { auth, errors };
}

const bearerOf = (init: RequestInit) => new Headers(init.headers).get("authorization");

beforeEach(() => {
  mockStored.clear();
  refresh.mockReset();
  jest.mocked(exchangeCodeAsync).mockReset();
});

describe("loadAuthStatus", () => {
  it("is signed out without a stored refresh token", async () => {
    await expect(load().auth.loadAuthStatus()).resolves.toBe("signed-out");
  });

  it("is signed in with a stored refresh token, without touching the network", async () => {
    mockStored.set(REFRESH_TOKEN_KEY, "r1");

    await expect(load().auth.loadAuthStatus()).resolves.toBe("signed-in");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is signed out with only a refresh token issued for the old pages.dev API", async () => {
    mockStored.set("access.refreshToken", "r-pages");

    await expect(load().auth.loadAuthStatus()).resolves.toBe("signed-out");
  });
});

describe("authorize", () => {
  it("refreshes, sends the bearer token and keeps a rotated refresh token", async () => {
    mockStored.set(REFRESH_TOKEN_KEY, "r1");
    refresh.mockResolvedValue(tokenResponse("a1", "r2"));

    const init = await load().auth.authorize({ method: "GET" });

    expect(bearerOf(init)).toBe("Bearer a1");
    expect(refresh).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: "r1" }),
      expect.anything(),
    );
    expect(mockStored.get(REFRESH_TOKEN_KEY)).toBe("r2");
  });

  it("reuses a fresh token and runs one refresh for parallel requests", async () => {
    mockStored.set(REFRESH_TOKEN_KEY, "r1");
    refresh.mockResolvedValue(tokenResponse("a1"));
    const { auth } = load();

    await Promise.all([auth.authorize({}), auth.authorize({}), auth.authorize({})]);
    await auth.authorize({});

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mockStored.get(REFRESH_TOKEN_KEY)).toBe("r1");
  });

  it("refreshes again after a 401", async () => {
    mockStored.set(REFRESH_TOKEN_KEY, "r1");
    refresh.mockResolvedValueOnce(tokenResponse("a1")).mockResolvedValueOnce(tokenResponse("a2"));
    const { auth } = load();
    await auth.authorize({});

    await expect(auth.recoverFromUnauthorized()).resolves.toBe(true);

    expect(bearerOf(await auth.authorize({}))).toBe("Bearer a2");
  });

  it("never signs out on a network error", async () => {
    mockStored.set(REFRESH_TOKEN_KEY, "r1");
    refresh.mockRejectedValue(new TypeError("Network request failed"));
    const { auth, errors } = load();
    const listener = jest.fn();
    auth.subscribeAuthStatus(listener);

    await expect(auth.authorize({})).rejects.toBeInstanceOf(errors.NetworkError);

    expect(mockStored.get(REFRESH_TOKEN_KEY)).toBe("r1");
    expect(listener).not.toHaveBeenCalled();
    await expect(auth.loadAuthStatus()).resolves.toBe("signed-in");
  });

  it("never signs out when Access answers with another OAuth error", async () => {
    mockStored.set(REFRESH_TOKEN_KEY, "r1");
    refresh.mockRejectedValue(new TokenError({ error: "temporarily_unavailable" }));
    const { auth, errors } = load();

    await expect(auth.authorize({})).rejects.toBeInstanceOf(errors.NetworkError);
    expect(mockStored.get(REFRESH_TOKEN_KEY)).toBe("r1");
  });

  it("signs out only when Access rejects the grant", async () => {
    mockStored.set(REFRESH_TOKEN_KEY, "r1");
    refresh.mockRejectedValue(new TokenError({ error: "invalid_grant" }));
    const { auth, errors } = load();
    const listener = jest.fn();
    auth.subscribeAuthStatus(listener);

    await expect(auth.authorize({})).rejects.toBeInstanceOf(errors.SignedOutError);

    expect(mockStored.has(REFRESH_TOKEN_KEY)).toBe(false);
    expect(listener).toHaveBeenCalledWith("signed-out");
  });

  it("throws SignedOutError without a stored refresh token", async () => {
    const { auth, errors } = load();

    await expect(auth.authorize({})).rejects.toBeInstanceOf(errors.SignedOutError);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("forgets the refresh token and announces it", async () => {
    mockStored.set(REFRESH_TOKEN_KEY, "r1");
    const { auth } = load();
    const listener = jest.fn();
    const unsubscribe = auth.subscribeAuthStatus(listener);

    await auth.signOut();
    unsubscribe();
    await auth.signOut();

    expect(mockStored.has(REFRESH_TOKEN_KEY)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

function challenges(...codeChallenges: string[]) {
  const spy = jest.spyOn(AuthRequest.prototype, "getAuthRequestConfigAsync");

  for (const codeChallenge of codeChallenges)
    spy.mockResolvedValueOnce({ clientId: "c", redirectUri: "r", codeChallenge });

  return spy;
}

describe("signIn", () => {
  afterEach(() => jest.restoreAllMocks());

  it("keeps the refresh token from the code exchange, redoing a challenge Access rejects", async () => {
    const config = challenges("-bad", "good");
    jest.spyOn(AuthRequest.prototype, "promptAsync").mockResolvedValue({
      type: "success",
      params: { code: "c1" },
      errorCode: null,
      authentication: null,
      url: "",
    });
    jest.mocked(exchangeCodeAsync).mockResolvedValue(tokenResponse("a1", "r1"));
    const { auth } = load();
    const listener = jest.fn();
    auth.subscribeAuthStatus(listener);

    await expect(auth.signIn()).resolves.toBe("signed-in");

    expect(config).toHaveBeenCalledTimes(2);
    expect(mockStored.get(REFRESH_TOKEN_KEY)).toBe("r1");
    expect(listener).toHaveBeenCalledWith("signed-in");
    expect(bearerOf(await auth.authorize({}))).toBe("Bearer a1");
  });

  it("opens the endpoints Access publishes in its OAuth metadata", async () => {
    challenges("good");

    const prompt = jest
      .spyOn(AuthRequest.prototype, "promptAsync")
      .mockResolvedValue({ type: "dismiss" });

    await load().auth.signIn();

    expect(prompt).toHaveBeenCalledWith({
      authorizationEndpoint:
        "https://fullchee.cloudflareaccess.com/cdn-cgi/access/oauth/authorization",
      tokenEndpoint: "https://fullchee.cloudflareaccess.com/cdn-cgi/access/oauth/token",
    });
  });

  it("lets Access refuse a redirect that carries no code", async () => {
    challenges("good");
    jest.spyOn(AuthRequest.prototype, "promptAsync").mockResolvedValue({
      type: "success",
      params: {},
      errorCode: null,
      authentication: null,
      url: "",
    });
    jest.mocked(exchangeCodeAsync).mockResolvedValue(tokenResponse("a1", "r1"));

    await load().auth.signIn();

    expect(exchangeCodeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ code: "" }),
      expect.anything(),
    );
  });

  it("stays signed out when the login tab is dismissed", async () => {
    challenges("good");
    jest.spyOn(AuthRequest.prototype, "promptAsync").mockResolvedValue({ type: "dismiss" });

    await expect(load().auth.signIn()).resolves.toBe("signed-out");
    expect(exchangeCodeAsync).not.toHaveBeenCalled();
  });
});
