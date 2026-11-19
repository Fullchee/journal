// eslint-disable-next-line no-restricted-imports -- jest/ sits outside src, so no @/ alias reaches it
import { preloadRoutes } from "../../jest/route-mocks";

declare global {
  var loadedRoutes: string[];
}

it("requires every route under the app directory, nested ones included", () => {
  // oxlint-disable-next-line unicorn-js/no-global-object-property-assignment -- the plain-JS route fixtures report through this global
  globalThis.loadedRoutes = [];

  preloadRoutes("./jest/__fixtures__/routes");

  expect(globalThis.loadedRoutes.toSorted((a, b) => a.localeCompare(b))).toEqual([
    "index",
    "nested/page",
  ]);
});
