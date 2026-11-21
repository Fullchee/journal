# Sentry (#129)

Android and web report errors, traces, breadcrumbs, console logs, session replays (10% of sessions, every session with an error) and user feedback to one Sentry project. Sentry stays off until `EXPO_PUBLIC_SENTRY_DSN` is set: without it, `initSentry` (`src/lib/sentry.ts`) never calls `Sentry.init` and the app sends nothing.

## Where each value lives

Keep every value in Bitwarden, then copy it to the places below.

| Value                          | Secret?                               | Put it in                                                                                                      | Used by                                                                           |
| ------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_SENTRY_DSN`       | No: the app sends it with every event | `.env`                                                                                                         | Local dev and `bun run android:apk`                                               |
| `EXPO_PUBLIC_SENTRY_DSN`       | No                                    | GitHub repo variable                                                                                           | The `deploy` job's web export                                                     |
| `EXPO_PUBLIC_SENTRY_DSN`       | No                                    | EAS environment variable, `production` (`bunx eas-cli env:create`)                                             | The `update` job: `eas update --environment production` reads EAS env, not GitHub |
| `SENTRY_AUTH_TOKEN`            | Yes                                   | Root `mise.local.toml` `[env]` (gitignored)                                                                    | Source map upload in `bun run android:apk`                                        |
| `SENTRY_ORG`, `SENTRY_PROJECT` | No                                    | Root `mise.local.toml` `[env]`, or `organization`/`project` on the `@sentry/react-native` plugin in `app.json` | Source map upload                                                                 |

`.env.schema` holds only public values, because varlock inlines them into the bundle; the auth token never goes there.

## Source maps

- **APK**: `bun run android:apk` uploads them when `SENTRY_AUTH_TOKEN` is set. Unset, it exports `SENTRY_DISABLE_AUTO_UPLOAD=true` and the build still succeeds; Sentry then shows minified stacks.
- **Matching**: `metro.config.js` uses `getSentryExpoConfig`, which stamps each bundle with a debug ID, so maps match without a matching release name.
- **Web and EAS Updates**: not uploaded yet.

## Tags

- **`environment`**: `development` under `__DEV__`, else `production`.
- **`release`**: `journal@<app version>`, plus `+<EAS Update id>` when an OTA update is running.
- **`app.platform`**: `android` or `web`.

## Web and Cloudflare

The web app posts events to the DSN's ingest host (`*.ingest.sentry.io`). No CSP exists today. If one is added to the Worker or Cloudflare Access, allow that host in `connect-src`, or set Sentry's `tunnel` option to a same-origin route.
