import type { Config } from "jest";
import { createRequire } from "node:module";
import * as z from "zod/mini";

// jest-expo ships its preset as untyped CommonJS.
const hasteSchema = z.object({ defaultPlatform: z.string(), platforms: z.array(z.string()) });

const presetSchema = z.object({
  transformIgnorePatterns: z.tuple([z.string()], z.string()),
  haste: hasteSchema,
});

const require = createRequire(import.meta.url);
const expoPreset = presetSchema.parse(require("jest-expo/jest-preset"));

// ESM or JSX packages beyond the preset's own list; Babel must transform them.
const esmPackages = [
  "@tanstack",
  "uniwind",
  "@rn-primitives",
  "@assistant-ui",
  "assistant-stream",
  "assistant-cloud",
  "nanoid",
  "d3-",
  "internmap",
];

const [presetAllowList, ...presetIgnorePatterns] = expoPreset.transformIgnorePatterns;
const lastPresetPackage = "|standard-navigation))";

if (!presetAllowList.endsWith(lastPresetPackage)) {
  throw new Error(
    `jest-expo's transformIgnorePatterns changed; update jest.config.ts: ${presetAllowList}`,
  );
}

const config: Config = {
  preset: "jest-expo",
  // Jest replaces the preset's `haste` instead of merging it, so spread it back in.
  // forceNodeFilesystemAPI skips Jest's `find` crawl of node_modules, slow under Sophos.
  haste: { ...expoPreset.haste, forceNodeFilesystemAPI: true },
  // Faster than Jest's default (cores − 1) on a busy laptop; CI's 2-vCPU runner gets 1 worker either way.
  maxWorkers: "50%",
  testTimeout: 30_000,
  moduleNameMapper: {
    "\\.css$": "<rootDir>/jest/css-stub.ts",
    "^@/assets/(.*)$": "<rootDir>/assets/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^lucide-react-native$": "<rootDir>/jest/lucide-react-native.cjs",
    "^react-native-reanimated/mock$": "<rootDir>/jest/reanimated-mock.ts",
    "^sonner-native$": "<rootDir>/jest/sonner-native.ts",
  },
  transformIgnorePatterns: [
    `${presetAllowList.slice(0, -lastPresetPackage.length)}|standard-navigation|${esmPackages.join("|")}))`,
    ...presetIgnorePatterns,
  ],
  setupFiles: ["<rootDir>/jest/setup.ts"],
  // userEvent waits out React Native's 130 ms minimum press; fake timers skip the wait.
  // React's test renderer schedules work with queueMicrotask, so faking it stalls renders until a test moves the clock.
  fakeTimers: { enableGlobally: true, doNotFake: ["queueMicrotask", "nextTick"] },
  roots: ["<rootDir>/src"],
  // src/core has its own Node config: jest.core.config.ts.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/src/core/"],
  // src/ui came from packages/ui, which had no tests or coverage gate of its own.
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/__tests__/**",
    "!src/core/**",
    "!src/ui/**",
  ],
  coverageReporters: ["json"],
  coverageDirectory: "<rootDir>/coverage/app",
  coverageThreshold: { global: { statements: 100, branches: 100, functions: 100, lines: 100 } },
};

export default config;
