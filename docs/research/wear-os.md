# The journal on a Wear OS watch (TicWatch Pro 5 Enduro)

Sources checked 2026-11-12 against Expo SDK 58 (React Native 0.88.1), the Android developer Wear OS docs, and Mobvoi's spec page.

## Answer

- **Neither React Native nor Expo supports Wear OS.** React Native's platform list has no watch target ([out-of-tree platforms](https://reactnative.dev/docs/out-of-tree-platforms)). Expo's docs never mention Wear OS.
- **Start with phone notifications, no watch code.** Wear OS bridges phone notifications to the watch, with their actions ([notifications](https://developer.android.com/training/wearables/notifications)). Today no Habit alarm reaches the watch: each one is `ongoing`, and Wear OS never bridges ongoing notifications ([bridging](https://developer.android.com/training/wearables/notifications/bridger)).
- **If a watch surface earns its keep, build it in Kotlin.** Use a Tile plus a small Compose for Wear OS app in a `:wear` Gradle module, talking to the phone via the Data Layer. Google recommends Compose for Wear OS UIs ([Compose for Wear OS](https://developer.android.com/training/wearables/compose)).
- **Same package, same key.** The Data Layer only connects apps with the same package name and signature ([Data Layer overview](https://developer.android.com/training/wearables/data/overview)). Use `dev.fullchee.journal` and the keystore that signs the phone APK.
- **The watch runs Wear OS 4 (API 33) at best.** Mobvoi shipped Wear OS 3.5 ([spec page](https://www.mobvoi.com/us/pages/ticwatchpro5enduro)); press reports a Wear OS 4 update in September 2024. That allows Watch Face Format 1 but not 2+ ([WFF](https://developer.android.com/training/wearables/wff)).

## Options compared

| Approach                               | Watch code             | What the owner gets                                             | Cost              | Verdict                      |
| -------------------------------------- | ---------------------- | --------------------------------------------------------------- | ----------------- | ---------------------------- |
| **(d) Bridged phone notifications**    | None                   | Habit reminders on the wrist, with Done and voice-reply actions | ~1 day            | **Do first**                 |
| **(c) Tile (and complication) only**   | Kotlin, `:wear` module | One-swipe Check-in zones or today's Habits; tap sends a log     | ~1 week           | **Next, if (d) falls short** |
| **(b) Compose watch app + Data Layer** | Kotlin, `:wear` module | (c) plus screens for Habits due today and a voice Log box       | 1–2 weeks         | Grow (c) into this           |
| **(a) Full RN app on the watch**       | JS, second RN app      | The phone UI squeezed onto a 1.43" round screen                 | Weeks, open-ended | **No**                       |

## 1. React Native and Expo on Wear OS

- **No official support.** React Native lists macOS, Windows, visionOS, OpenHarmony, tvOS, Web and Skia; no watch ([out-of-tree platforms](https://reactnative.dev/docs/out-of-tree-platforms)). A search of `expo/expo` issues finds one Wear OS bug report (an `expo-location` error, closed), and no Expo statement ([#27098](https://github.com/expo/expo/issues/27098)).
- **The main community library says so too.** `react-native-wear-connectivity` states: "React Native does not officially support WearOS, some essential components like CircularScrollView are not available" ([README](https://github.com/fabOnReact/react-native-wear-connectivity)). Its circular-scroll issue is closed with every task unticked ([#12](https://github.com/fabOnReact/react-native-wear-connectivity/issues/12)).
- **A full RN app can run, since Wear OS is Android.** But Google's guidance assumes Compose for Wear OS ([Compose for Wear OS](https://developer.android.com/training/wearables/compose)). Play rejects apps that render badly on round screens ([packaging](https://developer.android.com/training/wearables/packaging)).
- **Round screens and the crown need Wear widgets.** Wear Compose has its own `material3`, `foundation` and `navigation`; React Native has no equivalent ([Compose for Wear OS](https://developer.android.com/training/wearables/compose)).

**Community projects:**

| Package                                                                                                    | Latest             | Status                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| [`react-native-wear-connectivity`](https://github.com/fabOnReact/react-native-wear-connectivity)           | 0.1.17, 2025-10-24 | README targets React Native 0.82; last push 2025-11-06; not an Expo module |
| [`@d4l/react-native-wear-connectivity`](https://www.npmjs.com/package/@d4l/react-native-wear-connectivity) | 0.3.1, 2025-04-01  | Fork; stale                                                                |
| [`expo-wearable-messaging`](https://github.com/LimitedDani/expo-wearable-messaging)                        | 1.0.2, 2026-05-13  | Expo module over the Message API; 0 stars, one author, fixed message paths |
| [`react-native-wear`](https://www.npmjs.com/package/react-native-wear)                                     | 1.1.0, 2024-03-06  | Abandoned                                                                  |

**None is worth a dependency.** The phone side is about 50 lines of Kotlin in the existing `modules/journal-android`.

## 2. Approaches

### (d) Bridged notifications: free, with limits

- **Bridging is on by default** for any phone app without a watch app ([notifications](https://developer.android.com/training/wearables/notifications)).
- **Actions show on the watch.** A reply action can take voice input or preset `setChoices()` replies ([notifications](https://developer.android.com/training/wearables/notifications)). notify-kit 10.10 exposes this as `actions[].input` with `choices` (`src/types/NotificationAndroid.ts`).
- **Not bridged**: ongoing, non-clearable and local-only notifications ([bridging](https://developer.android.com/training/wearables/notifications/bridger)). `src/core/alarms.ts` sets `ongoing: true` on every Habit alarm.
- **No full-screen intent on Wear OS** ([notifications](https://developer.android.com/training/wearables/notifications)). The ringing `AlarmActivity` stays a phone feature.
- **Custom layouts drop to text and icons** on the watch ([notifications](https://developer.android.com/training/wearables/notifications)).
- **Action handling runs on the phone.** The notify-kit background event handler already sees each press, so a Done action can log the Habit with no new native code.

### (c) Tiles and complications

- **Tiles are glanceable cards** in the carousel beside the watch face. They're built with the `tiles` and `protolayout` libraries, not Compose ([Tiles](https://developer.android.com/training/wearables/tiles)).
- **A Tile needs a watch APK.** It's a `TileService` declared in the watch app's manifest with `BIND_TILE_PROVIDER` ([get started](https://developer.android.com/training/wearables/tiles/get_started)).
- **Keep tile work short.** Google says not to fetch often in the tile service; use WorkManager and cache ([Tiles](https://developer.android.com/training/wearables/tiles)).
- **Fit for this app**: five zone buttons (Storm to Sun) for a one-tap Check-in, or the next due Habit with a Done button.

### (b) Compose watch app plus the Data Layer

- **`MessageClient`** sends one-off messages, such as "log Check-in Storm". **`DataClient`** syncs small `DataItem`s, such as today's Habits ([Data Layer](https://developer.android.com/training/wearables/data/data-layer)).
- **Both sides must share package name and signature** ([overview](https://developer.android.com/training/wearables/data/overview)).
- **Data may cross Google's servers.** When Bluetooth is down, it routes through Google Cloud, end-to-end encrypted ([overview](https://developer.android.com/training/wearables/data/overview)). Send zone names and Habit ids, not note text.
- **Google prefers your own backend for saving data**, such as notes, and the Data Layer for phone–watch tasks like passing a token ([overview](https://developer.android.com/training/wearables/data/overview)). Here the phone already owns the Cloudflare Access login, so relaying through the phone avoids a second login on the watch.
- **Phone side**: add a `WearableListenerService` to `modules/journal-android`. It forwards each message to JS, which saves it through the app's normal API write.

### Standalone rules and Play requirements

- **Manifest**: `<uses-feature android:name="android.hardware.type.watch" />`, never with `required="false"` ([packaging](https://developer.android.com/training/wearables/packaging)).
- **Standalone flag**: set `com.google.android.wearable.standalone` to `false`, since the watch app needs the phone app ([standalone apps](https://developer.android.com/training/wearables/apps/standalone-apps)).
- **Play** wants the same package name, a unique version code per form factor, and a target of API 35 for Wear OS since 2026-08-31 ([packaging](https://developer.android.com/training/wearables/packaging), [target SDK](https://developer.android.com/google/play/requirements/target-sdk)). None of this binds a sideloaded APK.
- **minSdk**: Compose for Wear OS runs on Wear OS 3.0 (API 30) and up ([Compose for Wear OS](https://developer.android.com/training/wearables/compose)). Use `minSdk 30`.

## 3. Adding a `:wear` module to this CNG project

`android` is generated and git-ignored, so the module lives outside it.

1. **Source**: put the Kotlin project in `wear/` (`build.gradle`, `src/main/AndroidManifest.xml`, `TileService`, Compose activity).
2. **Config plugin**: use `withSettingsGradle` to append `include ':wear'` and `project(':wear').projectDir = new File(rootDir, '../wear')` ([mods](https://docs.expo.dev/config-plugins/mods/)). Add the Wear and Play services dependencies only in `wear/build.gradle`.
3. **Package and signing**: set `applicationId "dev.fullchee.journal"`. Point its signing config at `android/app/debug.keystore`, which signs today's release APK too (`signingConfig signingConfigs.debug` in the generated `app/build.gradle`).
4. **Build locally**: `scripts/build-apk.sh` runs `assembleRelease` from `android/`, which builds every included module. The watch APK lands in `wear/build/outputs/apk/release/`.
5. **EAS Build (optional)**: `gradleCommand` overrides the task, and `buildArtifactPaths` takes several globs ([eas.json](https://docs.expo.dev/eas/json/)). So `:app:assembleRelease :wear:assembleRelease` plus a wear-APK glob should work. Not verified: whether EAS's injected signing reaches the `:wear` module.
6. **Sideload over Wi-Fi** ([debug over Wi-Fi](https://developer.android.com/training/wearables/get-started/debug-wifi)):
   1. On the watch, turn on Developer options, then ADB debugging and Wireless debugging.
   2. Pick **Pair new device**; run `adb pair <ip>:<pairing-port>` and enter the code.
   3. Run `adb connect <ip>:<connection-port>`; the connection port differs from the pairing port.
   4. Run `adb -s <ip>:<port> install -r <wear-apk>`.
   - Bluetooth debugging no longer works since Wear OS 3 ([debugging](https://developer.android.com/training/wearables/get-started/debugging)).
7. **OTA**: EAS Update ships JS to the phone only. Every watch change needs a new watch APK by `adb`.

## 4. TicWatch Pro 5 Enduro

| Spec          | Value                                                                   | Source                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OS shipped    | Wear OS 3.5                                                             | [Mobvoi](https://www.mobvoi.com/us/pages/ticwatchpro5enduro)                                                                                                |
| OS now        | Wear OS 4, from September 2024                                          | Press only ([Android Central](https://www.androidcentral.com/wearables/mobvoi-wear-os-4-update-ticwatch-pro-5-series)); check **Settings > System > About** |
| Chipset       | Snapdragon W5+ Gen 1                                                    | [Mobvoi](https://www.mobvoi.com/us/pages/ticwatchpro5enduro)                                                                                                |
| RAM / storage | 2 GB / 32 GB                                                            | [Mobvoi](https://www.mobvoi.com/us/pages/ticwatchpro5enduro)                                                                                                |
| Display       | 1.43" round, 466×466, 326 ppi OLED plus an ultra-low-power second layer | [Mobvoi](https://www.mobvoi.com/us/pages/ticwatchpro5enduro)                                                                                                |
| Input         | Touch plus a rotating crown                                             | [Mobvoi](https://www.mobvoi.com/us/pages/ticwatchpro5enduro)                                                                                                |
| Battery       | 628 mAh; up to 90 h in Smart mode                                       | [Mobvoi](https://www.mobvoi.com/us/pages/ticwatchpro5enduro)                                                                                                |

**What the version decides:**

- **API level**: Wear OS 3 is API 30 ([Compose for Wear OS](https://developer.android.com/training/wearables/compose)); Wear OS 4 is API 33 and Wear OS 5 is API 34 ([WFF table](https://developer.android.com/training/wearables/wff)).
- **Watch faces**: WFF 1 needs Wear OS 4; WFF 2 (weather) needs Wear OS 5 ([WFF](https://developer.android.com/training/wearables/wff)). Since January 2026, every Wear OS device installs only WFF watch faces.
- **Health Services**: Wear OS 4 improves background body-sensor permissions ([Wear OS 4](https://developer.android.com/training/wearables/versions/4)).
- **Tiles and Compose**: both run from Wear OS 3, so the watch's version doesn't limit this plan.
- **The crown** sends rotary input; Wear Compose lists handle it, React Native doesn't.

## 5. Recommendation

1. **Slice 1, notifications (~1 day, no watch code).** Add a **Done** action to Habit reminders, and a **Log** action with voice input that feeds the Log box. Handle both in the notify-kit background handler. Then decide which reminders may bridge: an `ongoing` alarm never reaches the watch. A Connection reminder or a non-ringing Habit reminder can drop `ongoing`.
2. **Slice 2, a Check-in Tile (~1 week first time).** Add the `wear` module and plugin, a `TileService` with five zone buttons, and a `MessageClient` send. On the phone, add a `WearableListenerService` to `modules/journal-android` that saves the Check-in through the existing write path. Sideload with `adb`.
3. **Later, only if used**: a Compose screen of today's Habits, fed by `DataClient`.

Skip approach (a). It costs the most, fights the round screen and crown, and nothing on the roadmap needs it.

## Not verified from a primary source

- **Current OS on the Enduro**: Wear OS 4 comes from press coverage citing a Mobvoi blog post I couldn't reach. No source shows Wear OS 5 for this watch.
- **RN performance, Hermes and APK size on a watch**: no maintainer or Google source measures them.
- **EAS signing of a second module**: the `eas.json` docs allow the command and artifacts, not the signing.

## Sources

- Android: [Wear OS notifications](https://developer.android.com/training/wearables/notifications), [bridging](https://developer.android.com/training/wearables/notifications/bridger), [Data Layer overview](https://developer.android.com/training/wearables/data/overview), [Data Layer sync](https://developer.android.com/training/wearables/data/data-layer), [standalone apps](https://developer.android.com/training/wearables/apps/standalone-apps), [packaging](https://developer.android.com/training/wearables/packaging), [target SDK](https://developer.android.com/google/play/requirements/target-sdk), [Tiles](https://developer.android.com/training/wearables/tiles), [Tiles get started](https://developer.android.com/training/wearables/tiles/get_started), [Compose for Wear OS](https://developer.android.com/training/wearables/compose), [Watch Face Format](https://developer.android.com/training/wearables/wff), [Wear OS 4](https://developer.android.com/training/wearables/versions/4), [debugging](https://developer.android.com/training/wearables/get-started/debugging), [debug over Wi-Fi](https://developer.android.com/training/wearables/get-started/debug-wifi).
- Expo: [config plugin mods](https://docs.expo.dev/config-plugins/mods/), [eas.json reference](https://docs.expo.dev/eas/json/).
- React Native: [out-of-tree platforms](https://reactnative.dev/docs/out-of-tree-platforms).
- Mobvoi: [TicWatch Pro 5 Enduro](https://www.mobvoi.com/us/pages/ticwatchpro5enduro).
- npm registry and GitHub API for the community packages (versions and dates above); `react-native-notify-kit` 10.10.0 in `node_modules`.
- This repo: `src/core/alarms.ts`, `src/lib/alarms/use-alarm-schedule.android.ts`, `scripts/build-apk.sh`, generated `android/app/build.gradle`.
