import "expo-router/entry";

import { registerAlarmActions } from "@/lib/alarms/alarm-actions";

// Android starts a notification button's headless task from this bundle without rendering a route.
registerAlarmActions();
