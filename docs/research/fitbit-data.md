# Getting Fitbit data into journal-native

Research for moving the Garmin sync to a Fitbit. Researched 2026-11-12.

> **Update 2026-11-17**: the Garmin push is gone ([#135](https://github.com/Fullchee/journal-native/issues/135)). Fitbit data now reaches the app through Health Connect, filtered by `FITBIT_PACKAGE` in `src/core/fitbit-auto-complete.ts`. To switch back to Garmin, set that filter to Garmin Connect's package, `com.garmin.android.apps.connectmobile`. The Garmin parts below describe the removed push.
>
> **Update 2026-11-20**: the owner chose Option 4 over the Google Health API ([#17](https://github.com/Fullchee/journal/issues/17)): no OAuth token to expire and no Worker secrets. The app uploads Fitbit sessions, with km from Health Connect `Distance` records, to `fitbit_sessions` through `POST /api/fitbit-sessions`. The Google Health sync and its setup wizard are gone; the plan below is not followed.

## Answer

| Rank | Route                                                 | Verdict                                                                                                       |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1    | **Google Health API** from the existing GitHub Action | Recommended. Same shape as `scripts/garmin/`: a refresh token in a repo secret, a scheduled push to `/api/*`. |
| 2    | **Health Connect** read on app open                   | Fallback. The app already reads Calm this way. No server, but no SpO2 or Active Zone Minutes.                 |
| 3    | **Google Takeout**                                    | One-off archive only. Not needed for backfill: the API has no history limit.                                  |
| ✗    | **Fitbit Web API**                                    | Dead. Turned off on 2026-11-02; requests return HTTP 410. [About the Google Health API][gh-about]             |
| ✗    | **Paid aggregators** (Terra)                          | $399–$499 a month, no hobby tier. [Terra pricing][terra]                                                      |

- **Key risk**: Google Health API scopes are all Restricted. [About][gh-about] An app left in "Testing" gets a refresh token that expires in 7 days. [OAuth 2.0][oauth-expiry] Weekly re-consent breaks "zero routine input".
- **The fix to try first**: publish the OAuth app "In Production" and stay unverified. Google exempts personal use: "if you are the only user of your app". [Restricted scope verification][restricted] Production refresh tokens "generally don't expire". [Setup][gh-setup]
- **Unconfirmed**: no Google page says an unverified production app with Google Health scopes gets a non-expiring token. Step 2 of the plan tests this before any code.
- **Not available anywhere**: Fitbit's sleep score and stress. The Google Health API `sleep` resource has no score field, and no stress type exists. [dataPoints reference][gh-ref]

## Today's Garmin pipeline

| Part            | What it does                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Schedule**    | `.github/workflows/garmin-sleep.yml`: 12:00 UTC on days 1, 4, 7… of each month, plus manual runs. `TZ: America/Toronto`.                          |
| **Garmin auth** | `garminconnect` (unofficial) logs in with cached tokens from the `GARMIN_TOKENS_B64` secret; never a password.                                    |
| **App auth**    | Cloudflare Access service token (`CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`) on every call, via `call_dashboard` in `push_garmin_sleep.py`. |
| **Window**      | GET the stored rows, then fetch every day after the newest one up to yesterday. First run: 14 days. Workouts always re-fetch the last 14 days.    |
| **CI**          | `ci.yml` lints, type-checks and tests `scripts/garmin` with uv.                                                                                   |

| Script                    | Endpoint / D1 table          | Fields                                                                                                          |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `push_garmin_sleep.py`    | `/api/sleep` → `sleep`       | `date`, `sleep_start`, `sleep_end`, `duration_min`, `sleep_score`                                               |
| `push_garmin_activity.py` | `/api/activity` → `activity` | `date`, `steps`, `moderate_min`, `vigorous_min`, `resting_hr`, `avg_stress`                                     |
| `push_garmin_workouts.py` | `/api/workouts` → `workouts` | `activity_id` (INTEGER PK), `type_key`, `name`, `start_local`, `duration_s`, `distance_m`, `avg_hr`, `calories` |

- **Readers**: `src/core/sleep-summary.ts` (bedtime and its spread), `activity-summary.ts` (steps, intensity minutes with vigorous ×2, resting HR, stress), `workout-summary.ts` (count and time per type).
- **Not captured today**: sleep stages, HRV, SpO2.

## Field coverage

| Garmin field (or wish)      | Google Health API                                                                                                                                                    | Health Connect (Fitbit writes) |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Sleep start, end, duration  | `sleep`: `interval`, `summary.minutesAsleep` [Sleep][gh-sleep]                                                                                                       | Sleep session                  |
| Sleep stages                | `sleep.stages`: LIGHT, DEEP, REM, AWAKE [Sleep][gh-sleep]                                                                                                            | Sleep stages                   |
| Sleep score                 | None [dataPoints reference][gh-ref]                                                                                                                                  | None                           |
| Steps                       | `steps`, summed with `dailyRollUp` [Endpoints][gh-endpoints]                                                                                                         | Steps                          |
| Moderate / vigorous minutes | `active-zone-minutes`: zone FAT_BURN, CARDIO or PEAK [dataPoints reference][gh-ref]                                                                                  | None listed                    |
| Resting HR                  | `daily-resting-heart-rate`: `beatsPerMinute` [dataPoints reference][gh-ref]                                                                                          | Resting heart rate             |
| Stress                      | None                                                                                                                                                                 | None                           |
| HRV                         | `daily-heart-rate-variability`: `averageHeartRateVariabilityMilliseconds` (RMSSD) [dataPoints reference][gh-ref]                                                     | Heart rate variability         |
| SpO2                        | `daily-oxygen-saturation` [Data types][gh-types]                                                                                                                     | Not written (read only)        |
| Workouts                    | `exercise`: `exerciseType`, `displayName`, `metricsSummary` (`caloriesKcal`, `distanceMillimeters`, `averageHeartRateBeatsPerMinute`) [dataPoints reference][gh-ref] | Exercise                       |

Health Connect column source: the Google Health app's read/write table. [Fitbit Help: Health Connect][fb-hc]

## Option 1: Fitbit Web API

- **Status**: support ended 2026-09-30. The API and Fitbit OAuth endpoints turned off on 2026-11-02 and now return HTTP 410 Gone. [About][gh-about]
- **Old tokens**: they don't carry over; users must re-consent with Google OAuth. [Migration][gh-migration]
- **Verdict**: not an option. Its personal-app and intraday rules no longer matter.

## Option 2: Google Health API (recommended)

### What it is

- **Launch**: GA on 2026-03-24 as "the next generation of the Fitbit Web API". Stable channel `v4`. [Release notes][gh-notes]
- **Base URL**: `https://health.googleapis.com/v4/users/me/dataTypes/{type}/dataPoints`, with `:rollUp` and `:dailyRollUp`. [Endpoints][gh-endpoints]
- **Filters**: civil (local) times, e.g. `steps.interval.civil_start_time >= "2026-03-04T00:00:00"`. [Endpoints][gh-endpoints] This matches Garmin's local dates.
- **History**: queryable "as far back as it was recorded, with no API-imposed limit". [Data types][gh-types]
- **Range caps**: rollups span at most 14 days for `heart-rate` and `active-minutes`, 90 days for the rest. `sleep` and `exercise` pages hold 25 items. [Data types][gh-types]
- **Rate limit**: 300 requests a minute per user; unverified apps 2.5 QPS per user. [Rate limits][gh-rate] A few dozen calls a run is far below this.
- **Account**: the Fitbit account must be linked to a Google Account, or calls return `ACCOUNT_NOT_LINKED`. [Migration][gh-migration] Step 1 of the plan checks this.

### Auth from a headless GitHub Action

| Setting                           | Effect                                                                         | Source                                                       |
| --------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Scopes                            | All Restricted; read scopes end in `.readonly` (e.g. `.sleep.readonly`)        | [About][gh-about], [Sleep][gh-sleep]                         |
| Publishing status "Testing"       | Refresh token expires in 7 days                                                | [OAuth 2.0][oauth-expiry], [Setup][gh-setup]                 |
| Publishing status "In Production" | Refresh tokens "generally don't expire" unless revoked or unused for ~6 months | [Setup][gh-setup]                                            |
| Unverified                        | Capped at 100 users; shows an "unverified app" screen                          | [App verification][gh-verify], [Unverified apps][unverified] |
| Personal use                      | Exempt from verification when you are "the only user"                          | [Restricted scope verification][restricted]                  |
| Token limit                       | 100 refresh tokens per account per client; the oldest dies silently            | [OAuth 2.0][oauth-expiry]                                    |

- **Getting the token once**: Google has an OAuth Playground codelab for this API. [Codelab][gh-playground]
- **Prior art**: `antivex/google-health-to-intervals` runs this exact pattern from GitHub Actions. It stays in Testing and asks for re-consent every 7 days. [README][prior-art] That is the outcome to avoid.
- **Separate project**: the worker's Google Calendar client (`GOOGLE_REFRESH_TOKEN`) lives in a production OAuth app. Keep Health scopes in their own Cloud project, so a verification flag can't touch Calendar.

### Effort and risks

- **Effort**: small. Three Python scripts mirror the Garmin ones; plain `urllib` plus one token refresh POST. `allenporter/python-google-health-api` exists (v0.10.0, pushed 2026-11-11) but is young. [Repo][allenporter]
- **Risk: token expiry**. If production still issues 7-day tokens, fall back to Option 4.
- **Risk: workout IDs**. A data point's ID is its `name` string. [Sleep][gh-sleep] `workouts.activity_id` is an INTEGER key, so the table needs a text key.
- **Risk: intensity minutes**. AZM already counts cardio and peak minutes as 2. [dataPoints reference][gh-ref] `activity-summary.ts` doubles `vigorous_min` again, so store raw minutes: FAT_BURN → moderate, (CARDIO + PEAK) ÷ 2 → vigorous.

## Option 3: Google Takeout

- **How**: Google's download tool with "Google Health" selected. [Fitbit Help: export][fb-export]
- **Automation**: scheduled exports run "every 2 months for one year", to Drive, Dropbox, OneDrive, Box or an email link. [Download your data][takeout] Too slow for a daily sync.
- **Format**: Google's page doesn't name it. Community reports describe JSON under `Takeout/Fitbit/Global Export Data/`, with thinner sleep data after the move. Treat as unverified.
- **Use**: a one-off personal archive. The API already backfills, so the sync doesn't need it.

## Option 4: Health Connect on the phone (fallback)

- **Already wired**: `react-native-health-connect` 4.1.3 and its config plugin are in the app, used by the Calm import (`_layout.tsx`). Its types include `SleepSession`, `RestingHeartRate`, `HeartRateVariabilityRmssd`, `Steps`, `ExerciseSession`, plus a history permission.
- **Library health**: not archived; last push 2026-08-26. [Repo][rnhc]
- **History**: reads reach 30 days before the first grant. Older data needs `PERMISSION_READ_HEALTH_DATA_HISTORY`. [Read data][hc-read]
- **When it runs**: foreground reads work by default. Background reads need `READ_HEALTH_DATA_IN_BACKGROUND` and a WorkManager job. [Read data][hc-read] The library exposes the permission, not a scheduler, so app-open reads are the cheap path.
- **Gaps**: no SpO2 (Fitbit doesn't write it), no Active Zone Minutes, no score or stress. [Fitbit Help: Health Connect][fb-hc]
- **Hands-off?** Only if the owner opens the app. Web can't read Health Connect.
- **Effort**: medium. New permissions mean a new development build, not an EAS Update.

## Option 5: Third-party tools

| Tool                                   | Status                                                | Verdict                                          |
| -------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `orcasgit/python-fitbit`               | Last push 2024-07-23; targets the dead Fitbit Web API | Ruled out [Repo][python-fitbit]                  |
| `allenporter/python-google-health-api` | Active, v0.10.0                                       | Optional client for Option 2 [Repo][allenporter] |
| `the-momentum/open-wearables`          | Active, self-hosted platform                          | Too heavy for one user [Repo][open-wearables]    |
| Terra                                  | From $399/month annual, 30-day trial                  | Ruled out on cost [Pricing][terra]               |

## Plan

Maps onto `scripts/garmin/` and `garmin-sleep.yml`.

1. **Owner**: confirm the Google Health app shows Fitbit data under the Google Account.
2. **Owner (wizard, `scripts/setup-google-health.sh`)**: create a new Cloud project and enable the Google Health API. Add the `.readonly` scopes for sleep, activity and fitness, and health metrics. Set the audience to External, add yourself, and publish "In Production". Mint a refresh token in OAuth Playground. **Gate**: if the token response carries `refresh_token_expires_in`, production didn't help; switch to Option 4.
3. **Secrets**: add `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET` and `GOOGLE_HEALTH_REFRESH_TOKEN` to the repo.
4. **Move first**: rename `scripts/garmin` → `scripts/health` and the workflow in their own commit, so git shows a rename.
5. **Scripts**: add `push_fitbit_sleep.py`, `push_fitbit_activity.py` and `push_fitbit_workouts.py`. Reuse `call_dashboard`, `FIRST_RUN_DAYS` and the catch-up window. Send `sleep_score` empty and `avg_stress` null.
6. **Schema**: a D1 migration gives `workouts` a text ID; new nullable columns for HRV, SpO2 and stage minutes, if wanted, with matching zod schemas in `src/core`.
7. **Backfill**: one manual run with a long first window from the switch date. No Takeout needed.
8. **Cut over**: run the Fitbit steps in the same job, then drop the Garmin steps and `GARMIN_TOKENS_B64`. Update `docs/api-migration.md` and the "Garmin" comments in `src/core`.

[allenporter]: https://github.com/allenporter/python-google-health-api
[fb-export]: https://support.google.com/fitbit/answer/14236615?hl=en
[fb-hc]: https://support.google.com/fitbit/answer/14506680?hl=en
[gh-about]: https://developers.google.com/health/about
[gh-endpoints]: https://developers.google.com/health/endpoints
[gh-migration]: https://developers.google.com/health/migration
[gh-notes]: https://developers.google.com/health/release-notes
[gh-playground]: https://developers.google.com/health/codelabs/make-your-first-api-call-using-oauth2-playground
[gh-rate]: https://developers.google.com/health/rate-limits
[gh-ref]: https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints
[gh-setup]: https://developers.google.com/health/setup
[gh-sleep]: https://developers.google.com/health/data-types/sleep
[gh-types]: https://developers.google.com/health/data-types
[gh-verify]: https://developers.google.com/health/app-verification
[hc-read]: https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data
[oauth-expiry]: https://developers.google.com/identity/protocols/oauth2#expiration
[open-wearables]: https://github.com/the-momentum/open-wearables
[prior-art]: https://github.com/antivex/google-health-to-intervals
[python-fitbit]: https://github.com/orcasgit/python-fitbit
[restricted]: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
[rnhc]: https://github.com/matinzd/react-native-health-connect
[takeout]: https://support.google.com/accounts/answer/3024190?hl=en
[terra]: https://tryterra.co/pricing
[unverified]: https://support.google.com/cloud/answer/7454865?hl=en
