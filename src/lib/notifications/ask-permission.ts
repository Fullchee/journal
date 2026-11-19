import notifee, { AuthorizationStatus } from "react-native-notify-kit";

/** Asks for notification permission once: Android 13+ reports NOT_DETERMINED until the app first asks. */
export async function askNotificationPermissionOnce() {
  const { authorizationStatus } = await notifee.getNotificationSettings();

  if (authorizationStatus === AuthorizationStatus.NOT_DETERMINED) await notifee.requestPermission();
}
