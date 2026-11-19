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
import java.util.Calendar
import java.util.Locale
import org.json.JSONArray
import org.json.JSONException

private const val MAX_ROWS = 8
// Match alarms_widget.xml: 16dp of padding plus the 32dp caption, then 40dp per row.
private const val CHROME_DP = 48
private const val ROW_DP = 40

// The launcher reports its portrait height as the max height; 0 means it has not said yet.
internal fun rowsThatFit(heightDp: Int): Int =
  if (heightDp <= 0) 3 else ((heightDp - CHROME_DP) / ROW_DP).coerceIn(1, MAX_ROWS)

// `daysAway` is 0 for today, 1 for tomorrow, up to 7 for a weekly alarm whose minute already passed today.
internal data class AlarmRow(val id: String, val name: String, val time: String, val daysAway: Int)

// Rows are `WidgetAlarm`s from @/core, earliest first; `days` use 0 for Sunday where Calendar uses 1.
// An alarm stays listed for today through the minute it rings.
internal fun upcomingRows(saved: String, now: Calendar, limit: Int): List<AlarmRow> {
  val today = now.get(Calendar.DAY_OF_WEEK) - 1
  val clock = String.format(Locale.ROOT, "%02d:%02d", now.get(Calendar.HOUR_OF_DAY), now.get(Calendar.MINUTE))

  return try {
    val array = JSONArray(saved)
    val alarms = (0 until array.length()).map { array.getJSONObject(it) }

    (0..7).asSequence()
      .flatMap { daysAway ->
        val weekday = (today + daysAway) % 7

        alarms.asSequence().filter { alarm ->
          val days = alarm.getJSONArray("days")
          val time = alarm.getString("time")
          val ringsThatDay = (0 until days.length()).any { days.getInt(it) == weekday }

          ringsThatDay && when (daysAway) {
            0 -> time >= clock
            7 -> time < clock
            else -> true
          }
        }.map { AlarmRow(it.getString("id"), it.getString("name"), it.getString("time"), daysAway) }
      }
      .take(limit)
      .toList()
  } catch (e: JSONException) {
    emptyList()
  }
}

// "17:05" as "5:05 PM", matching `clockLabel` in @/core.
internal fun clockLabel(time: String): String {
  val (hour, minute) = time.split(":").map { it.toInt() }
  val twelveHour = if (hour % 12 == 0) 12 else hour % 12

  return String.format(Locale.ROOT, "%d:%02d %s", twelveHour, minute, if (hour < 12) "AM" else "PM")
}

// When the row's alarm rings, as a moment on the calendar.
internal fun ringsAt(row: AlarmRow, now: Calendar): Calendar {
  val (hour, minute) = row.time.split(":").map { it.toInt() }

  return (now.clone() as Calendar).apply {
    add(Calendar.DAY_OF_YEAR, row.daysAway)
    set(Calendar.HOUR_OF_DAY, hour)
    set(Calendar.MINUTE, minute)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
  }
}

private fun Context.dayLabel(row: AlarmRow, now: Calendar): String {
  val weekday = ringsAt(row, now).getDisplayName(Calendar.DAY_OF_WEEK, Calendar.SHORT, Locale.getDefault()).orEmpty()

  return when (row.daysAway) {
    0 -> getString(R.string.alarms_widget_today)
    1 -> getString(R.string.alarms_widget_tomorrow)
    7 -> getString(R.string.alarms_widget_next_weekday, weekday)
    else -> weekday
  }
}

// Home-screen widget listing the next Habit alarms, today's first; a tap opens that Habit.
class AlarmsWidget : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_ALARMS_CHANGED) {
      super.onReceive(context, intent)
      return
    }

    val manager = AppWidgetManager.getInstance(context)
    val widgetIds = manager.getAppWidgetIds(ComponentName(context, AlarmsWidget::class.java))

    if (widgetIds.isNotEmpty()) onUpdate(context, manager, widgetIds)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, widgetId: Int, options: Bundle) {
    onUpdate(context, manager, intArrayOf(widgetId))
  }

  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    val saved = context.getSharedPreferences(ALARMS_PREFS, Context.MODE_PRIVATE).getString(ALARMS_KEY, null)
    val now = Calendar.getInstance()
    val rows = saved?.let { upcomingRows(it, now, MAX_ROWS) } ?: emptyList()

    for (widgetId in widgetIds) {
      val heightDp = manager.getAppWidgetOptions(widgetId).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)

      manager.updateAppWidget(widgetId, views(context, rows.take(rowsThatFit(heightDp)), saved == null, now))
    }

    scheduleNextRedraw(context, rows.firstOrNull(), now)
  }

  private fun views(context: Context, rows: List<AlarmRow>, notLoaded: Boolean, now: Calendar): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.alarms_widget)

    views.setOnClickPendingIntent(R.id.alarms_header, context.widgetTap("habits"))
    views.removeAllViews(R.id.alarms_list)

    for (row in rows) {
      val item = RemoteViews(context.packageName, R.layout.alarms_widget_row)
      val day = context.dayLabel(row, now)

      item.setTextViewText(R.id.alarm_time, clockLabel(row.time))
      item.setTextViewText(R.id.alarm_name, row.name)
      item.setTextViewText(R.id.alarm_day, day)
      item.setTextColor(R.id.alarm_day, context.getColor(if (row.daysAway == 0) R.color.widget_leaf else R.color.widget_graphite))
      item.setContentDescription(R.id.alarm_row, "${row.name}, $day ${clockLabel(row.time)}")
      item.setOnClickPendingIntent(R.id.alarm_row, context.widgetTap("habits?edit=${Uri.encode(row.id)}"))
      views.addView(R.id.alarms_list, item)
    }

    views.setViewVisibility(R.id.alarms_empty, if (rows.isEmpty()) View.VISIBLE else View.GONE)
    views.setTextViewText(
      R.id.alarms_empty,
      context.getString(if (notLoaded) R.string.alarms_widget_not_loaded else R.string.alarms_widget_none_set),
    )

    return views
  }

  // Redraw just after the first listed alarm's minute passes, or at midnight when Today and Tomorrow move on.
  // Inexact and non-waking: the list only matters when the screen is on.
  private fun scheduleNextRedraw(context: Context, first: AlarmRow?, now: Calendar) {
    val midnight = (now.clone() as Calendar).apply {
      add(Calendar.DAY_OF_YEAR, 1)
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    val afterFirst = first?.let { ringsAt(it, now).apply { add(Calendar.MINUTE, 1) } }
    val next = if (afterFirst != null && afterFirst.before(midnight)) afterFirst else midnight
    val redraw = Intent(context, AlarmsWidget::class.java).setAction(ACTION_ALARMS_CHANGED)
    val pending = PendingIntent.getBroadcast(
      context,
      0,
      redraw,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    alarmManager.set(AlarmManager.RTC, next.timeInMillis, pending)
  }
}
