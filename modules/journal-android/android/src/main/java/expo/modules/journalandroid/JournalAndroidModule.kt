package expo.modules.journalandroid

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.service.quicksettings.TileService
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Where the alarms widget reads the ringing Habits; the names match the Capacitor app's AlarmsWidget.
const val ALARMS_PREFS = "alarms_widget"
const val ALARMS_KEY = "alarms"

// Sent inside the app after each save, so the alarms widget redraws; its receiver listens for this action.
const val ACTION_ALARMS_CHANGED = "expo.modules.journalandroid.ALARMS_CHANGED"

private const val PICK_ALARM_SOUND = 4_201

class JournalAndroidModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  // The picker answers through onActivityResult, so its promise waits here until then.
  private var pendingPick: Promise? = null

  private fun describeSound() = mapOf("title" to AlarmSound.title(context))

  override fun definition() = ModuleDefinition {
    Name("JournalAndroid")

    Function("setAlarms") { json: String ->
      context.getSharedPreferences(ALARMS_PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(ALARMS_KEY, json)
        .apply()
      context.sendBroadcast(Intent(ACTION_ALARMS_CHANGED).setPackage(context.packageName))
    }

    Function("setHabits") { json: String ->
      context.getSharedPreferences(HABITS_PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(HABITS_KEY, json)
        .apply()
      context.sendBroadcast(Intent(ACTION_HABITS_CHANGED).setPackage(context.packageName))
      TileService.requestListeningState(context, ComponentName(context, TimedHabitTile::class.java))
    }

    // JS numbers arrive as Double; a millisecond timestamp fits one exactly.
    Function("clearTileSession") { startedAtMs: Double ->
      clearTileSession(context, startedAtMs.toLong())
      TileService.requestListeningState(context, ComponentName(context, TimedHabitTile::class.java))
    }

    Function("alarmSound") { describeSound() }

    Function("createAlarmChannel") { AlarmSound.createChannel(context) }

    Function("hasUsageAccess") { ScreenTime.hasUsageAccess(context) }

    Function("openUsageAccessSettings") { ScreenTime.openUsageAccessSettings(context) }

    Function("screenEvents") { fromMs: Double, toMs: Double ->
      ScreenTime.events(context, fromMs.toLong(), toMs.toLong())
    }

    Function("deviceName") { ScreenTime.deviceName(context) }

    // The system's alarm sound picker; on most phones its "Add" button takes any song on the phone.
    AsyncFunction("pickAlarmSound") { promise: Promise ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()

      pendingPick?.resolve(null)
      pendingPick = promise
      activity.startActivityForResult(
        Intent(RingtoneManager.ACTION_RINGTONE_PICKER)
          .putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)
          .putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Alarm sound")
          .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
          .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
          .putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, Settings.System.DEFAULT_ALARM_ALERT_URI)
          .putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, AlarmSound.uri(context)),
        PICK_ALARM_SOUND,
      )
    }

    OnActivityResult { _, (requestCode, resultCode, data) ->
      if (requestCode != PICK_ALARM_SOUND) return@OnActivityResult

      val promise = pendingPick ?: return@OnActivityResult
      pendingPick = null
      val picked = data?.let(::pickedUri)

      if (resultCode != Activity.RESULT_OK || picked == null) {
        promise.resolve(null)
        return@OnActivityResult
      }

      AlarmSound.save(context, picked)
      promise.resolve(describeSound())
    }
  }

  private fun pickedUri(data: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
    }
}
