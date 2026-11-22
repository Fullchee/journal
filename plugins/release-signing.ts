// Signs release builds with the owner's keystore, so only the owner can ship an APK that installs over the published one.
// The keystore and its password stay outside the repo; builds without them (EAS, other machines) keep the template's debug key.
import { type ConfigPlugin, withAppBuildGradle } from "expo/config-plugins";

const DEBUG_SIGNING = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
`;

const RELEASE_SIGNING = `        release {
            if (System.getenv('JOURNAL_KEYSTORE_PATH')) {
                storeFile file(System.getenv('JOURNAL_KEYSTORE_PATH'))
                storePassword System.getenv('JOURNAL_KEYSTORE_PASSWORD')
                keyAlias 'journal'
                keyPassword System.getenv('JOURNAL_KEYSTORE_PASSWORD')
            }
        }
`;

// The template's release build type is the only one that signs with the debug key under this comment.
const TEMPLATE_RELEASE_SIGNING = `            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const OWNER_RELEASE_SIGNING = `            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig System.getenv('JOURNAL_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug`;

export function signReleaseBuilds(buildGradle: string): string {
  if (buildGradle.includes(RELEASE_SIGNING)) return buildGradle;

  if (!buildGradle.includes(DEBUG_SIGNING) || !buildGradle.includes(TEMPLATE_RELEASE_SIGNING)) {
    throw new Error("release-signing could not find the template's signing config in build.gradle");
  }

  return buildGradle
    .replace(DEBUG_SIGNING, () => DEBUG_SIGNING + RELEASE_SIGNING)
    .replace(TEMPLATE_RELEASE_SIGNING, () => OWNER_RELEASE_SIGNING);
}

const withReleaseSigning: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = signReleaseBuilds(modConfig.modResults.contents);

    return modConfig;
  });

export default withReleaseSigning;
