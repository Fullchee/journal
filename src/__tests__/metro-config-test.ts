import path from "node:path";

interface Resolution {
  type: string;
  filePath?: string;
}

type ResolveRequest = (
  context: { resolveRequest: ResolveRequest },
  moduleName: string,
  platform: string,
) => Resolution;

interface MetroConfig {
  resolver: { resolveRequest?: ResolveRequest };
}

jest.mock("@varlock/expo-integration/metro-config", () => ({
  withVarlockMetroConfig: (config: MetroConfig) => config,
}));

jest.mock("@sentry/react-native/metro", () => ({ getSentryExpoConfig: () => ({ resolver: {} }) }));

jest.mock("uniwind/metro", () => ({ withUniwindConfig: (config: MetroConfig) => config }));

const E2E_AUTH = path.join(__dirname, "../lib/auth/auth.e2e.ts");

function loadConfig(env: Record<string, string>) {
  jest.replaceProperty(process, "env", { ...process.env, __VARLOCK_ENV: "{}", ...env });
  let config: MetroConfig | undefined;

  jest.isolateModules(() => {
    config = jest.requireActual<MetroConfig>("../../metro.config.cjs");
  });

  return config;
}

const fallThrough: ResolveRequest = (_context, moduleName) => ({
  type: "fallThrough",
  filePath: moduleName,
});

const resolve = (config: MetroConfig | undefined, moduleName: string, platform: string) =>
  config?.resolver.resolveRequest?.({ resolveRequest: fallThrough }, moduleName, platform);

afterEach(() => jest.restoreAllMocks());

describe("metro.config.cjs", () => {
  it("leaves module resolution alone outside the smoke flows", () => {
    expect(loadConfig({ JOURNAL_E2E: "" })?.resolver.resolveRequest).toBeUndefined();
  });

  it("swaps in the signed-in auth module on Android when JOURNAL_E2E=1", () => {
    const config = loadConfig({ JOURNAL_E2E: "1", EXPO_PUBLIC_API_URL: "https://10.0.2.2:8787" });

    expect(resolve(config, "@/lib/auth/auth", "android")).toEqual({
      type: "sourceFile",
      filePath: E2E_AUTH,
    });
    expect(resolve(config, "@/lib/auth/auth", "web")).toEqual({
      type: "fallThrough",
      filePath: "@/lib/auth/auth",
    });
    expect(resolve(config, "react", "android")).toEqual({ type: "fallThrough", filePath: "react" });
  });

  it.each([
    ["production", "https://journal.fullchee.workers.dev"],
    ["missing", ""],
  ])("refuses a %s API URL, so the smoke flows never touch it", (_name, url) => {
    expect(() => loadConfig({ JOURNAL_E2E: "1", EXPO_PUBLIC_API_URL: url })).toThrow(
      "JOURNAL_E2E=1 needs EXPO_PUBLIC_API_URL",
    );
  });
});
