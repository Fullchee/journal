# Alarms, a ringing alarm and widgets in Expo on Android

Research for [#5](https://github.com/Fullchee/journal-native/issues/5), part of the map [#1](https://github.com/Fullchee/journal-native/issues/1). Sources checked 2026-11-07 against Expo SDK 57 (React Native 0.86).

## Answer

- **Schedule and ring with `react-native-notify-kit`**, the maintained Notifee fork. It is the only maintained library that has full-screen intents, looping sound and `setAlarmClock` together.
- **Keep the widgets in Kotlin**, ported from `journal`'s Java into one local Expo module (`modules/journal-android`). Its manifest and a small config plugin register the three receivers.
- **Widgets open the app with deep links** (`journal:///?zone=Storm`, `journal:///habits?edit=<id>`, `journal:///?log`). Expo Router routes them with no `MainActivity` code.
- **Build with a development build** (`expo-dev-client`, EAS `development` profile). Expo Go can't load notify-kit or a local module.
- **Skip `react-native-android-widget` and `expo-widgets`** for now. The first renders JSX to a bitmap through headless JS; the second is iOS-first with Android opt-in.

## Options compared

| Need                   | `expo-notifications` 57                            | `react-native-notify-kit` 10.10                                      | Notifee 9.1.8       |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------------------- | ------------------- |
| Status                 | Expo SDK package, 57.0.25 on 2026-11-05            | Maintained, 10.10.0 on 2026-10-28                                    | Archived 2026-04-07 |
| Repeats wake from Doze | Yes, every re-arm uses `setExactAndAllowWhileIdle` | Yes, `AlarmType.SET_ALARM_CLOCK` or `SET_EXACT_AND_ALLOW_WHILE_IDLE` | Same as fork        |
| Daily / weekly repeat  | `daily`, `weekly` triggers                         | `repeatFrequency` `DAILY`, `WEEKLY`                                  | Same                |
| Ongoing (no swipe)     | `sticky: true` sets `setOngoing`                   | `ongoing: true`                                                      | Same                |
| Ring until dismissed   | No                                                 | `loopSound: true`                                                    | Yes, but archived   |
| Full-screen intent     | No                                                 | `fullScreenAction`                                                   | Yes, but archived   |
| Reboot                 | Reschedules on boot                                | Reschedules on boot, plus a cold-start recovery                      | Known bugs          |
| Expo                   | Config plugin                                      | Config plugin, CNG dev builds, New Architecture only                 | Not maintained      |

**Why not split the work:** `expo-notifications` covers the quiet Connection reminders. The ringing alarm still needs notify-kit, and two libraries would each own channels and pending ids. One library keeps one reschedule.

## 1. Exact alarms that survive Doze

- **`expo-notifications` fixes the bug the Capacitor patch fixed.** `ExpoSchedulingDelegate.setupAlarm` calls `setExactAndAllowWhileIdle` with `RTC_WAKEUP` for every trigger. After a notification fires, `triggerNotification` schedules the next one through the same path. It falls back to `setAndAllowWhileIdle` without exact-alarm permission. (`ExpoSchedulingDelegate.kt` in the 57.0.25 npm tarball)
- **notify-kit picks the alarm call per trigger.** `TimestampTrigger.alarmManager.type` takes `SET`, `SET_AND_ALLOW_WHILE_IDLE`, `SET_EXACT`, `SET_EXACT_AND_ALLOW_WHILE_IDLE` or `SET_ALARM_CLOCK` (`src/types/Trigger.ts`). A repeat re-arms with the same type (`NotifeeAlarmManager.scheduleTimestampTriggerNotification`).
- **Use `SET_ALARM_CLOCK` for Habit alarms.** Doze leaves idle shortly before an alarm-clock alarm fires ([Doze](https://developer.android.com/training/monitoring-device-state/doze-standby)). Use `SET_EXACT_AND_ALLOW_WHILE_IDLE` for Connection reminders.
- **The fork defaults to AlarmManager**; upstream Notifee defaulted to WorkManager ([fork docs](https://docs.page/marcocrupi/react-native-notify-kit/react-native/overview)).
- **Declare `USE_EXACT_ALARM`** in `app.json` `android.permissions`. Android grants it at install, with no settings prompt ([Android 14 exact alarms](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms)). notify-kit's manifest already adds `SCHEDULE_EXACT_ALARM`, which Android 12 needs.
- **Play policy limits `USE_EXACT_ALARM` to alarm and calendar apps.** It doesn't apply: the APK ships through EAS, not Play.
- **Revoking the setting cancels the alarms.** Keep ADR 0010's rule: every launch and every Habit save reschedules from the Habits.
- **Reboot**: both libraries hold `RECEIVE_BOOT_COMPLETED` and re-arm stored triggers. notify-kit also re-arms on a cold start, for phones that drop `BOOT_COMPLETED`.

## 2. A ringing alarm

ADR 0010 says the Capacitor alarm "plays its sound once" and needs Kotlin to ring until dismissed. notify-kit covers it without new Kotlin:

1. **Channel**: `importance: HIGH`, the alarm sound, `bypassDnd` if wanted. Android fixes sound and importance at creation, so a change needs a new channel id (as today).
2. **Notification**: `category: ALARM`, `ongoing: true`, `loopSound: true` (sets `FLAG_INSISTENT`, so the sound repeats until the notification is cancelled).
3. **Full screen**: `fullScreenAction: { id: 'ring', launchActivity: 'default' }` plus a Dismiss `actions` button.
4. **Permission**: add `USE_FULL_SCREEN_INTENT` to `android.permissions`. The type docs say it is required, and the config plugin doesn't add it.

**Full-screen rules** ([AOSP FSI limits](https://source.android.com/docs/core/permissions/fsi-limits), [time-sensitive notifications](https://developer.android.com/develop/ui/views/notifications/time-sensitive)):

- **Android 14+ grants FSI only to calling and alarm apps.** Play revokes it at install for others; a sideloaded APK isn't revoked by Play.
- **Check it with `NotificationManager#canUseFullScreenIntent()`.** If false, open `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`. Call this on launch beside the exact-alarm check.
- **An unlocked, in-use phone shows a heads-up notification instead.** The full screen appears only when the phone is locked or the screen is off.

**Open choice for the prototype ticket: which screen shows over the lock screen.**

- **`launchActivity: 'default'`** opens `MainActivity`. It needs `showWhenLocked` and `turnScreenOn` on `MainActivity` via a config plugin. Downside: the whole journal opens over the lock screen.
- **A small native `AlarmActivity`** in the local module shows only the Habit name and Dismiss. notify-kit's `launchActivity` takes any activity class name. Recommended, since the journal holds private notes.

## 3. Home-screen widgets

| Option                                             | How it renders                            | Fit for the three widgets                                                                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local Expo module, ported Kotlin** (recommended) | Native `RemoteViews`, the current layouts | Same look and behaviour. Taps need no JS. `AlarmsWidget` keeps its own redraw alarm.                                                                                                              |
| `react-native-android-widget` 0.26.0 (2026-10-29)  | JSX turned into a bitmap image            | Starts headless JS to draw or handle a tap. Launchers can misreport size, so the image may be scaled ([limitations](https://saleksovski.github.io/react-native-android-widget/docs/limitations)). |
| `expo-widgets` 57.0.28                             | Jetpack Glance on Android                 | The SDK 57 docs list iOS only. Android sits behind `enableAndroid: false` by default in the plugin. Too early.                                                                                    |

**`react-native-android-widget` works if JSX widgets matter more than native fidelity.** It has an Expo config plugin, `updatePeriodMillis`, and `OPEN_URI` click actions that take a deep link ([clicks](https://saleksovski.github.io/react-native-android-widget/docs/handling-clicks)). Custom clicks go to a JS task handler.

**How the local module works** ([Expo Modules: get started](https://docs.expo.dev/modules/get-started/), [config plugin tutorial](https://docs.expo.dev/modules/config-plugin-and-native-module-tutorial/)):

1. Run `npx create-expo-module@latest --local`. It creates `modules/<name>/` with `android/`, `src/` and `expo-module.config.json`. Autolinking picks it up.
2. Move `CheckInWidget`, `AlarmsWidget` and `LogWidget` into `modules/<name>/android/`, with their layouts and `xml/*_widget_info.xml`.
3. Declare the three `<receiver>`s in the module's own `AndroidManifest.xml`. Gradle merges library manifests, so `prebuild` keeps them.
4. Replace `AlarmsWidgetPlugin` with a module `Function("saveAlarms")` that writes SharedPreferences and redraws. The JS calls it after each reschedule, as `alarm-device.ts` does now.
5. Add a config plugin (`withAndroidManifest`) only for app-level changes: `MainActivity` flags or an `AlarmActivity`.

## 4. Deep links from widgets into Expo Router

- **Set `scheme: "journal"` in `app.json`.** Expo adds the intent filter at prebuild.
- **Widget taps send `ACTION_VIEW` with a URI** and `setPackage(context.getPackageName())`. This replaces the three custom actions and `MainActivity.onNewIntent`.
- **Expo Router maps the URI to a route.** `journal:///?zone=Storm` opens `/` with `zone`; `journal:///habits?edit=<id>` opens `/habits` with `edit`. Screens read them with `useLocalSearchParams`.
- **Keep one request code per zone button**, or Android hands every button the last zone's intent (same as today).
- **Use `+native-intent.tsx` only to rewrite old or odd URLs.** It runs outside the app, has no app state and doesn't run on web ([native intent](https://docs.expo.dev/router/advanced/native-intent/)).
- **The zone names still must match `ZONES`** in the copied `check-in-view.ts`.

## 5. Builds

- **Expo Go can't run any of this.** notify-kit says "Expo Go is not supported", and local modules need a native build.
- **Development**: `expo-dev-client` plus an EAS `development` profile APK, or `npx expo run:android` locally. Rebuild after any native or `app.json` plugin change; JS changes reload live.
- **Release**: the EAS Build APK the map already chose. EAS Update ships JS only, so new permissions or Kotlin need a new APK.

## Risks to check in the prototype

- **Pending alarm count**: a weekday Habit takes one alarm per day. AlarmManager caps alarms per app (not verified here); count before scheduling.
- **Lock-screen privacy**: decide `MainActivity` versus `AlarmActivity` before building the ring screen.
- **New Architecture only**: notify-kit has no old-bridge fallback. SDK 57 uses the New Architecture, so this is fine.
- **notify-kit validation**: its docs name React Native 0.85.3 as the development target. Confirm a build on 0.86.

## Sources

- [`expo-notifications` SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) and the 57.0.25 npm tarball (`ExpoSchedulingDelegate.kt`, `NotificationTriggers.kt`, `ExpoNotificationBuilder.kt`, `AndroidManifest.xml`).
- [invertase/notifee](https://github.com/invertase/notifee): archived 2026-04-07.
- [react-native-notify-kit](https://github.com/marcocrupi/react-native-notify-kit) README and the 10.10.0 npm tarball (`src/types/Trigger.ts`, `src/types/NotificationAndroid.ts`, `NotifeeAlarmManager.java`).
- [react-native-android-widget docs](https://saleksovski.github.io/react-native-android-widget/) and the 0.26.0 npm tarball (`config-plugin.type.ts`).
- [`expo-widgets` SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/sdk/widgets/) and the 57.0.28 tarball (`plugin/build/withWidgets.js`, `CHANGELOG.md`).
- [Android 14 exact alarms](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms), [FSI limits](https://source.android.com/docs/core/permissions/fsi-limits), [time-sensitive notifications](https://developer.android.com/develop/ui/views/notifications/time-sensitive).
- [Expo Modules: get started](https://docs.expo.dev/modules/get-started/), [config plugin tutorial](https://docs.expo.dev/modules/config-plugin-and-native-module-tutorial/), [Expo Router native intent](https://docs.expo.dev/router/advanced/native-intent/).
- `journal`: [ADR 0010](https://github.com/Fullchee/journal/blob/main/docs/adr/0010-android-shell-for-alarms.md), `android/app/src/main/java/dev/fullchee/dashboard/*.java`, `src/lib/alarm-device.ts`, `patches/@capacitor__local-notifications.patch`.
