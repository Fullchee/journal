package expo.modules.journalandroid

import android.content.Context
import org.json.JSONException
import org.json.JSONObject

// Where each placed Habits widget keeps its filter, keyed by its appWidgetId.
private const val FILTERS_PREFS = "habits_widget_filters"

// A Habit's time of day falls in one window; HH:MM times compare as text.
internal enum class TimeOfDay(val id: String, val label: String, val from: String, val until: String) {
  MORNING("morning", "Morning", "00:00", "12:00"),
  AFTERNOON("afternoon", "Afternoon", "12:00", "17:00"),
  EVENING("evening", "Evening", "17:00", "24:00"),
}

// The ids match `Priority` in @/core.
internal enum class HabitPriority(val id: String, val label: String) {
  HIGH("high", "High priority"),
  NORMAL("normal", "Normal priority"),
  LOW("low", "Low priority"),
}

// One widget's filter; null or "" leaves that field open, so the blank filter shows every due Habit.
internal data class HabitsFilter(
  val timeOfDay: TimeOfDay? = null,
  val place: String = "",
  val priority: HabitPriority? = null,
)

private fun samePlace(a: String, b: String) = a.trim().equals(b.trim(), ignoreCase = true)

// Like `fitsPlace` in @/core, a Habit with no Places fits anywhere; likewise a Habit with no time fits any window.
internal fun HabitsFilter.fits(habit: DueHabit): Boolean =
  (timeOfDay == null || habit.time == null || habit.time >= timeOfDay.from && habit.time < timeOfDay.until) &&
    (place == "" || habit.places.isEmpty() || habit.places.any { samePlace(it, place) }) &&
    (priority == null || habit.priority == priority.id)

// The widget's caption names its filter, so two placed widgets tell apart; null for the blank filter.
internal fun HabitsFilter.caption(): String? =
  listOfNotNull(timeOfDay?.label, place.ifEmpty { null }, priority?.label).joinToString(" · ").ifEmpty { null }

internal fun HabitsFilter.toJson(): String =
  JSONObject()
    .put("timeOfDay", timeOfDay?.id ?: "")
    .put("place", place)
    .put("priority", priority?.id ?: "")
    .toString()

// An unknown or broken value reads as open, so a bad save never hides every Habit.
internal fun habitsFilter(saved: String): HabitsFilter =
  try {
    val json = JSONObject(saved)

    HabitsFilter(
      TimeOfDay.entries.find { it.id == json.optString("timeOfDay") },
      json.optString("place"),
      HabitPriority.entries.find { it.id == json.optString("priority") },
    )
  } catch (e: JSONException) {
    HabitsFilter()
  }

// The Places a filter offers, from the app's last push; empty before the first one.
internal fun widgetPlaces(saved: String): List<String> =
  try {
    val places = JSONObject(saved).optJSONArray("places")

    if (places == null) emptyList() else (0 until places.length()).map { places.getString(it) }
  } catch (e: JSONException) {
    emptyList()
  }

private fun Context.filterPrefs() = getSharedPreferences(FILTERS_PREFS, Context.MODE_PRIVATE)

// A widget placed before filters existed has none saved, so it keeps showing every due Habit.
internal fun Context.habitsFilter(widgetId: Int): HabitsFilter =
  filterPrefs().getString(widgetId.toString(), null)?.let(::habitsFilter) ?: HabitsFilter()

internal fun Context.saveHabitsFilter(widgetId: Int, filter: HabitsFilter) {
  filterPrefs().edit().putString(widgetId.toString(), filter.toJson()).apply()
}

internal fun Context.forgetHabitsFilters(widgetIds: IntArray) {
  val editor = filterPrefs().edit()

  for (widgetId in widgetIds) editor.remove(widgetId.toString())
  editor.apply()
}
