package expo.modules.journalandroid

import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

// Android 14 grants full-screen intents by default only to apps the Play Store lists as alarm or calling apps,
// so a sideloaded APK rings as a plain notification until the owner allows it.
object FullScreenAlarm {
  fun isAllowed(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
      context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()

  fun openSettings(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return

    val page = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
      .setData(Uri.parse("package:${context.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    try {
      context.startActivity(page)
    } catch (e: ActivityNotFoundException) {
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
          .setData(Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    }
  }

  // Android shows a full-screen intent as a heads-up while the phone is unlocked; with the app on screen it may
  // start activities, so the ring opens its screen there too.
  fun show(context: Context) {
    context.startActivity(Intent(context, AlarmActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }
}
