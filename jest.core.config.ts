import type { Config } from "jest";

// The copied logic and its tests read local dates as the owner lives them.
process.env["TZ"] = "America/Toronto";

const config: Config = {
  rootDir: "src/core",
  testEnvironment: "node",
  // forceNodeFilesystemAPI skips Jest's `find` crawl of node_modules, slow under Sophos.
  haste: { forceNodeFilesystemAPI: true },
  maxWorkers: "50%",
  coverageReporters: ["json"],
  coverageDirectory: "<rootDir>/../../coverage/core",
  collectCoverageFrom: ["**/*.ts", "!index.ts", "!__tests__/**"],
  coverageThreshold: { global: { statements: 100, branches: 100, functions: 100, lines: 100 } },
  testMatch: ["<rootDir>/__tests__/*.test.ts"],
  moduleNameMapper: { "^@/core(.*)$": "<rootDir>$1" },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { tsconfig: { module: "commonjs", isolatedModules: true, rootDir: "." } },
    ],
  },
};

export default config;
