import fs from "node:fs";
import path from "node:path";

import type { ExpoConfig } from "expo/config";

// eslint-disable-next-line no-restricted-imports -- plugins/ sits outside src, so no @/ alias reaches it
import withReleaseSigning, { signReleaseBuilds } from "../../plugins/release-signing";

interface GradleConfig {
  modResults: { contents: string };
}

type GradleMod = (config: GradleConfig) => GradleConfig;

// The real helper queues the mod for prebuild; this keeps it so a test can run it.
interface CapturedMods {
  gradle?: GradleMod;
}

const mockMods: CapturedMods = {};

jest.mock("expo/config-plugins", () => ({
  withAppBuildGradle: (config: ExpoConfig, mod: GradleMod) => {
    mockMods.gradle = mod;

    return config;
  },
}));

const templateGradle = fs.readFileSync(
  path.join(__dirname, "fixtures/template-build.gradle"),
  "utf8",
);

describe("signReleaseBuilds", () => {
  const signed = signReleaseBuilds(templateGradle);

  it("adds a release signing config read from the environment", () => {
    expect(signed).toContain("storeFile file(System.getenv('JOURNAL_KEYSTORE_PATH'))");
    expect(signed).toContain("keyAlias 'journal'");
  });

  it("signs release builds with it when the keystore is set", () => {
    expect(signed).toContain(
      "signingConfig System.getenv('JOURNAL_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
    );
  });

  it("keeps debug builds on the debug key", () => {
    expect(signed).toMatch(/debug \{\n\s+signingConfig signingConfigs\.debug\n/);
  });

  it("leaves an already signed build.gradle as is", () => {
    expect(signReleaseBuilds(signed)).toBe(signed);
  });

  it("fails when the template changes shape", () => {
    expect(() => signReleaseBuilds("android {}")).toThrow("could not find the template's signing");
  });
});

describe("withReleaseSigning", () => {
  it("rewrites the app's build.gradle", () => {
    withReleaseSigning({ name: "Journal", slug: "journal" });

    const result = mockMods.gradle?.({ modResults: { contents: templateGradle } });

    expect(result?.modResults.contents).toContain("signingConfigs.release");
  });
});
