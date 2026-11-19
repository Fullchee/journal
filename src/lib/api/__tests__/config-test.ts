import type * as Config from "@/lib/api/config";

// An isolated registry loads its own react-native, so the platform is set by mocking the module for that load.
function loadConfigOn(os: "web" | "android") {
  let config: typeof Config | undefined;

  jest.isolateModules(() => {
    jest.doMock("react-native", () => ({ Platform: { OS: os } }));
    config = jest.requireActual<typeof Config>("@/lib/api/config");
  });

  if (!config) throw new Error("config did not load");

  return config;
}

describe("API_BASE_URL", () => {
  it("is the API's own origin on web, so Access's cookie rides along", () => {
    expect(loadConfigOn("web").API_BASE_URL).toBe("");
  });

  it("is the production origin off web", () => {
    const { API_BASE_URL, PRODUCTION_ORIGIN } = loadConfigOn("android");

    expect(API_BASE_URL).toBe(PRODUCTION_ORIGIN);
  });
});
