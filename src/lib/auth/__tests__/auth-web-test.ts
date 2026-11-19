import type * as WebAuth from "@/lib/auth/auth";

// The web twin, loaded by its full name because Jest resolves the native one first.
const auth = jest.requireActual<typeof WebAuth>("@/lib/auth/auth.ts");

const storage = new Map<string, string>();
const reload = jest.fn();
const assign = jest.fn();

Object.assign(globalThis, {
  sessionStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  },
  window: { location: { reload, assign } },
});

beforeEach(() => {
  storage.clear();
  reload.mockClear();
});

describe("web auth", () => {
  it("is always signed in: Access let the page load", async () => {
    await expect(auth.loadAuthStatus()).resolves.toBe("signed-in");
  });

  it("adds no token, only a manual redirect so Access's login redirect is readable", async () => {
    await expect(auth.authorize({ method: "GET" })).resolves.toEqual({
      method: "GET",
      redirect: "manual",
    });
  });

  it("reloads once on a 401, then stops to avoid a reload loop", async () => {
    await expect(auth.recoverFromUnauthorized()).resolves.toBe(false);
    await auth.recoverFromUnauthorized();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("signs in by reloading, so Access's login redirect runs", async () => {
    await expect(auth.signIn()).resolves.toBe("signed-in");

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("signs out through Access's logout page", async () => {
    await auth.signOut();

    expect(assign).toHaveBeenCalledWith("/cdn-cgi/access/logout");
  });
});
