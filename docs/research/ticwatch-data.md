# Getting TicWatch Pro 5 Enduro data into journal-native

Research for syncing workouts and sleep from the TicWatch hands-off, as `scripts/garmin/` does for Garmin. Builds on [wear-os.md](wear-os.md) and [fitbit-data.md](fitbit-data.md). Researched 2026-11-12.

> **Update 2026-11-17**: the Garmin push is gone ([#135](https://github.com/Fullchee/journal-native/issues/135)). Fitbit data now reaches the app through Health Connect, filtered by `FITBIT_PACKAGE` in `src/core/fitbit-auto-complete.ts`. To switch back to Garmin, set that filter to Garmin Connect's package, `com.garmin.android.apps.connectmobile`. The Garmin parts below describe the removed push.

## Answer

| Rank | Route                                                                           | Verdict                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Health Connect, read by the journal app** in a background task                | Recommended, **if** Mobvoi Health writes sleep and exercise there. Reuses the Calm import's library. Pushes to the same `/api/*` endpoints. |
| 2    | **Health Connect → Google Health app → Google Health API** from a GitHub Action | Same server shape as Garmin and the Fitbit plan, but four hops, each unverified for this watch.                                             |
| 3    | **Strava API** from a GitHub Action, workouts only                              | Solid for workouts if the owner records them in Strava on the watch. No sleep.                                                              |
| ✗    | **Mobvoi cloud**                                                                | No public API, no reverse-engineered client on GitHub. The web portal exports `.tcx` by hand only. [Notebookcheck][nbc]                     |
| ✗    | **Google Fit REST API**                                                         | Closed to new sign-ups since 2024-05-01, deprecated in 2026, with "no alternative to the Fit REST API". [Fit migration FAQ][fit-faq]        |
| ✗    | **Gadgetbridge**                                                                | No Mobvoi or Wear OS watch in its gadget list. [Gadgetbridge gadgets][gb]                                                                   |
| ✗    | **Own Wear OS app on Health Services**                                          | Passive data gives heart rate and steps, and only an asleep/awake state, no stages. Weeks of Kotlin. [Passive data][hs-passive]             |

- **Blocking question**: what does Mobvoi Health write to Health Connect? Mobvoi's docs never mention Health Connect. A Play review (Feb 2024) says "It will only exchange Steps info with Health Connect, so there is no syncing of exercises or other data." [Play listing][play] A data vendor claims sleep, heart rate and workouts. [Sahha][sahha] The owner can settle it in a minute: **Settings → Health Connect → App permissions → Mobvoi Health**.
- **If Mobvoi writes only steps**, options 1 and 2 lose sleep and workouts. Then use option 3 for workouts, and Sleep as Android on the watch for sleep (see Fallbacks).
- **Not available anywhere**: Mobvoi's sleep score. Health Connect's sleep record has stages but no score field. [SleepSessionRecord][hc-sleep]
- **Mobvoi Health looks unmaintained**: last Play update 2025-04-17. [Play listing][play]

## Where the watch's data lives

| Layer                      | What it holds                                                                                                                                                   | Source                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Watch apps**             | TicSleep (sleep stages, SpO2, respiratory rate, skin temperature), TicExercise (workouts), TicPulse, TicZen (stress). Sleep on the watch shows last night only. | [Enduro user guide][guide]   |
| **Mobvoi Health app**      | Syncs from the watch "if the watch's mobile network or WLAN is available". Shows steps, calories, exercise records, sleep stages, heart rate.                   | [Guide][guide], [Play][play] |
| **Mobvoi cloud**           | `h.mobvoi.com` desktop portal; exports workouts as `.tcx`; no API mentioned.                                                                                    | [Notebookcheck][nbc]         |
| **Health Connect**         | Unknown for Mobvoi. Steps confirmed by one user; the rest unconfirmed.                                                                                          | [Play][play], [Sahha][sahha] |
| **Third-party watch apps** | Strava and other apps built on Wear Health Services (WHS) run on the watch; the guide names Strava.                                                             | [Guide][guide]               |

- **No unofficial API.** A GitHub search for "mobvoi" finds kernels, TWRP trees and speech SDKs, nothing that reads health data (searched 2026-11-12).

## Today's Garmin pipeline, for comparison

`garmin-sleep.yml` runs every 3 days and pushes to `/api/sleep` (`date`, `sleep_start`, `sleep_end`, `duration_min`, `sleep_score`), `/api/activity` (`steps`, `moderate_min`, `vigorous_min`, `resting_hr`, `avg_stress`) and `/api/workouts` (`activity_id`, `type_key`, `name`, `start_local`, `duration_s`, `distance_m`, `avg_hr`, `calories`). Full table in [fitbit-data.md](fitbit-data.md#todays-garmin-pipeline).

## Field coverage

| Garmin field              | Option 1/2: Health Connect (if Mobvoi writes it)                          | Option 3: Strava                                   |
| ------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| Sleep start, end, minutes | `SleepSession` start/end [SleepSessionRecord][hc-sleep]                   | None                                               |
| Sleep stages              | `SleepSession.stages` [SleepSessionRecord][hc-sleep]                      | None                                               |
| Sleep score               | None                                                                      | None                                               |
| Steps                     | `Steps` (confirmed by a user review) [Play][play]                         | None                                               |
| Resting HR                | `RestingHeartRate`, if written                                            | None                                               |
| Stress                    | None                                                                      | None                                               |
| Workouts                  | `ExerciseSession` type, title, times; HR and distance as separate records | Activity with type, distance, average HR, calories |

## Option 1: read Health Connect from the journal app (recommended)

- **Already wired**: `react-native-health-connect` 4.1.3 and its config plugin read Calm sessions in `src/lib/health/calm-auto-log.android.ts`. Its types include `SleepSession`, `ExerciseSession`, `BackgroundAccessPermission` and `ReadHealthDataHistoryPermission` (`node_modules/react-native-health-connect/src/index.tsx`).
- **Background reads**: declare `READ_HEALTH_DATA_IN_BACKGROUND`, check `FEATURE_READ_HEALTH_DATA_IN_BACKGROUND`, and read from a WorkManager job. [Read data][hc-read]
- **Scheduler**: `expo-background-task` runs JS on WorkManager, at least every 15 minutes (default 12 hours). Tasks survive a reboot but stop if the user force-kills the app. [Background task][expo-bg] Not yet a dependency.
- **History**: reads reach 30 days before the first grant; older needs `READ_HEALTH_DATA_HISTORY`. [Read data][hc-read]
- **Filter by origin**: pass Mobvoi Health's package (`com.mobvoi.companion.at`) as `dataOriginFilter`, as the Calm import does with Calm's. [Play][play]
- **Write path**: the task posts to `/api/sleep` and `/api/workouts` with the app's existing auth, so readers in `src/core` stay unchanged.
- **Hands-off?** Yes after one permission grant, unless the phone's vendor kills background work. [Background task][expo-bg]
- **Effort**: medium. New permissions mean a new APK, not an EAS Update. `workouts.activity_id` is an INTEGER key, so Health Connect's string record IDs need a text key (the Fitbit plan needs the same migration).
- **Web**: can't read Health Connect, but web only reads the rows the phone pushed.

## Option 2: Google Health API via the Google Health app

- **Chain**: Mobvoi Health → Health Connect → Google Health app (Partner apps sync) → Google Health API → GitHub Action.
- **Google Health app reads** sleep sessions, sleep stages, exercise, heart rate, resting HR and steps from Health Connect, and stores them "in your account". Setup grants background and history access. [Google Health: Health Connect][gh-hc]
- **The API tags such data**: `DataSource.Platform` has `HEALTH_CONNECT`, "The data was uploaded from Health Connect", with the source app's package name. [dataPoints reference][gh-ref]
- **No device needed**: Google Health supports phone-only tracking (MobileTrack). [Data types][gh-types]
- **Shares the Fitbit plan's code and risk**: restricted scopes and a refresh token that may expire after 7 days unless the OAuth app is "In Production". See [fitbit-data.md](fitbit-data.md#auth-from-a-headless-github-action).
- **Unverified**: that partner-app data appears in the API at all. The data-types page lists only Fitbit and Pixel devices as sources. [Data types][gh-types]
- **When to pick it**: if the owner moves to a Fitbit or Pixel Watch, one pipeline then serves both.

## Option 3: Strava API for workouts

- **Recording**: start workouts in Strava on the watch instead of TicExercise; it runs on WHS. [Guide][guide] Mobvoi's portal also claims Strava compatibility, but no source says it auto-uploads. [Notebookcheck][nbc]
- **Auth**: access tokens last 6 hours; each refresh returns a new refresh token and invalidates the old one. [Authentication][strava-auth] The Action must persist the rotated token, for example in D1 or a repo secret updated with `gh secret set`.
- **Limits**: new apps have an athlete capacity of 1 ("Single Player Mode"), enough for the owner; 100 reads per 15 minutes. [Rate limits][strava-rate]
- **Fit**: a `push_strava_workouts.py` beside the Garmin scripts, reusing `call_dashboard`.
- **Cost to the owner**: a one-time habit change (open Strava, not TicExercise). Not routine input.

## Fallbacks

- **Sleep as Android** on the watch writes sleep phases to Health Connect. [Health Connect docs][saa-hc] Its stages come from movement only: light and deep, no REM. [Sleep tracking theory][saa-theory] Tracking starts from a watch tile, so check its auto-start before relying on it. [Play: Sleep as Android][saa-play]
- **Health Sync** (paid third-party app) copies between Health Connect, Strava and others. [Health Sync][healthsync] It can't add data Mobvoi never exports.

## Plan

1. **Owner (1 minute)**: open **Settings → Health Connect → App permissions → Mobvoi Health** and note which types it writes. Open **Data and access → Sleep** and check a TicWatch night appears.
2. **If sleep and exercise appear**: build option 1. Add `expo-background-task`, the background and history permissions in `app.json`, and a task that reads `SleepSession` and `ExerciseSession` since the newest stored row, then posts them.
3. **Schema**: give `workouts` a text key; send `sleep_score` empty, as the Fitbit plan does.
4. **If Mobvoi writes only steps**: use option 3 for workouts. For sleep, trial Sleep as Android for a week, then read its sessions through option 1.
5. **Cut over**: stop the Garmin steps in `garmin-sleep.yml` once TicWatch rows arrive; update `docs/api-migration.md`.

## Not verified from a primary source

- **Mobvoi's Health Connect writes**: no Mobvoi page covers them; evidence is one 2024 review and one vendor page.
- **Google Health API returning partner-app data** for a user without a Fitbit or Pixel device.
- **Background reads on the owner's phone**: vendor battery policies vary. [Background task][expo-bg]

[expo-bg]: https://docs.expo.dev/versions/latest/sdk/background-task/
[fit-faq]: https://developer.android.com/health-and-fitness/guides/health-connect/migrate/migration-faq
[gb]: https://gadgetbridge.org/gadgets/
[gh-hc]: https://support.google.com/fitbit/answer/14506680?hl=en
[gh-ref]: https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints
[gh-types]: https://developers.google.com/health/data-types
[guide]: https://growth-cdn.ticwear.com/ticbuy/user-guide/TicWatch_Pro_5_Enduro_User_Help-English.pdf
[hc-read]: https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data
[hc-sleep]: https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/SleepSessionRecord
[healthsync]: https://healthsync.app/
[hs-passive]: https://developer.android.com/health-and-fitness/guides/health-services/monitor-background
[nbc]: https://www.notebookcheck.net/Mobvoi-unveils-a-new-Sports-and-Health-Data-Platform.694680.0.html
[play]: https://play.google.com/store/apps/details?id=com.mobvoi.companion.at
[saa-hc]: https://sleep.urbandroid.org/docs/services/health_connect.html
[saa-play]: https://play.google.com/store/apps/details?id=com.urbandroid.sleep
[saa-theory]: https://sleep.urbandroid.org/docs/sleep/sleep_tracking_theory.html
[sahha]: https://sahha.ai/integrations/mobvoi/
[strava-auth]: https://developers.strava.com/docs/authentication/
[strava-rate]: https://developers.strava.com/docs/rate-limits/
