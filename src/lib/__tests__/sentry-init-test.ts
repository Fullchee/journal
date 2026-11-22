import * as Sentry from "@sentry/react-native";

import { initSentry } from "@/lib/sentry";

jest.mock("expo-updates", () => ({ isEmbeddedLaunch: true, updateId: "ignored" }));

describe("initSentry", () => {
  it("starts Sentry with the DSN, naming an embedded launch by its app version alone", () => {
    const release: unknown = expect.not.stringContaining("ignored");

    initSentry("https://key@o1.ingest.sentry.io/1");

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: "https://key@o1.ingest.sentry.io/1", release }),
    );
  });

  it("starts Sentry once when Fast Refresh runs the root layout again", () => {
    jest.mocked(Sentry.init).mockClear();
    initSentry("https://key@o1.ingest.sentry.io/1");
    // SAFETY: initSentry only checks that a client exists; it never reads one.
    jest.mocked(Sentry.getClient).mockReturnValueOnce({} as Sentry.ReactNativeClient);

    initSentry("https://key@o1.ingest.sentry.io/1");

    expect(Sentry.init).toHaveBeenCalledTimes(1);
  });
});
