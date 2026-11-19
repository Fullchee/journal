import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";
import { ENV } from "varlock/env";

interface SentryRuntime {
  platform: string;
  isDev: boolean;
  appVersion: string | undefined;
  /** Null on web and in the APK's embedded bundle. */
  easUpdateId: string | null;
}

/** The release names the EAS Update too: every `main` push ships one, so the app version alone never changes. */
function releaseName({ appVersion = "unknown", easUpdateId }: SentryRuntime) {
  const release = `journal@${appVersion}`;

  return easUpdateId === null ? release : `${release}+${easUpdateId}`;
}

/** Returns undefined without a DSN, which keeps Sentry off. The owner is the only user, so it captures everything. */
export function sentryOptions(
  dsn: string | undefined,
  runtime: SentryRuntime,
): Sentry.ReactNativeOptions | undefined {
  if (dsn === undefined || dsn === "") return undefined;

  return {
    dsn,
    environment: runtime.isDev ? "development" : "production",
    release: releaseName(runtime),
    initialScope: { tags: { "app.platform": runtime.platform } },
    tracesSampleRate: 1,
    enableLogs: true,
    // eslint-disable-next-line typescript/no-deprecated -- React Native's options omit core's `dataCollection` and keep this field; tsgolint reads core's deprecated one
    sendDefaultPii: true,
    integrations: [
      Sentry.expoRouterIntegration(),
      Sentry.consoleLoggingIntegration({ levels: ["log", "info", "warn", "error"] }),
    ],
  };
}

/** The DSN is a parameter because the build inlines ENV.*, so a test can't set it. */
export function initSentry(dsn = ENV.EXPO_PUBLIC_SENTRY_DSN) {
  const options = sentryOptions(dsn, {
    platform: Platform.OS,
    isDev: __DEV__,
    appVersion: Constants.expoConfig?.version,
    easUpdateId: Updates.isEmbeddedLaunch ? null : Updates.updateId,
  });

  if (options) Sentry.init(options);
}
