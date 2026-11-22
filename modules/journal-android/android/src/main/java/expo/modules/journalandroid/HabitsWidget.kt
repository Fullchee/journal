package expo.modules.journalandroid

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.json.JSONException
import org.json.JSONObject

// Where the Habits widget and the Quick Settings tile read the app's `HabitWidgets` push.
const val HABITS_PREFS = "habits_widget"
const val HABITS_KEY = "habits"

// Sent inside the app after each push, so the Habits widget redraws; its receiver listens for this action.
const val ACTION_HABITS_CHANGED = "expo.modules.journalandroid.HABITS_CHANGED"

// Every Day is a Toronto calendar day, wherever the phone is, as in @/core.
private val TORONTO: TimeZone = TimeZone.getTimeZone("America/Toronto")

// `places`, `time` (HH:MM) and `priority` are what a widget's filter matches; see `HabitsFilter.fits`.
internal data class DueHabit(
  val id: String,
  val name: String,
  val tick: Boolean,
  val places: List<String> = emptyList(),
  val time: String? = null,
  val priority: String = "normal",
)

internal data class TileHabit(val id: String, val name: String)

// The Day an instant falls on, as YYYY-MM-DD, matching `torontoDay` in @/core.
internal fun torontoDay(atMs: Long): String =
  SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply { timeZone = TORONTO }.format(Date(atMs))

// Toronto's clock at an instant, as "HH:MM", matching `torontoTime` in @/core.
internal fun torontoTime(atMs: Long): String =
  SimpleDateFormat("HH:mm", Locale.ROOT).apply { timeZone = TORONTO }.format(Date(atMs))

// The next midnight on Toronto's clock, when the pushed list goes stale.
internal fun nextTorontoMidnight(nowMs: Long): Long =
  Calendar.getInstance(TORONTO).apply {
    timeInMillis = nowMs
    add(Calendar.DAY_OF_YEAR, 1)
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
  }.timeInMillis

// Null when the app pushed the list on another Day, so the widget never offers yesterday's Habits.
internal fun dueHabits(saved: String, today: String): List<DueHabit>? =
  try {
    val pushed = JSONObject(saved)

    if (pushed.getString("date") != today) {
      null
    } else {
      val due = pushed.getJSONArray("due")

      (0 until due.length()).map { due.getJSONObject(it) }.map(::dueHabit)
    }
  } catch (e: JSONException) {
    null
  }

// A push saved by an app version before widget filters lacks the filter fields; it reads as matching every filter.
private fun dueHabit(json: JSONObject): DueHabit {
  val places = json.optJSONArray("places")

  return DueHabit(
    json.getString("id"),
    json.getString("name"),
    json.getBoolean("tick"),
    if (places == null) emptyList() else (0 until places.length()).map { places.getString(it) },
    if (json.isNull("time")) null else json.getString("time"),
    json.optString("priority", "normal"),
  )
}

// The timed Habit the tile starts; null when the owner has none.
internal fun tileHabit(saved: String): TileHabit? =
  try {
    JSONObject(saved).optJSONObject("timed")?.let { TileHabit(it.getString("id"), it.getString("name")) }
  } catch (e: JSONException) {
    null
  }

// The tick's link carries when the widget drew it, so the app can tell a replayed link from a fresh tap.
internal fun tickPath(encodedId: String, drawnAtMs: Long): String = "habit/$encodedId/done?at=$drawnAtMs"

internal fun Context.savedHabits(): String? =
  getSharedPreferences(HABITS_PREFS, Context.MODE_PRIVATE).getString(HABITS_KEY, null)

// Home-screen widget listing today's due Habits still open; the tick marks one done, the name opens it.
class HabitsWidget : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_HABITS_CHANGED) {
      super.onReceive(context, intent)
      return
    }

    val manager = AppWidgetManager.getInstance(context)
    val widgetIds = manager.getAppWidgetIds(ComponentName(context, HabitsWidget::class.java))

    if (widgetIds.isNotEmpty()) onUpdate(context, manager, widgetIds)
  }

  override fun onDeleted(context: Context, widgetIds: IntArray) {
    context.forgetHabitsFilters(widgetIds)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, widgetId: Int, options: Bundle) {
    onUpdate(context, manager, intArrayOf(widgetId))
  }

  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    val now = System.currentTimeMillis()
    val habits = context.savedHabits()?.let { dueHabits(it, torontoDay(now)) }

    for (widgetId in widgetIds) {
      val heightDp = manager.getAppWidgetOptions(widgetId).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)

      val filter = context.habitsFilter(widgetId)
      val shown = habits?.filter(filter::fits)?.take(rowsThatFit(heightDp))

      manager.updateAppWidget(widgetId, views(context, widgetId, filter, shown, now))
    }

    scheduleMidnightRedraw(context, now)
  }

  private fun views(
    context: Context,
    widgetId: Int,
    filter: HabitsFilter,
    habits: List<DueHabit>?,
    drawnAtMs: Long,
  ): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.habits_widget)
    val rows = habits.orEmpty()

    views.setTextViewText(R.id.habits_header, filter.caption() ?: context.getString(R.string.habits_widget_title))
    views.setOnClickPendingIntent(R.id.habits_header, context.widgetTap(""))
    views.setOnClickPendingIntent(R.id.habits_filter, filterTap(context, widgetId))
    views.removeAllViews(R.id.habits_list)

    for (habit in rows) {
      val item = RemoteViews(context.packageName, R.layout.habits_widget_row)
      val id = Uri.encode(habit.id)

      item.setTextViewText(R.id.habit_name, habit.name)
      item.setOnClickPendingIntent(R.id.habit_name, context.widgetTap("habit/$id"))
      item.setViewVisibility(R.id.habit_tick, if (habit.tick) View.VISIBLE else View.GONE)
      item.setContentDescription(R.id.habit_tick, context.getString(R.string.habits_widget_tick, habit.name))
      item.setOnClickPendingIntent(R.id.habit_tick, context.widgetTap(tickPath(id, drawnAtMs)))
      views.addView(R.id.habits_list, item)
    }

    views.setViewVisibility(R.id.habits_empty, if (rows.isEmpty()) View.VISIBLE else View.GONE)
    views.setTextViewText(
      R.id.habits_empty,
      context.getString(if (habits == null) R.string.habits_widget_not_loaded else R.string.habits_widget_all_done),
    )

    return views
  }

  // Each widget's request code is its id, so every widget's button opens its own filter.
  private fun filterTap(context: Context, widgetId: Int): PendingIntent =
    PendingIntent.getActivity(
      context,
      widgetId,
      Intent(context, HabitsWidgetConfigActivity::class.java)
        .setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  // At Toronto midnight the pushed list is yesterday's, so the widget asks to open the app until the next push.
  // Inexact and non-waking: the list only matters when the screen is on.
  private fun scheduleMidnightRedraw(context: Context, nowMs: Long) {
    val redraw = Intent(context, HabitsWidget::class.java).setAction(ACTION_HABITS_CHANGED)
    val pending = PendingIntent.getBroadcast(
      context,
      0,
      redraw,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    alarmManager.set(AlarmManager.RTC, nextTorontoMidnight(nowMs), pending)
  }
}
