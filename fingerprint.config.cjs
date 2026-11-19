/** @type {import('expo/fingerprint').Config} */
const config = {
  // The balanced preset's skips, plus every package.json script: scripts only run dev tooling, never the native build.
  sourceSkips: [
    "PackageJsonAndroidAndIosScriptsIfNotContainRun",
    "ExpoConfigVersions",
    "ExpoConfigRuntimeVersionIfString",
    "EasJson",
    "Easignore",
    "AutolinkingConfigPaths",
    "PackageJsonScriptsAll",
  ],
};

module.exports = config;
