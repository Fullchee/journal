import type { Config } from "jest";

// The API reads local dates as the owner lives them, like @/core's tests.
process.env["TZ"] = "America/Toronto";

const config: Config = {
  displayName: "api",
  testEnvironment: "node",
  // forceNodeFilesystemAPI skips Jest's `find` crawl of node_modules, slow under Sophos.
  haste: { forceNodeFilesystemAPI: true },
  maxWorkers: "50%",
  coverageReporters: ["json"],
  coverageDirectory: "<rootDir>/../coverage/worker",
  collectCoverageFrom: ["<rootDir>/**/*.ts", "!<rootDir>/test/**", "!<rootDir>/**/*.d.ts"],
  coverageThreshold: { global: { statements: 100, branches: 100, functions: 100, lines: 100 } },
  roots: ["<rootDir>/test"],
  setupFiles: ["<rootDir>/test/setup.ts"],
  moduleNameMapper: { "^@worker/(.*)$": "<rootDir>/$1", "^@/core(.*)$": "<rootDir>/../src/core$1" },
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: { module: "commonjs", isolatedModules: true } }],
  },
};

export default config;
