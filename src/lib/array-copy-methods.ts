// The app's Hermes (260318099.0.5) has ES2023's toReversed, toSpliced and with, but not toSorted, which src/core uses.

if (!Reflect.has(Array.prototype, "toSorted")) {
  Object.defineProperty(Array.prototype, "toSorted", {
    configurable: true,
    writable: true,
    value<T>(this: T[], compare?: (a: T, b: T) => number): T[] {
      // oxlint-disable-next-line unicorn/no-array-sort -- this polyfills toSorted, so it can't call it
      return [...this].sort(compare);
    },
  });
}
