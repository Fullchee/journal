package expo.modules.journalandroid

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings

// Screen time (#32): the screen's on and off events, read from usage stats, which need the Usage access special
// permission. src/core/screen-time.ts turns them into minutes per Day.
object ScreenTime {
  fun hasUsageAccess(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }

    return mode == AppOpsManager.MODE_ALLOWED
  }

  /** Opens this app's Usage access switch; a phone without that page gets the full Usage access list. */
  fun openUsageAccessSettings(context: Context) {
    val list = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    try {
      context.startActivity(Intent(list).setData(Uri.parse("package:${context.packageName}")))
    } catch (e: ActivityNotFoundException) {
      context.startActivity(list)
    }
  }

  /** Screen on and off events from `fromMs` to `toMs`, oldest first; the event types exist from Android 9. */
  fun events(context: Context, fromMs: Long, toMs: Long): List<Map<String, Any>> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return emptyList()
    val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val events = manager.queryEvents(fromMs, toMs)
    val event = UsageEvents.Event()
    val screen = mutableListOf<Map<String, Any>>()

    while (events.getNextEvent(event)) {
      when (event.eventType) {
        UsageEvents.Event.SCREEN_INTERACTIVE -> screen.add(screenEvent(event.timeStamp, true))
        UsageEvents.Event.SCREEN_NON_INTERACTIVE -> screen.add(screenEvent(event.timeStamp, false))
      }
    }

    return screen
  }

  // JS reads a Long as a Double, which holds a millisecond timestamp exactly.
  private fun screenEvent(at: Long, on: Boolean) = mapOf("at" to at.toDouble(), "on" to on)

  /** The name the owner gave the phone in Settings, or its model when it has none. */
  fun deviceName(context: Context): String =
    Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME) ?: Build.MODEL
}
