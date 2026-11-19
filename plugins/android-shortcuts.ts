// Static launcher shortcuts (long-press the app icon). Expo has no app.json field for them, so this writes
// res/xml/shortcuts.xml and points MainActivity at it. Changing them needs a new build, not an EAS Update.
import {
  type AndroidConfig,
  type ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} from "expo/config-plugins";
import fs from "node:fs";
import path from "node:path";

interface Shortcut {
  id: string;
  label: string;
  path: string;
}

interface ShortcutsFile {
  package: string;
  scheme: string;
  shortcuts: Shortcut[];
}

const stringName = (id: string) => `shortcut_${id.replaceAll("-", "_")}`;

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export function shortcutsXml({
  package: androidPackage,
  scheme,
  shortcuts,
}: ShortcutsFile): string {
  const items = shortcuts.map(
    ({ id, path: linkPath }) => `  <shortcut
    android:shortcutId="${id}"
    android:enabled="true"
    android:icon="@mipmap/ic_launcher"
    android:shortcutShortLabel="@string/${stringName(id)}">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="${androidPackage}"
      android:targetClass="${androidPackage}.MainActivity"
      android:data="${escapeXml(`${scheme}://${linkPath}`)}" />
  </shortcut>`,
  );

  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${items.join("\n")}
</shortcuts>
`;
}

const withAndroidShortcuts: ConfigPlugin<{ shortcuts: Shortcut[] }> = (config, { shortcuts }) => {
  const androidPackage = config.android?.package;
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;

  if (androidPackage === undefined || scheme === undefined) {
    throw new Error("android-shortcuts needs expo.android.package and expo.scheme");
  }

  const withShortcutsFile = withDangerousMod(config, [
    "android",
    (modConfig) => {
      const xmlDir = path.join(modConfig.modRequest.platformProjectRoot, "app/src/main/res/xml");

      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, "shortcuts.xml"),
        shortcutsXml({ package: androidPackage, scheme, shortcuts }),
      );

      return modConfig;
    },
  ]);

  // Android rejects literal labels in shortcuts.xml; they must be string resources.
  const withLabels = withStringsXml(withShortcutsFile, (modConfig) => {
    const strings = modConfig.modResults.resources.string ?? [];
    const names = new Set(shortcuts.map(({ id }) => stringName(id)));

    modConfig.modResults.resources.string = [
      ...strings.filter((item) => !names.has(item.$.name)),
      ...shortcuts.map(({ id, label }) => ({ $: { name: stringName(id) }, _: label })),
    ];

    return modConfig;
  });

  return withAndroidManifest(withLabels, (modConfig) => {
    // Android reads `meta-data` on an activity; Expo's manifest type leaves the field out.
    type MainActivity = AndroidConfig.Manifest.ManifestActivity & {
      "meta-data"?: AndroidConfig.Manifest.ManifestMetaData[];
    };

    const application = modConfig.modResults.manifest.application?.[0];

    const mainActivity: MainActivity | undefined = application?.activity?.find(
      (activity) => activity.$["android:name"] === ".MainActivity",
    );

    if (!mainActivity) throw new Error("android-shortcuts could not find .MainActivity");

    mainActivity["meta-data"] = [
      ...(mainActivity["meta-data"] ?? []).filter(
        (item) => item.$["android:name"] !== "android.app.shortcuts",
      ),
      { $: { "android:name": "android.app.shortcuts", "android:resource": "@xml/shortcuts" } },
    ];

    return modConfig;
  });
};

export default withAndroidShortcuts;
