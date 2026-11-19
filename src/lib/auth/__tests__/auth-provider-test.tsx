import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { apiFetch } from "@/lib/api/api-fetch";
import { ApiError, NetworkError } from "@/lib/api/errors";
import * as auth from "@/lib/auth/auth";
import { useAuth } from "@/lib/auth/auth-provider";
import type { AuthStatus } from "@/lib/auth/auth-status";
import { DataProvider } from "@/lib/data/data-provider";

jest.mock("@/lib/api/api-fetch", () => ({ apiFetch: jest.fn() }));

jest.mock("expo-network", () => ({
  addNetworkStateListener: () => ({ remove: jest.fn() }),
}));

jest.mock("@/lib/data/cache-storage", () => ({
  cacheStorage: {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  },
}));

// The `mock` prefix lets jest.mock's hoisting allow it inside the factory.
const mockListeners = new Set<(status: AuthStatus) => void>();

jest.mock("@/lib/auth/auth", () => ({
  subscribeAuthStatus: (listener: (status: AuthStatus) => void) => {
    mockListeners.add(listener);

    return () => mockListeners.delete(listener);
  },
  loadAuthStatus: jest.fn(() => Promise.resolve("signed-out")),
  signIn: jest.fn(() => Promise.resolve("signed-in")),
  signOut: jest.fn(() => Promise.resolve()),
}));

const announceSignedIn = () => mockListeners.forEach((listener) => listener("signed-in"));

const wrapper = ({ children }: { children: ReactNode }) => <DataProvider>{children}</DataProvider>;

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  jest.mocked(auth.signOut).mockClear();
  jest.mocked(apiFetch).mockReset();
});

describe("useAuth", () => {
  it("refuses to run outside the provider", async () => {
    jest.spyOn(console, "error").mockImplementation(jest.fn());

    await expect(renderHook(() => useAuth())).rejects.toThrow(
      "useAuth must be used inside DataProvider",
    );
  });
});

describe("AuthProvider", () => {
  it("starts from the stored session and follows later changes", async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("signed-out"));
    await act(() => announceSignedIn());
    expect(result.current.status).toBe("signed-in");
  });

  it("signs in the owner", async () => {
    jest.mocked(apiFetch).mockResolvedValue(undefined);
    const { result } = await renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      announceSignedIn();
      await result.current.signIn();
    });

    expect(auth.signOut).not.toHaveBeenCalled();
    expect(result.current.status).toBe("signed-in");
  });

  it("signs out anyone the API forbids", async () => {
    jest.mocked(apiFetch).mockRejectedValue(new ApiError(403, { error: "forbidden" }));
    const { result } = await renderHook(() => useAuth(), { wrapper });

    await act(() => result.current.signIn());

    expect(auth.signOut).toHaveBeenCalled();
    expect(result.current.status).toBe("not-owner");
  });

  it("keeps the session when the owner check can't reach the API", async () => {
    jest.mocked(apiFetch).mockRejectedValue(new NetworkError(null));
    const { result } = await renderHook(() => useAuth(), { wrapper });

    await act(() => result.current.signIn());

    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("does nothing more when the login is dismissed", async () => {
    jest.mocked(auth.signIn).mockResolvedValueOnce("signed-out");
    const { result } = await renderHook(() => useAuth(), { wrapper });

    await act(() => result.current.signIn());

    expect(apiFetch).not.toHaveBeenCalled();
  });
});
