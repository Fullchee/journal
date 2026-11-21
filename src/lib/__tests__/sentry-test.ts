import * as Sentry from "@sentry/react-native";

import { initSentry, sentryOptions } from "@/lib/sentry";

const DSN = "https://key@o1.ingest.sentry.io/1";

function integrationNames(runtime: Parameters<typeof sentryOptions>[1]) {
  const integrations = sentryOptions(DSN, runtime)?.integrations;

  return Array.isArray(integrations) ? integrations.map(({ name }) => name) : [];
}

const android = { platform: "android", isDev: false, appVersion: "1.0.0", easUpdateId: "abc-123" };

describe("sentryOptions", () => {
  it("keeps Sentry off without a DSN", () => {
    expect(sentryOptions(undefined, android)).toBeUndefined();
    expect(sentryOptions("", android)).toBeUndefined();
  });

  it("tags Android events with the platform, environment and the release's EAS Update", () => {
    expect(sentryOptions(DSN, android)).toMatchObject({
      dsn: DSN,
      environment: "production",
      release: "journal@1.0.0+abc-123",
      initialScope: { tags: { "app.platform": "android" } },
      tracesSampleRate: 1,
      enableLogs: true,
      sendDefaultPii: true,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1,
    });
    expect(integrationNames(android)).toEqual([
      "ExpoRouter",
      "ConsoleLogs",
      "MobileReplay",
      "Feedback",
    ]);
  });

  it("names a web or embedded-bundle release by the app version alone", () => {
    const web = { platform: "web", isDev: true, appVersion: undefined, easUpdateId: null };

    expect(sentryOptions(DSN, web)).toMatchObject({
      environment: "development",
      release: "journal@unknown",
      initialScope: { tags: { "app.platform": "web" } },
    });
    expect(integrationNames(web)).toContain("Replay");
    expect(integrationNames(web)).not.toContain("MobileReplay");
  });
});

describe("initSentry", () => {
  it("never starts Sentry without a DSN", () => {
    initSentry("");

    expect(Sentry.init).not.toHaveBeenCalled();
  });
});
