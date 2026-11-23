// Declares AlarmActivity, the Habits widget's filter screen, the permissions Habit alarms and screen time need, the home-screen widgets and the Quick Settings tile, so
// `android/` stays generated.
import {
  AndroidConfig,
  type AndroidManifest,
  type ConfigPlugin,
  withAndroidManifest,
} from "expo/config-plugins";

export const ALARM_ACTIVITY = "expo.modules.journalandroid.AlarmActivity";

const PERMISSIONS = [
  // Alarms are the point of the app, so exact timing is granted at install with no settings prompt.
  "android.permission.USE_EXACT_ALARM",
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.POST_NOTIFICATIONS",
  // notify-kit re-arms every alarm after a reboot.
  "android.permission.RECEIVE_BOOT_COMPLETED",
];

export function addAlarmActivity(manifest: AndroidManifest): AndroidManifest {
  AndroidConfig.Permissions.ensurePermissions(manifest, PERMISSIONS);

  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

  const others = (application.activity ?? []).filter(
    (activity) => activity.$["android:name"] !== ALARM_ACTIVITY,
  );

  application.activity = [
    ...others,
    {
      $: {
        "android:name": ALARM_ACTIVITY,
        "android:exported": "false",
        "android:showWhenLocked": "true",
        "android:turnScreenOn": "true",
        "android:excludeFromRecents": "true",
        // Its own task, so Dismiss returns to whatever was on screen, not into the app.
        "android:taskAffinity": "",
        "android:launchMode": "singleInstance",
        "android:theme": "@android:style/Theme.Material.NoActionBar",
      },
    },
  ];

  return manifest;
}

export const HABITS_WIDGET_CONFIG = "expo.modules.journalandroid.HabitsWidgetConfigActivity";

/** The Habits widget's filter screen; the launcher starts it on placement, so it is exported. */
export function addHabitsWidgetConfig(manifest: AndroidManifest): AndroidManifest {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

  const others = (application.activity ?? []).filter(
    (activity) => activity.$["android:name"] !== HABITS_WIDGET_CONFIG,
  );

  application.activity = [
    ...others,
    {
      $: {
        "android:name": HABITS_WIDGET_CONFIG,
        "android:exported": "true",
        "android:excludeFromRecents": "true",
        // Its own task, so Save returns to the home screen, not into the app.
        "android:taskAffinity": "",
        "android:theme": "@style/HabitsWidgetConfig",
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_CONFIGURE" } }],
        },
      ],
    },
  ];

  return manifest;
}

// Each widget's class, its name in the launcher's widget picker, its `appwidget-provider` xml in the module's res, and any extra action it redraws on.
const WIDGETS = [
  {
    name: "expo.modules.journalandroid.CheckInWidget",
    label: "Check-in",
    info: "@xml/check_in_widget_info",
    actions: [],
  },
  {
    name: "expo.modules.journalandroid.AlarmsWidget",
    label: "Next alarms",
    info: "@xml/alarms_widget_info",
    // JournalAndroidModule.setAlarms sends it, so the list redraws after each reschedule.
    actions: ["expo.modules.journalandroid.ALARMS_CHANGED"],
  },
  {
    name: "expo.modules.journalandroid.LogWidget",
    label: "Log",
    info: "@xml/log_widget_info",
    actions: [],
  },
  {
    name: "expo.modules.journalandroid.HabitsWidget",
    label: "Habits today",
    info: "@xml/habits_widget_info",
    // JournalAndroidModule.setHabits sends it, so the list redraws after each check or save.
    actions: ["expo.modules.journalandroid.HABITS_CHANGED"],
  },
];

export function addWidgets(manifest: AndroidManifest): AndroidManifest {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const names = new Set(WIDGETS.map((widget) => widget.name));

  const others = (application.receiver ?? []).filter(
    (receiver) => !names.has(receiver.$["android:name"]),
  );

  application.receiver = [
    ...others,
    ...WIDGETS.map(({ name, label, info, actions }) => ({
      $: { "android:name": name, "android:label": label, "android:exported": "false" as const },
      "intent-filter": [
        {
          action: ["android.appwidget.action.APPWIDGET_UPDATE", ...actions].map((action) => ({
            $: { "android:name": action },
          })),
        },
      ],
      "meta-data": [
        { $: { "android:name": "android.appwidget.provider", "android:resource": info } },
      ],
    })),
  ];

  return manifest;
}

export const TIMED_HABIT_TILE = "expo.modules.journalandroid.TimedHabitTile";

/** Only the system may bind a tile, so the service is exported behind the bind permission. */
export function addTimedHabitTile(manifest: AndroidManifest): AndroidManifest {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

  const others = (application.service ?? []).filter(
    (service) => service.$["android:name"] !== TIMED_HABIT_TILE,
  );

  // config-plugins' service type has no label, icon or meta-data, so the tile is built apart from it.
  const tile = {
    $: {
      "android:name": TIMED_HABIT_TILE,
      "android:label": "Timed Habit",
      "android:icon": "@drawable/ic_tile_timed_habit",
      "android:exported": "true" as const,
      "android:permission": "android.permission.BIND_QUICK_SETTINGS_TILE",
    },
    "intent-filter": [
      { action: [{ $: { "android:name": "android.service.quicksettings.action.QS_TILE" } }] },
    ],
    "meta-data": [
      // Android 11+ then reads the tile as an on/off switch for accessibility.
      {
        $: {
          "android:name": "android.service.quicksettings.TOGGLEABLE_TILE",
          "android:value": "true",
        },
      },
    ],
  };

  application.service = [...others, tile];

  return manifest;
}

const USAGE_STATS = "android.permission.PACKAGE_USAGE_STATS";

/**
 * Screen time reads usage stats. Android grants it only from the Usage access settings page, never at install, and
 * lint flags it as a system permission, hence `tools:ignore`.
 */
export function addUsageStatsPermission(manifest: AndroidManifest): AndroidManifest {
  manifest.manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";

  const others = (manifest.manifest["uses-permission"] ?? []).filter(
    (permission) => permission.$["android:name"] !== USAGE_STATS,
  );

  // config-plugins' permission type has no tools:ignore, so the permission is built apart from it.
  const permission = { $: { "android:name": USAGE_STATS, "tools:ignore": "ProtectedPermissions" } };

  manifest.manifest["uses-permission"] = [...others, permission];

  return manifest;
}

const withJournalAndroid: ConfigPlugin = (config) =>
  withAndroidManifest(config, (modConfig) => {
    addAlarmActivity(modConfig.modResults);
    addHabitsWidgetConfig(modConfig.modResults);
    addWidgets(modConfig.modResults);
    addTimedHabitTile(modConfig.modResults);
    addUsageStatsPermission(modConfig.modResults);

    return modConfig;
  });

export default withJournalAndroid;
