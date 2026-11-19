/**
 * Web keeps the cache in localStorage; the native twin (cache-storage.native.ts) uses expo-sqlite's key-value store.
 * Promise.try turns a storage exception (quota exceeded) into a rejection, as AsyncStorage's does.
 */
export const cacheStorage = {
  getItem: (key: string) => Promise.try(() => localStorage.getItem(key)),
  setItem: (key: string, value: string) => Promise.try(() => localStorage.setItem(key, value)),
  removeItem: (key: string) => Promise.try(() => localStorage.removeItem(key)),
};
