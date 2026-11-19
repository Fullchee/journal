package expo.modules.journalandroid

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

// The running session lives on the phone, so the tile keeps time with the app closed.
private const val TILE_PREFS = "timed_habit_tile"
private const val RUNNING_ID = "habit"
private const val RUNNING_NAME = "name"
private const val STARTED_AT = "started_at"
private const val ENDED_AT = "ended_at"

// `endedAtMs` is set once the owner stops the session, until the app saves its minutes.
internal data class TileSession(val id: String, val name: String, val startedAtMs: Long, val endedAtMs: Long?)

// The app's link that logs a finished session as one Duration entry; `encodedId` is already URL-encoded.
internal fun durationPath(encodedId: String, startedAtMs: Long, endedAtMs: Long): String =
  "habit/$encodedId/duration?start=$startedAtMs&end=$endedAtMs"

// The app calls this once the session's minutes save; a link for an older session leaves a newer one running.
internal fun clearTileSession(context: Context, startedAtMs: Long) {
  val prefs = context.getSharedPreferences(TILE_PREFS, Context.MODE_PRIVATE)

  if (prefs.getLong(STARTED_AT, 0) == startedAtMs) prefs.edit().clear().apply()
}

// Quick Settings tile for the timed Habit logged most recently: a tap starts a session, the next tap stops it and
// opens the app to log the minutes. A stopped session stays until the app saves it, so a tap retries a failed save.
class TimedHabitTile : TileService() {
  private val prefs
    get() = getSharedPreferences(TILE_PREFS, Context.MODE_PRIVATE)

  override fun onStartListening() {
    redraw()
  }

  override fun onClick() {
    val session = running()

    if (session != null) {
      stop(session)
      return
    }

    val habit = savedHabits()?.let(::tileHabit) ?: return

    prefs.edit()
      .putString(RUNNING_ID, habit.id)
      .putString(RUNNING_NAME, habit.name)
      .putLong(STARTED_AT, System.currentTimeMillis())
      .apply()
    redraw()
  }

  private fun running(): TileSession? {
    val id = prefs.getString(RUNNING_ID, null) ?: return null

    return TileSession(
      id,
      prefs.getString(RUNNING_NAME, null).orEmpty(),
      prefs.getLong(STARTED_AT, 0),
      if (prefs.contains(ENDED_AT)) prefs.getLong(ENDED_AT, 0) else null,
    )
  }

  private fun stop(session: TileSession) {
    val endedAtMs = session.endedAtMs ?: System.currentTimeMillis().also { prefs.edit().putLong(ENDED_AT, it).apply() }
    redraw()

    val link = appLink(durationPath(Uri.encode(session.id), session.startedAtMs, endedAtMs))

    if (isLocked) unlockAndRun { open(link) } else open(link)
  }

  private fun open(link: Intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startActivityAndCollapse(
        PendingIntent.getActivity(this, 0, link, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE),
      )
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(link)
    }
  }

  private fun redraw() {
    val tile = qsTile ?: return
    val session = running()
    val habit = savedHabits()?.let(::tileHabit)

    when {
      session?.endedAtMs != null -> {
        tile.state = Tile.STATE_ACTIVE
        tile.label = getString(R.string.timed_tile_save, session.name)
        setSubtitle(tile, getString(R.string.timed_tile_unsaved))
      }
      session != null -> {
        tile.state = Tile.STATE_ACTIVE
        tile.label = getString(R.string.timed_tile_stop, session.name)
        setSubtitle(tile, getString(R.string.timed_tile_since, clockLabel(torontoTime(session.startedAtMs))))
      }
      habit != null -> {
        tile.state = Tile.STATE_INACTIVE
        tile.label = getString(R.string.timed_tile_start, habit.name)
        setSubtitle(tile, null)
      }
      else -> {
        tile.state = Tile.STATE_UNAVAILABLE
        tile.label = getString(R.string.timed_tile_label)
        setSubtitle(tile, getString(R.string.timed_tile_none))
      }
    }

    tile.updateTile()
  }

  // Tiles gained a subtitle in Android 10; older phones show the label alone.
  private fun setSubtitle(tile: Tile, subtitle: String?) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) tile.subtitle = subtitle
  }
}
