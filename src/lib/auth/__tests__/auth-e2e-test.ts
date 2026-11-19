import * as e2eAuth from "@/lib/auth/auth.e2e";
import * as nativeAuth from "@/lib/auth/auth.native";

const names = (module: typeof nativeAuth) =>
  Object.keys(module).toSorted((a, b) => a.localeCompare(b));

jest.mock("expo-secure-store", () => ({}));

jest.mock("expo-auth-session", () => ({}));

describe("auth.e2e", () => {
  it("exports the same functions as auth.native, so Metro can swap it in", () => {
    expect(names(e2eAuth)).toEqual(names(nativeAuth));
  });

  it("starts signed in and stays signed in", async () => {
    expect(await e2eAuth.loadAuthStatus()).toBe("signed-in");
    expect(await e2eAuth.signIn()).toBe("signed-in");
  });

  it("sends requests without an Access token", async () => {
    const init = { method: "POST", headers: { "content-type": "application/json" } };

    expect(await e2eAuth.authorize(init)).toBe(init);
  });

  it("never retries a 401", async () => {
    expect(await e2eAuth.recoverFromUnauthorized()).toBe(false);
  });

  it("has no session to sign out of or watch", async () => {
    const unsubscribe = e2eAuth.subscribeAuthStatus(jest.fn());

    await expect(e2eAuth.signOut()).resolves.toBeUndefined();
    expect(unsubscribe).not.toThrow();
  });
});
