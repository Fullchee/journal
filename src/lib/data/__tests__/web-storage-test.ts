import type * as WebCacheStorage from "@/lib/data/cache-storage";
import type * as WebConnectivity from "@/lib/data/connectivity";

// The web twins, loaded by their full names because Jest resolves the native ones first.
const { cacheStorage } = jest.requireActual<typeof WebCacheStorage>("@/lib/data/cache-storage.ts");

const { watchConnectivity } = jest.requireActual<typeof WebConnectivity>(
  "@/lib/data/connectivity.ts",
);

const store = new Map<string, string>();

Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  },
});

describe("web cache storage", () => {
  it("keeps values in localStorage behind a promise", async () => {
    await cacheStorage.setItem("k", "v");
    await expect(cacheStorage.getItem("k")).resolves.toBe("v");

    await cacheStorage.removeItem("k");
    await expect(cacheStorage.getItem("k")).resolves.toBeNull();
  });
});

describe("web connectivity", () => {
  it("has nothing to stop: TanStack listens to the browser itself", () => {
    expect(() => watchConnectivity()()).not.toThrow();
  });
});
