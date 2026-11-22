import type { AndroidManifest } from "expo/config-plugins";

// eslint-disable-next-line no-restricted-imports -- modules/ sits outside src, so no @/ alias reaches it
import {
  ALARM_ACTIVITY,
  addAlarmActivity,
  addHabitsWidgetConfig,
  addTimedHabitTile,
  addWidgets,
  HABITS_WIDGET_CONFIG,
  TIMED_HABIT_TILE,
} from "../../modules/journal-android/app.plugin";

const emptyManifest = (): AndroidManifest => ({
  manifest: {
    $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
    queries: [],
    application: [{ $: { "android:name": ".MainApplication" }, activity: [] }],
  },
});

const alarmActivities = (manifest: AndroidManifest) =>
  manifest.manifest.application?.[0]?.activity?.filter(
    (activity) => activity.$["android:name"] === ALARM_ACTIVITY,
  );

describe("addAlarmActivity", () => {
  it("declares the ring screen to show over the lock screen", () => {
    const [activity] = alarmActivities(addAlarmActivity(emptyManifest())) ?? [];

    expect(activity?.$).toMatchObject({
      "android:showWhenLocked": "true",
      "android:turnScreenOn": "true",
      "android:exported": "false",
    });
  });

  it("asks for exact alarms, full-screen intents, notifications and boot", () => {
    const permissions = addAlarmActivity(emptyManifest()).manifest["uses-permission"]?.map(
      (permission) => permission.$["android:name"],
    );

    expect(permissions).toEqual([
      "android.permission.USE_EXACT_ALARM",
      "android.permission.USE_FULL_SCREEN_INTENT",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.RECEIVE_BOOT_COMPLETED",
    ]);
  });

  it("declares the activity once when prebuild runs again", () => {
    const manifest = addAlarmActivity(addAlarmActivity(emptyManifest()));

    expect(alarmActivities(manifest)).toHaveLength(1);
  });
});

const configActivities = (manifest: AndroidManifest) =>
  manifest.manifest.application?.[0]?.activity?.filter(
    (activity) => activity.$["android:name"] === HABITS_WIDGET_CONFIG,
  );

describe("addHabitsWidgetConfig", () => {
  it("lets the launcher open the Habits widget's filter when the widget is placed", () => {
    const [activity] = configActivities(addHabitsWidgetConfig(emptyManifest())) ?? [];

    expect(activity).toMatchObject({
      $: { "android:exported": "true", "android:theme": "@style/HabitsWidgetConfig" },
      "intent-filter": [
        {
          action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_CONFIGURE" } }],
        },
      ],
    });
  });

  it("declares the filter screen once when prebuild runs again", () => {
    const manifest = addHabitsWidgetConfig(addHabitsWidgetConfig(emptyManifest()));

    expect(configActivities(manifest)).toHaveLength(1);
  });
});

const receivers = (manifest: AndroidManifest) => manifest.manifest.application?.[0]?.receiver ?? [];

const widget = (name: string, label: string, info: string) => ({
  $: { "android:name": `expo.modules.journalandroid.${name}`, "android:label": label },
  "meta-data": [{ $: { "android:name": "android.appwidget.provider", "android:resource": info } }],
});

describe("addWidgets", () => {
  it("declares the four widgets, each with its picker name and provider info", () => {
    const manifest = addWidgets(emptyManifest());

    expect(receivers(manifest)).toMatchObject([
      widget("CheckInWidget", "Check-in", "@xml/check_in_widget_info"),
      widget("AlarmsWidget", "Next alarms", "@xml/alarms_widget_info"),
      widget("LogWidget", "Log", "@xml/log_widget_info"),
      widget("HabitsWidget", "Habits today", "@xml/habits_widget_info"),
    ]);
  });

  it("redraws the Habits widget when the app pushes new Habits", () => {
    const habits = receivers(addWidgets(emptyManifest())).find(
      (receiver) => receiver.$["android:name"] === "expo.modules.journalandroid.HabitsWidget",
    );

    expect(
      habits?.["intent-filter"]?.[0]?.action?.map((action) => action.$["android:name"]),
    ).toEqual([
      "android.appwidget.action.APPWIDGET_UPDATE",
      "expo.modules.journalandroid.HABITS_CHANGED",
    ]);
  });

  it("redraws the alarms widget when the app saves new alarms", () => {
    const alarms = receivers(addWidgets(emptyManifest())).find(
      (receiver) => receiver.$["android:name"] === "expo.modules.journalandroid.AlarmsWidget",
    );

    expect(
      alarms?.["intent-filter"]?.[0]?.action?.map((action) => action.$["android:name"]),
    ).toEqual([
      "android.appwidget.action.APPWIDGET_UPDATE",
      "expo.modules.journalandroid.ALARMS_CHANGED",
    ]);
  });

  it("declares each widget once when prebuild runs again", () => {
    const rebuilt = addWidgets(addWidgets(emptyManifest()));

    expect(receivers(rebuilt)).toHaveLength(4);
  });
});

const tiles = (manifest: AndroidManifest) =>
  manifest.manifest.application?.[0]?.service?.filter(
    (service) => service.$["android:name"] === TIMED_HABIT_TILE,
  );

describe("addTimedHabitTile", () => {
  it("lets only the system bind the Quick Settings tile", () => {
    const [tile] = tiles(addTimedHabitTile(emptyManifest())) ?? [];

    expect(tile).toMatchObject({
      $: {
        "android:exported": "true",
        "android:permission": "android.permission.BIND_QUICK_SETTINGS_TILE",
      },
      "intent-filter": [
        { action: [{ $: { "android:name": "android.service.quicksettings.action.QS_TILE" } }] },
      ],
    });
  });

  it("declares the tile once when prebuild runs again", () => {
    const rebuilt = addTimedHabitTile(addTimedHabitTile(emptyManifest()));

    expect(tiles(rebuilt)).toHaveLength(1);
  });
});
