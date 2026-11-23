import "expo-router/entry";

import { registerAlarmActions } from "@/lib/alarms/alarm-actions";
import { defineScreenTimeTask } from "@/lib/screen-time/screen-time";

// Android starts a notification button's headless task, and the daily screen time job, from this bundle without
// rendering a route.
registerAlarmActions();

defineScreenTimeTask();
