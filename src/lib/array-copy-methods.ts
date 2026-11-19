// The Hermes build in this app lacks ES2023's copying array methods, which src/core uses on every platform.

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

if (!Reflect.has(Array.prototype, "toReversed")) {
  Object.defineProperty(Array.prototype, "toReversed", {
    configurable: true,
    writable: true,
    value<T>(this: T[]): T[] {
      // oxlint-disable-next-line unicorn/no-array-reverse -- this polyfills toReversed, so it can't call it
      return [...this].reverse();
    },
  });
}
