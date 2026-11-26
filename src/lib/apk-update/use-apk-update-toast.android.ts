import { showActionToast } from "@/ui";
import * as Updates from "expo-updates";
import { useEffect } from "react";
import { Linking } from "react-native";

const RELEASES = "https://github.com/Fullchee/journal/releases/latest/download";

// scripts/build-apk.sh uploads it beside the APK.
const RUNTIME_VERSION_URL = `${RELEASES}/runtime-version.txt`;

const APK_URL = `${RELEASES}/journal.apk`;

async function latestApkRuntimeVersion() {
  const response = await fetch(RUNTIME_VERSION_URL);

  // Releases from before the file existed answer 404.
  if (!response.ok) return null;
  const text = await response.text();

  return text.trim();
}

/**
 * Mount once. On launch, offers to install the latest APK when its native code differs from this one's:
 * EAS updates stop reaching an APK once the fingerprint moves, so only a reinstall brings new code.
 */
export function useApkUpdateToast() {
  useEffect(() => {
    const installed = Updates.runtimeVersion;

    // A development build runs Metro's bundle, not EAS updates.
    if (installed === null || !Updates.isEnabled) return;

    latestApkRuntimeVersion()
      .then((latest) => {
        if (latest === null || latest === installed) return;

        showActionToast({
          id: "apk-update",
          message: "A new version of Journal is ready to install.",
          actionLabel: "Install",
          onAction: () => void Linking.openURL(APK_URL),
        });
      })
      .catch(() => {
        // Offline or GitHub down: the next launch checks again.
      });
  }, []);
}
