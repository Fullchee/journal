package expo.modules.journalandroid

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings

private const val SOUND_PREFS = "alarm_sound"
private const val SOUND_KEY = "uri"

// notify-kit created the first alarm channel under the app's `CHANNEL.alarm` id, with the bundled beep.
private const val LEGACY_ALARM_CHANNEL = "alarms"

/** Android fixes a channel's sound once created, so each sound gets its own channel id. */
fun alarmChannelId(soundUri: String) = "$LEGACY_ALARM_CHANNEL-${Integer.toHexString(soundUri.hashCode())}"

/** The one sound every `alarm` kind Habit rings with on this phone; the owner picks it, so it never syncs. */
object AlarmSound {
  private fun prefs(context: Context) = context.getSharedPreferences(SOUND_PREFS, Context.MODE_PRIVATE)

  // The phone's alarm sound by default, the same one its clock app rings; the bundled beep only when the phone has none.
  fun uri(context: Context): Uri {
    prefs(context).getString(SOUND_KEY, null)?.let { return Uri.parse(it) }

    if (RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM) != null)
      return Settings.System.DEFAULT_ALARM_ALERT_URI

    return Uri.parse("android.resource://${context.packageName}/raw/alarm")
  }

  fun save(context: Context, uri: Uri) {
    prefs(context).edit().putString(SOUND_KEY, uri.toString()).apply()
  }

  fun title(context: Context): String =
    runCatching { RingtoneManager.getRingtone(context, uri(context))?.getTitle(context) }.getOrNull() ?: "Alarm"

  /** Creates the channel for the picked sound, deletes the ones for earlier sounds and returns its id. */
  fun createChannel(context: Context): String {
    val sound = uri(context)
    val id = alarmChannelId(sound.toString())

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return id

    val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    notifications.notificationChannels
      .filter { it.id != id && (it.id == LEGACY_ALARM_CHANNEL || it.id.startsWith("$LEGACY_ALARM_CHANNEL-")) }
      .forEach { notifications.deleteNotificationChannel(it.id) }

    notifications.createNotificationChannel(
      NotificationChannel(id, "Alarms", NotificationManager.IMPORTANCE_HIGH).apply {
        // The alarm usage plays at alarm volume, so a muted ringer or quiet notifications can't silence it.
        setSound(
          sound,
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        enableVibration(true)
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
      },
    )

    return id
  }
}
