# Importing Insight Timer and Calm sessions

Research for [#113](https://github.com/Fullchee/journal-native/issues/113). Researched 2026-11-11.

> **Update 2026-11-17**: the Garmin push is gone ([#135](https://github.com/Fullchee/journal-native/issues/135)). Fitbit data now reaches the app through Health Connect, filtered by `FITBIT_PACKAGE` in `src/core/fitbit-auto-complete.ts`. To switch back to Garmin, set that filter to Garmin Connect's package, `com.garmin.android.apps.connectmobile`. The Garmin parts below describe the removed push.

## Answer

| App               | Verdict               | Path                                                                       | Follow-up                                                     |
| ----------------- | --------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Calm**          | Feasible              | Read Health Connect `MindfulnessSession` records in the Android app        | [#127](https://github.com/Fullchee/journal-native/issues/127) |
| **Insight Timer** | Feasible, manual only | Import the in-app "Export Log" CSV on a Duration Habit's screen, like Hevy | [#128](https://github.com/Fullchee/journal-native/issues/128) |

- **No scheduled push for either**: neither app has a public API, and both terms of service forbid scraping or reverse engineering. A GitHub Action has no credential it may hold.
- **Habit shape**: an Auto-logged Habit with record `duration` and kind `good`. Each session becomes one Duration entry (Day, start time, minutes).
- **Health Connect is on-device**: the Android app reads it, not a GitHub Action. Web can't read it.

## Calm

### What exists

| Route                  | Status                                                                                                                 | Source                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Public or personal API | None. Calm's only API is the Partner API for employers to provision users, not session data.                           | [Calm for Organizations][calm-org]     |
| Export (CSV/JSON)      | None documented. Session history lives in the app's Dashboard; "session history is not available on the Calm website". | [Calm stats and history][calm-history] |
| Google Fit             | Ended. Sessions on Calm 6.100+ (July 2026) "will no longer appear in Google Fit".                                      | [Calm Health Connect][calm-hc]         |
| Health Connect         | **Yes.** Turn on "Save to Health Connect"; "completed sessions will sync as Mindfulness data in Health Connect".       | [Calm Health Connect][calm-hc]         |

### What syncs

- **Counted**: "Only active, guided sessions (such as Dailies, Meditations, Breathing Exercises, and Sleep Stories)". [Calm Health Connect][calm-hc]
- **Not counted**: "Scenes, Soundscapes, and Music". [Calm Health Connect][calm-hc]
- **Devices**: Android 8.1 and above; built into Android 14+, a Play Store download on 13 and below. [Calm Health Connect][calm-hc]
- **Plan**: the article names no Premium requirement. Check the toggle on the owner's plan before building.

### Fields in Health Connect

A `MindfulnessSessionRecord` carries: [MindfulnessSessionRecord][hc-record]

- **`startTime`, `endTime`** and their zone offsets: minutes come from the difference.
- **`mindfulnessSessionType`**: meditation, breathing, music, movement, unguided or unknown.
- **`title`, `notes`**: optional. Calm doesn't say whether it fills `title`.
- **`metadata.dataOrigin`**: the writing app's package, so a read can keep only Calm's records.

### Reading it from the app

- **Library**: `react-native-health-connect` 4.1.3 ships the Expo config plugin and a `MindfulnessSession` record type. [records.types.ts][rnhc-types]
- **Permission**: `android.permission.health.READ_MINDFULNESS`. [Track mindfulness][hc-mindfulness]
- **Feature check**: the record type depends on the installed Health Connect version; check `FEATURE_MINDFULNESS_SESSION` first. [MindfulnessSessionRecord][hc-record]
- **History**: an app reads other apps' data from 30 days before its first grant. Older data needs `PERMISSION_READ_HEALTH_DATA_HISTORY`. [Read data][hc-read]
- **When**: reads work in the foreground. Background reads need `READ_HEALTH_DATA_IN_BACKGROUND` and a WorkManager job. [Read data][hc-read]
- **Manifest**: the app must declare a privacy-policy rationale activity for `ACTION_SHOW_PERMISSIONS_RATIONALE` (and the Android 14 `VIEW_PERMISSION_USAGE` alias). [Get started][hc-start]

### Recommended path

Read on app open (#127). The Android app reads new `MindfulnessSession` records from Calm's package and posts each as a Duration entry through the existing API. Skip sessions already logged, as the Hevy import does. This needs a new development build, not an EAS Update, since it adds a native module.

## Insight Timer

### What exists

| Route          | Status                                                                                                                                                                     | Source                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Public API     | None documented. The help center has no developer or API article.                                                                                                          | [Insight Timer help center search][it-search] |
| Export (CSV)   | **Yes.** Settings > Features & Preferences > Session > **Export Log**, sent through the phone's mail app. "Your complete session data will be exported in CSV format".     | [Export session logs][it-export]              |
| Google Fit     | "Not currently. Google Fit integration isn't available on Insight Timer at this time."                                                                                     | [Google Fit][it-gfit]                         |
| Health Connect | Read only, as documented. Connecting lets you "view health data such as your heart rate, HRV … and sleep metrics directly in the app". No article says it writes sessions. | [Apple Health or Health Connect][it-hc]       |

- **iOS**: Insight Timer writes Mindful Minutes to Apple Health, but iOS is out of scope. [iOS Health app][it-ios]
- **Plan**: the export article names no MemberPlus requirement. [Export session logs][it-export]
- **Columns**: the article doesn't list them. Export one real log before writing the parser (#128 makes this step one).

### Recommended path

Manual CSV import (#128), next to the Hevy import on a Duration Habit's screen. Re-importing skips sessions already logged. It is not automatic: the owner exports and imports when they want the history up to date.

**Recheck**: open Health Connect > App permissions > Insight Timer on the phone. If Insight Timer ever asks to _write_ Mindfulness, #127's read covers it too and #128 can close.

## Ruled out

- **Scraping or unofficial APIs**: Calm's terms forbid attempts to "scrape, or extract data … through the use of any engine, software, tool, agent" and to "reverse engineer any of the software". [Calm Terms][calm-tos] Insight Timer's forbid anyone who "crawls," "scrapes," or "spiders" the Services, or "decompiles, reverse engineers" them. [Insight Timer Terms][it-tos] The brief rules these out.
- **A scheduled GitHub Action** (the Garmin pattern in `scripts/garmin/`): it needs a server-side source. Neither app has one, and Health Connect data never leaves the phone.

[calm-hc]: https://support.calm.com/hc/en-us/articles/54298569943323-How-to-Sync-with-Health-Connect-on-Android-replaces-Google-Fit
[calm-history]: https://support.calm.com/hc/en-us/articles/115002473827-How-to-View-Your-Meditation-Stats-History-and-Streak-in-Calm
[calm-org]: https://support.calm.com/hc/en-us/articles/4404019279003-How-to-Integrate-Calm-for-Your-Organization-SSO-API-and-SFTP-Setup
[calm-tos]: https://www.calm.com/terms
[it-export]: https://insight-timer.freshdesk.com/support/solutions/articles/67000739180-how-can-i-export-my-session-logs-on-insight-timer-
[it-gfit]: https://insight-timer.freshdesk.com/support/solutions/articles/67000693350-is-insight-timer-compatible-with-google-fit-
[it-hc]: https://insight-timer.freshdesk.com/support/solutions/articles/67000757143-how-do-i-connect-insight-timer-to-apple-health-or-health-connect-
[it-ios]: https://insight-timer.freshdesk.com/support/solutions/articles/67000664858-why-isn-t-insight-timer-showing-up-in-my-ios-health-app-
[it-search]: https://insight-timer.freshdesk.com/support/search/solutions?term=api
[it-tos]: https://insighttimer.com/terms-of-service
[hc-record]: https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/MindfulnessSessionRecord
[hc-mindfulness]: https://developer.android.com/health-and-fitness/health-connect/features/mindfulness
[hc-read]: https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data
[hc-start]: https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started
[rnhc-types]: https://unpkg.com/react-native-health-connect@4.1.3/src/types/records.types.ts
