# Releasing the Android app

Every push to `main` reaches the installed APK over the air. No manual step, unless native code changes.

## How a release flows

1. **Push to `main`**: the `check` job passes, then the `release` job (`.github/workflows/ci.yml`) ships the web app and the Worker.
2. **Same job, after the deploy**: runs `eas update --channel production --platform android --environment production`.
3. **Phone**: the APK downloads the update at launch and runs it on the next launch.
4. **Native change**: the fingerprint differs from the last update's. CI posts a warning and reopens the "Rebuild the APK" issue. Push, run `bun run android:apk`, close the issue. On next launch the app shows an Install toast; tap it to download the APK.

## What is set up

| Piece                                          | Does                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `expo-updates`                                 | Downloads updates in the installed APK                                                                                 |
| `app.json` → `updates`                         | Points at the EAS project and asks for the `production` channel                                                        |
| `app.json` → `runtimeVersion`                  | `fingerprint` policy: an update reaches only APKs with the same native code                                            |
| `fingerprint.config.cjs`                       | Leaves `package.json` scripts and `eas.json` out of the fingerprint                                                    |
| `eas.json`                                     | One `production` profile for an owner-started `eas build`: APK, `production` channel                                   |
| `.github/workflows/ci.yml` → `update`          | Publishes each `main` push that changes more than docs; warns and reopens "Rebuild the APK" when the fingerprint moves |
| `bun run android:apk` (`scripts/build-apk.sh`) | Local release APK, published as the latest GitHub release; the usual way to ship native changes                        |
| `useApkUpdateToast`                            | On launch, shows an Install toast when the latest release's `runtime-version.txt` differs from the installed APK's     |
| `plugins/release-signing.ts`                   | Signs release builds with the owner's keystore when `JOURNAL_KEYSTORE_PATH` is set                                     |

## One-time setup

Done once by the owner. Each item is safe to re-check.

| What                           | Where                                          | How                                                                       |
| ------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------- |
| `EXPO_TOKEN`                   | GitHub repo secret, and root `mise.local.toml` | Run `scripts/setup-eas-update.sh` in a separate terminal                  |
| EAS project link               | `app.json` → `extra.eas.projectId`, `owner`    | Same wizard (`eas init`); already done                                    |
| `EXPO_PUBLIC_SENTRY_DSN`       | EAS environment variable, `production`         | `bunx eas-cli env:create --environment production` (see `docs/sentry.md`) |
| `EXPO_PUBLIC_ACCESS_CLIENT_ID` | Committed `.env`                               | Nothing: `eas update` reads `.env`                                        |
| Release keystore               | `~/.config/journal/`, root `mise.local.toml`   | `scripts/setup-release-keystore.sh`; back up the keystore and password    |
| First APK with `expo-updates`  | The phone                                      | `bun run android:apk`, then install it                                    |

Check the token with `bunx eas-cli whoami` from the repo root. It reads `EXPO_TOKEN` from `mise.local.toml`; never run `eas login`.

## Decisions

- **One channel, `production`**: one user and one phone, so a `preview` or `development` channel has no audience.
- **`fingerprint` runtime**: `appVersion` trusts a person to bump `version` after a native change. Forget once and the phone crashes on launch. A fingerprint mismatch only delays the update.
- **`appVersionSource: local`**: local APK builds read `versionCode` from `app.json`. A remote counter would let an EAS-built APK outrank them, and Android refuses to install the lower one.
- **No build in CI**: the EAS free tier allows 15 Android builds a month, and a local build is faster. Only the owner starts `eas build --profile production --platform android`.
- **GitHub Actions, not EAS Workflows**: the update must run after the deploy, so the phone never calls an API the Worker lacks. Both run in one `release` job, so a push installs packages once.
- **APKs on GitHub Releases**: the repo is public and the app holds no secrets, so anyone may download it; Cloudflare Access still guards the data. The phone installs from `https://github.com/Fullchee/journal/releases/latest/download/journal.apk`.
- **Owner's release key, not the template's**: the template signs release builds with a public debug key, so anyone could publish an APK that installs over this one. An `eas build` signs with EAS's key instead; upload this keystore with `eas credentials` before using one, or Android refuses the update.
- **No Expo Go branch**: the app has custom native modules, so Expo Go can't run it.
- **No iOS**: the app targets Android and web only.
- **Predictive Back stays off** (`android.predictiveBackGestureEnabled: false`, Expo's default): React Native's `ReactActivity` registers an always-enabled `OnBackPressedCallback`, so JavaScript handles every Back and Android never shows the back-to-home preview either way. Turning it on gains nothing visible, changes Back handling for Modals and `usePreventRemove`, and needs a new APK to check. Revisit when React Native or react-native-screens ship predictive Back animations.

## Limits

- **Updates ship only JS and assets.** A new native package, a config plugin change or an SDK upgrade needs a new APK.
- **Updates apply on the second launch.** The defaults (`checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0`) keep launch fast.
- **Sentry source maps** are not uploaded for updates yet; see `docs/sentry.md`.
