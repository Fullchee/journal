import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ExpoConfig } from "expo/config";

// eslint-disable-next-line no-restricted-imports -- plugins/ sits outside src, so no @/ alias reaches it
import withAndroidShortcuts, { shortcutsXml } from "../../plugins/android-shortcuts";

describe("shortcutsXml", () => {
  const xml = shortcutsXml({
    package: "dev.fullchee.journal",
    scheme: "dev.fullchee.journal",
    shortcuts: [
      { id: "check-in", label: "Check in", path: "?focus=check-in&from=shortcut" },
      { id: "health-plan", label: "Health plan", path: "health-plan" },
    ],
  });

  it("opens MainActivity with a deep link per shortcut", () => {
    expect(xml).toContain('android:targetClass="dev.fullchee.journal.MainActivity"');
    expect(xml).toContain('android:data="dev.fullchee.journal://health-plan"');
  });

  it("labels each shortcut with a string resource", () => {
    expect(xml).toContain('android:shortcutShortLabel="@string/shortcut_check_in"');
    expect(xml).toContain('android:shortcutShortLabel="@string/shortcut_health_plan"');
  });

  it("escapes the link for XML", () => {
    expect(xml).toContain("dev.fullchee.journal://?focus=check-in&amp;from=shortcut");
  });
});

interface StringsConfig {
  modResults: { resources: { string?: { $: { name: string }; _: string }[] } };
}

interface Metadata {
  $: Record<string, string>;
}

interface ManifestConfig {
  modResults: {
    manifest: {
      application?: { activity?: { $: Record<string, string>; "meta-data"?: Metadata[] }[] }[];
    };
  };
}

interface DangerousConfig {
  modRequest: { platformProjectRoot: string };
}

type DangerousMod = (config: DangerousConfig) => DangerousConfig;

type StringsMod = (config: StringsConfig) => StringsConfig;

type ManifestMod = (config: ManifestConfig) => ManifestConfig;

// The real helpers queue each mod for prebuild; these keep it so a test can run it.
interface CapturedMods {
  dangerous?: DangerousMod;
  strings?: StringsMod;
  manifest?: ManifestMod;
}

const mockMods: CapturedMods = {};

jest.mock("expo/config-plugins", () => ({
  withDangerousMod: (config: ExpoConfig, [, mod]: [string, DangerousMod]) => {
    mockMods.dangerous = mod;

    return config;
  },
  withStringsXml: (config: ExpoConfig, mod: StringsMod) => {
    mockMods.strings = mod;

    return config;
  },
  withAndroidManifest: (config: ExpoConfig, mod: ManifestMod) => {
    mockMods.manifest = mod;

    return config;
  },
}));

describe("withAndroidShortcuts", () => {
  const shortcuts = [{ id: "check-in", label: "Check in", path: "?focus=check-in" }];

  const app = { name: "Journal", slug: "journal" };

  const config = {
    ...app,
    android: { package: "dev.fullchee.journal" },
    scheme: ["dev.fullchee.journal", "journal"],
  };

  beforeEach(() => withAndroidShortcuts(config, { shortcuts }));

  it("needs a package and a scheme", () => {
    expect(() => withAndroidShortcuts({ ...app, scheme: "journal" }, { shortcuts })).toThrow(
      "expo.android.package",
    );
    expect(() => withAndroidShortcuts({ ...app, android: config.android }, { shortcuts })).toThrow(
      "expo.scheme",
    );
  });

  it("writes res/xml/shortcuts.xml with the first scheme", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shortcuts-"));

    mockMods.dangerous?.({ modRequest: { platformProjectRoot: root } });

    const xml = fs.readFileSync(path.join(root, "app/src/main/res/xml/shortcuts.xml"), "utf8");

    expect(xml).toContain('android:data="dev.fullchee.journal://?focus=check-in"');
    fs.rmSync(root, { recursive: true });
  });

  it("replaces a shortcut label left from an earlier prebuild and keeps the other strings", () => {
    const strings = mockMods.strings?.({
      modResults: {
        resources: {
          string: [
            { $: { name: "app_name" }, _: "Journal" },
            { $: { name: "shortcut_check_in" }, _: "Old label" },
          ],
        },
      },
    });

    expect(strings?.modResults.resources.string).toEqual([
      { $: { name: "app_name" }, _: "Journal" },
      { $: { name: "shortcut_check_in" }, _: "Check in" },
    ]);
  });

  it("points MainActivity at the shortcuts once, keeping its other meta-data", () => {
    const other = { $: { "android:name": "other" } };

    const shortcutsMeta = {
      $: { "android:name": "android.app.shortcuts", "android:resource": "@xml/shortcuts" },
    };

    const manifest = mockMods.manifest?.({
      modResults: {
        manifest: {
          application: [
            {
              activity: [
                { $: { "android:name": ".MainActivity" }, "meta-data": [other, shortcutsMeta] },
              ],
            },
          ],
        },
      },
    });

    expect(manifest?.modResults.manifest.application?.[0]?.activity?.[0]?.["meta-data"]).toEqual([
      other,
      shortcutsMeta,
    ]);
  });

  it("fails when the manifest has no MainActivity", () => {
    expect(() => mockMods.manifest?.({ modResults: { manifest: {} } })).toThrow(
      "could not find .MainActivity",
    );
  });
});
