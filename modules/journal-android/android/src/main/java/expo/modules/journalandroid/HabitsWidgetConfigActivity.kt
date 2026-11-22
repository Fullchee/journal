package expo.modules.journalandroid

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.Spinner

// Opens when a Habits widget is placed and from its filter button; every field starts open, so Save alone keeps
// every due Habit.
class HabitsWidgetConfigActivity : Activity() {
  private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Backing out of a fresh placement drops the widget, as Android expects.
    setResult(RESULT_CANCELED)

    widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }

    setTitle(R.string.habits_filter_title)
    setContentView(R.layout.habits_widget_config)

    val current = habitsFilter(widgetId)
    val places = placeChoices(current.place)
    val timeOfDay = choose(R.id.filter_time_of_day, getString(R.string.habits_filter_any_time), TimeOfDay.entries.map { it.label })
    val place = choose(R.id.filter_place, getString(R.string.habits_filter_anywhere), places)
    val priority = choose(R.id.filter_priority, getString(R.string.habits_filter_any_priority), HabitPriority.entries.map { it.label })

    timeOfDay.setSelection(current.timeOfDay?.let { it.ordinal + 1 } ?: 0)
    place.setSelection(places.indexOf(current.place) + 1)
    priority.setSelection(current.priority?.let { it.ordinal + 1 } ?: 0)
    if (places.isEmpty()) findViewById<View>(R.id.filter_place_row).visibility = View.GONE

    findViewById<Button>(R.id.filter_cancel).setOnClickListener { finish() }
    findViewById<Button>(R.id.filter_save).setOnClickListener {
      save(
        HabitsFilter(
          TimeOfDay.entries.getOrNull(timeOfDay.selectedItemPosition - 1),
          places.getOrNull(place.selectedItemPosition - 1) ?: "",
          HabitPriority.entries.getOrNull(priority.selectedItemPosition - 1),
        ),
      )
    }
  }

  // A saved place no Habit names any more stays offered, so reopening the filter doesn't drop it unseen.
  private fun placeChoices(saved: String): List<String> {
    val pushed = savedHabits()?.let(::widgetPlaces).orEmpty()

    return if (saved == "" || saved in pushed) pushed else pushed + saved
  }

  // The first choice leaves the field open.
  private fun choose(id: Int, open: String, choices: List<String>): Spinner =
    findViewById<Spinner>(id).apply {
      adapter = ArrayAdapter(context, android.R.layout.simple_spinner_item, listOf(open) + choices).apply {
        setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
      }
    }

  private fun save(filter: HabitsFilter) {
    saveHabitsFilter(widgetId, filter)
    sendBroadcast(Intent(this, HabitsWidget::class.java).setAction(ACTION_HABITS_CHANGED))
    setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
    finish()
  }
}
