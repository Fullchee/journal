# Getting Hevy workout data into journal-native

Research for syncing Hevy strength workouts hands-off, as `scripts/garmin/` does for Garmin. Constraint: the owner won't pay for Hevy Pro. Researched 2026-11-12.

> **Update 2026-11-17**: the Garmin push is gone ([#135](https://github.com/Fullchee/journal-native/issues/135)). Fitbit data now reaches the app through Health Connect, filtered by `FITBIT_PACKAGE` in `src/core/fitbit-auto-complete.ts`. To switch back to Garmin, set that filter to Garmin Connect's package, `com.garmin.android.apps.connectmobile`. The Garmin parts below describe the removed push.

## Answer

| Rank | Route                                                                                             | Free?         | Sets, reps, weight | Verdict                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------- | ------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Hevy's private web API** (what hevy.com and its CSV export call), from a Cloudflare Worker cron | Yes           | Yes                | Recommended. Full detail, no browser. Undocumented, so it can break, and Hevy may suspend accounts for "unauthorized use". |
| 2    | **Health Connect, read by the journal app** (as the Calm import does)                             | Yes           | No                 | Safe fallback. Gets one "Strength Training" session with calories per workout. No exercises or sets.                       |
| 3    | **Strava API**, with Hevy's free Strava sync on                                                   | Yes           | No (unverified)    | Summary only. Adds a second OAuth app with rotating tokens.                                                                |
| ✗    | **Official public API** (`api.hevyapp.com/v1`)                                                    | **Needs Pro** | Yes                | Best API on paper: documented, has an events feed with deletes. Ruled out by the no-Pro constraint.                        |
| ✗    | **Headless browser clicking hevy.com's Export**                                                   | Yes           | Yes                | Login runs reCAPTCHA Enterprise. The export just calls route 1's API in the browser, so a browser only adds bot risk.      |
| ✗    | **Garmin Connect**                                                                                | —             | —                  | Hevy has no Garmin integration; Garmin rejected its API application. [Garmin article][hc-garmin]                           |
| ✗    | **In-app export** (Settings → Export & Import Data)                                               | Yes           | Yes                | Manual each time. Fine for a one-off backfill. [Export article][hc-export]                                                 |

- **Pick route 1** if full set detail matters. Its failure mode is loud: the cron logs an auth or shape error, and nothing else breaks.
- **Pick route 2** if any ban risk is too much. It costs no new secrets, but loses everything Hevy is for.
- **Both can run together**: route 2 is a cheap backstop when route 1 breaks.

## Today's Garmin pipeline, for comparison

- **Runner**: `.github/workflows/garmin-sleep.yml`, a GitHub Actions cron every 3 days at 12:00 UTC, plus `workflow_dispatch`.
- **Runtime**: `uv run --frozen` on Python scripts in `scripts/garmin/`.
- **Secrets**: GitHub repo secrets. `GARMIN_TOKENS_B64` (a tarball of tokens), `DASHBOARD_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`.
- **Landing**: `call_dashboard()` posts to the Worker's `/api/workouts` behind Cloudflare Access, which writes D1.
- **Schema**: `workouts.activity_id INTEGER PRIMARY KEY` (`worker/migrations/0040_workouts.sql`). Hevy IDs are UUID strings, so Hevy needs its own tables.
- **Worker crons**: `wrangler.jsonc` has no `triggers` today, and `worker/index.ts` has no `scheduled()` handler.

## Route 1: Hevy's private web API (recommended)

What hevy.com itself does, read from its production bundle ([`_app` chunk][bundle-app], [settings chunk][bundle-settings], fetched 2026-11-12):

- **Base URL and headers**: `https://api.hevyapp.com/` with `x-api-key: shelobs_hevy_web` (a fixed web-client key, not a user key), `Hevy-Platform: web`, and `authorization: Bearer <access_token>`.
- **Login**: `POST login` with `emailOrUsername`, `password` and a `recaptchaToken`. The token comes from reCAPTCHA Enterprise on the login page. [Login page][hevy-login] A headless runner can't log in this way.
- **Refresh**: `POST auth/refresh_token` with `{refresh_token}` returns a new `access_token`, `refresh_token` and `expires_at`. No reCAPTCHA. The web app stores all three in a cookie named `auth2.0-token`.
- **So the bootstrap is**: the owner logs in once in a browser and copies the `refresh_token` from that cookie. The runner refreshes from then on and saves each new refresh token.
- **Workouts**: `GET workout_count`, then `GET workouts_batch/{index}` in a loop. The next index is the last workout's `index + 1`. This is exactly the web export's loop.
- **Fields**: `workouts_batch` returns a bare array of workouts. The web export's CSV code reads workout `id`, `index`, `name`, `description`, `start_time` and `end_time` (Unix seconds); per exercise `title`, `exercise_template_id`, `notes`, `superset_id`; per set `indicator` (warmup, normal, dropset, failure), `weight_kg`, `reps`, `distance_meters`, `duration_seconds`, `rpe`.
- **Smoke test** (#136, 2026-11-12): from a deployed Worker, `auth/refresh_token` with a fake token answered `400` and `workouts_batch/0` answered `401`, the same as from a Mac. Cloudflare egress is not blocked.
- **Free tier**: the export code has no Pro check; the API-key button does. The UI calls the export "your entire workout history". Free accounts only limit stats charts to 3 months; the workouts stay on Hevy's servers. [Downgrade article][hc-downgrade]
- **Deletes**: no events feed here. Detect a delete by diffing the full ID list against stored rows.

### Risks

- **Breakage**: undocumented. A renamed path or field breaks the sync silently unless the job checks the response shape (parse with a `zod/mini` schema, per `AGENTS.md`).
- **Token rotation**: unverified whether the old refresh token dies on refresh, and how long an unused one lasts. Assume rotation: the runner must persist each new token, or the next run is locked out.
- **Terms**: Hevy's terms forbid no automated access by name. They do let Hevy "suspend your account at any time in case of unauthorized, or suspected unauthorized use". [Terms][hevy-terms] Reading your own data at the web app's own pace is low risk, but not zero.
- **Rate**: no published limit for this API. Hevy asks public-API users to avoid hitting it exactly at `xx:00`. [OpenAPI spec][hevy-openapi] Follow that here too.

## Route 2: Health Connect from the journal app

- **What Hevy writes**: completed workouts, logged only as "Strength Training", with "Total calories burned" as a rough estimate. [Calories article][hc-calories] The owner turns it on in Hevy: **Settings → Integrations → Manage → Health Connect**, and keeps "Sync with: Health Connect" on at save. [Google Fit article][hc-gfit]
- **Free**: Health Connect sync is not in the Pro feature list. [Pro article][hc-pro]
- **Already wired**: `src/lib/health/calm-auto-log.android.ts` reads Health Connect with a `dataOriginFilter`. Filter on Hevy's package, `com.hevy`. [Play listing][play]
- **Gives up**: exercises, sets, reps, weight, RPE and notes. No Hevy source lists them among the shared types.
- **Freshness**: whenever the phone runs the background task. See [ticwatch-data.md](ticwatch-data.md#option-1-read-health-connect-from-the-journal-app-recommended) for the background-read setup it shares.

## Route 3: Strava API

- **Hevy → Strava** is a free, one-way sync of completed workouts. [Strava article][hc-strava], [Features guide][hc-features]
- **Read side**: the Strava API needs an OAuth app and rotating refresh tokens; details in [ticwatch-data.md](ticwatch-data.md#option-3-strava-api-for-workouts).
- **Gives up**: set detail, unless Hevy writes it into the activity description. No Hevy source says what the description holds.
- **Only worth it** if the owner wants Strava anyway.

## Official public API (needs Pro)

For the record, in case the owner ever buys Pro:

- **Access**: "API access is currently only available to Hevy Pro users". The key comes from hevy.com Settings → Developer. [API article][hc-api] The web UI shows a paywall instead of a key for free accounts. [Settings chunk][bundle-settings]
- **Status**: version `0.0.1`. "We make no guarantees that we won't completely change the structure or abandon the project entirely." [OpenAPI spec][hevy-openapi] The help center calls it "still experimental". [API article][hc-api]
- **Auth**: an `api-key` header (UUID). [OpenAPI spec][hevy-openapi]
- **Endpoints**: `GET /v1/workouts`, `/v1/workouts/count`, `/v1/workouts/{id}`, `/v1/workouts/events?since=`, `/v1/routines`, `/v1/routine_folders`, `/v1/exercise_templates`, `/v1/exercise_history/{templateId}`, `/v1/body_measurements`, `/v1/user/info`. [OpenAPI spec][hevy-openapi]
- **Paging**: `pageSize` max 10 for workouts and events, 100 for exercise templates. [OpenAPI spec][hevy-openapi]
- **Events feed**: newest first; each event is `updated` (with the full workout) or `deleted` (with `id` and `deleted_at`). [OpenAPI spec][hevy-openapi]
- **Rate limits**: none documented; no `429` response in the spec. [OpenAPI spec][hevy-openapi]
- **Webhook**: Settings → Developer offers one. On each new workout it POSTs `{"workoutId": …}` to your URL with your auth header, and expects `200` within 5 seconds. [Settings chunk][bundle-settings] Undocumented in the spec; new workouts only.
- **Not covered**: heart rate, Health Connect data, deleting via the API. [API article][hc-api]

## Runners

| Runner                                    | Cost                                                                                   | Secrets                                                        | Fit                                                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare Worker Cron Trigger** (pick) | Free plan: 5 crons per account, 10 ms CPU, 50 subrequests per run. [Limits][cf-limits] | `wrangler secret put`; rotating token saved in D1              | Writes D1 directly, no Access hop. Saving the rotated refresh token is one `UPDATE`. TypeScript, beside the existing Worker. |
| **GitHub Actions schedule**               | Private repo: $12/month of included compute on GitHub Free. [Billing][gh-billing]      | Repo secrets; a rotated token needs `gh secret set` with a PAT | Reuses `uv`, `call_dashboard` and the Garmin workflow. Saving a rotated token from inside the run is awkward.                |
| **AWS Lambda + EventBridge**              | 1M requests and 400,000 GB-seconds a month free. [Lambda pricing][lambda]              | Secrets Manager or SSM                                         | A new cloud account, IAM and deploy path for one job. No reason to add it.                                                   |

- **Cron Trigger notes**: set in `triggers.crons` in `wrangler.jsonc`, handled by `scheduled()`, runs in UTC. Changes take up to 15 minutes to propagate. [Cron Triggers][cf-cron]
- **CPU on the free plan**: 10 ms covers parsing a few pages of JSON; waiting on `fetch` doesn't count as CPU. Do a full re-read rarely (weekly), and an incremental one daily, to stay inside it and the 50-subrequest cap. [Limits][cf-limits]
- **GitHub caveats**: scheduled runs "can be delayed during periods of high loads", worst at the top of the hour. The 60-day auto-disable applies only to public repos; `journal-native` is private. [Events that trigger workflows][gh-schedule]
- **Unverified**: that `api.hevyapp.com` accepts requests from Cloudflare's egress IPs. Test once before building.

## Plan (route 1)

Sketch only:

```text
scheduled(), daily at 07:23 UTC (not xx:00):
  token = D1 hevy_auth row; if expired → POST auth/refresh_token; save the new token row first
  stored = max(index) from hevy_workouts
  loop GET workouts_batch/{next index} until the batch is empty   # weekly: start at 0
  parse each workout with a zod/mini schema; skip and log a bad one
  upsert hevy_workouts by id (TEXT, Hevy's UUID); replace that workout's hevy_sets rows
  weekly full read: delete stored ids that Hevy no longer returns
```

- **Schema**: new `hevy_workouts` (`id`, `title`, `start_time`, `end_time`, `description`, `updated_at`) and `hevy_sets` (`workout_id`, `exercise_index`, `set_index`, `exercise_title`, `exercise_template_id`, `exercise_notes`, `superset_id`, `set_type`, `weight_kg`, `reps`, `rpe`, `distance_m`, `duration_s`). Keep Garmin's `workouts` table as is.
- **Backfill**: the first run starts at index 0 and pulls the whole history.
- **Overlap with Garmin**: if the owner wears the Garmin while lifting, both record the session. Pair them by start time in the reader, not at write time.

### What the owner does by hand

Built in #136: `worker/lib/hevy-sync.ts`, run daily at 07:23 UTC by the Worker's cron.

1. **Log in** at hevy.com in a desktop browser. Open dev tools → Application → Cookies → `https://hevy.com` → `auth2.0-token`, tick "Show URL-decoded", and copy `refresh_token` from the JSON.
2. **Seed it** once:

   ```bash
   bunx wrangler d1 execute fullchee-dashboard --remote --command "INSERT INTO hevy_auth (id, refresh_token) VALUES (1, '<refresh_token>') ON CONFLICT (id) DO UPDATE SET refresh_token = excluded.refresh_token, access_token = NULL, expires_at = NULL"
   ```

3. **Wait for the cron**, or watch the first run with `bunx wrangler tail journal`. The first runs backfill up to 44 batches each until the whole history is in.
4. **Repeat steps 1 and 2** only when the cron logs `Hevy sign-in failed`.
5. **Optional, route 2**: in Hevy, Settings → Integrations → Health Connect → allow Hevy's permissions.

## Not verified from a primary source

- **Refresh-token rotation and lifetime** on the private API.
- **Ordering of `workouts_batch`** beyond what the export loop implies (ascending `index`).
- **Whether the webhook is Pro-only** on the server; only the API-key button is gated in the UI.
- **What Hevy writes to a Strava activity's description.**
- **Cloudflare egress** reaching `api.hevyapp.com` without a block.

[bundle-app]: https://hevy.com/_next/static/chunks/pages/_app-946c730fc6e33351.js
[bundle-settings]: https://hevy.com/_next/static/chunks/pages/settings-7b434259086bb5c4.js
[cf-cron]: https://developers.cloudflare.com/workers/configuration/cron-triggers/
[cf-limits]: https://developers.cloudflare.com/workers/platform/limits/
[gh-billing]: https://docs.github.com/en/billing/concepts/product-billing/github-actions
[gh-schedule]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
[hc-api]: https://help.hevyapp.com/hc/en-us/articles/44834585028375-How-to-Access-and-Use-the-Hevy-API
[hc-calories]: https://help.hevyapp.com/hc/en-us/articles/34462684813079-How-to-see-the-calories-burned-in-a-workout-Apple-iOS-Android
[hc-downgrade]: https://help.hevyapp.com/hc/en-us/articles/38279350428695-What-will-happen-to-my-account-if-I-switch-from-Pro-to-the-free-version
[hc-export]: https://help.hevyapp.com/hc/en-us/articles/43708290987415-Exporting-Your-Data-from-Hevy
[hc-features]: https://help.hevyapp.com/hc/en-us/articles/33106320824727-Everything-You-Need-to-Know-About-the-Hevy-App-2026-Features-Guide
[hc-garmin]: https://help.hevyapp.com/hc/en-us/articles/35361029194647-Hevy-and-Garmin-Integration-Update-Why-It-s-Not-Possible-Yet
[hc-gfit]: https://help.hevyapp.com/hc/en-us/articles/34204824335255-How-to-Connect-Hevy-to-Google-Fit-Using-Health-Connect
[hc-pro]: https://help.hevyapp.com/hc/en-us/articles/35119778922263-Hevy-Pro-Subscription-How-to-get-Pro-and-What-Does-It-Include
[hc-strava]: https://help.hevyapp.com/hc/en-us/articles/38279744541591-Using-Hevy-with-Strava-Setup-Syncing-and-Editing-Workouts
[hevy-login]: https://hevy.com/login
[hevy-openapi]: https://api.hevyapp.com/docs/
[hevy-terms]: https://www.hevyapp.com/terms-and-conditions-1/
[lambda]: https://aws.amazon.com/lambda/pricing/
[play]: https://play.google.com/store/apps/details?id=com.hevy
