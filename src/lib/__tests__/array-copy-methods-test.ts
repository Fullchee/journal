describe("array copy methods", () => {
  const original = {
    toSorted: Object.getOwnPropertyDescriptor(Array.prototype, "toSorted")!,
    toReversed: Object.getOwnPropertyDescriptor(Array.prototype, "toReversed")!,
  };

  beforeAll(() => {
    Reflect.deleteProperty(Array.prototype, "toSorted");
    Reflect.deleteProperty(Array.prototype, "toReversed");
    // jest.isolateModules reruns the module only through require; dynamic import needs --experimental-vm-modules.
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/lib/array-copy-methods");
    });
  });

  afterAll(() => {
    Object.defineProperties(Array.prototype, {
      toSorted: original.toSorted,
      toReversed: original.toReversed,
    });
  });

  it("sorts a copy and leaves the original alone", () => {
    const numbers = [3, 1, 2];
    expect(numbers.toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(numbers).toEqual([3, 1, 2]);
  });

  it("reverses a copy and leaves the original alone", () => {
    const numbers = [1, 2, 3];
    expect(numbers.toReversed()).toEqual([3, 2, 1]);
    expect(numbers).toEqual([1, 2, 3]);
  });

  it("is not enumerable, so for-in over an array stays clean", () => {
    expect(Object.keys(Array.prototype)).not.toContain("toSorted");
  });
});
