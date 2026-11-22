package expo.modules.journalandroid

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private val LIFT = DueHabit("lift", "Lift", true, listOf("Gym"), "07:30", "high")
private val ANYWHERE_ANYTIME = DueHabit("water", "Drink water", true)

class HabitsWidgetFilterTest {
  @Test
  fun theBlankFilterShowsEveryHabit() {
    assertTrue(HabitsFilter().fits(LIFT))
    assertNull(HabitsFilter().caption())
  }

  @Test
  fun matchesTheTimeOfDayWindowItsUsualTimeFallsIn() {
    assertTrue(HabitsFilter(timeOfDay = TimeOfDay.MORNING).fits(LIFT))
    assertFalse(HabitsFilter(timeOfDay = TimeOfDay.EVENING).fits(LIFT))
    assertTrue(HabitsFilter(timeOfDay = TimeOfDay.AFTERNOON).fits(LIFT.copy(time = "12:00")))
    assertFalse(HabitsFilter(timeOfDay = TimeOfDay.AFTERNOON).fits(LIFT.copy(time = "17:00")))
  }

  @Test
  fun matchesAPlaceInAnySpelling() {
    assertTrue(HabitsFilter(place = " gym").fits(LIFT))
    assertFalse(HabitsFilter(place = "Home").fits(LIFT))
  }

  @Test
  fun matchesPriority() {
    assertTrue(HabitsFilter(priority = HabitPriority.HIGH).fits(LIFT))
    assertFalse(HabitsFilter(priority = HabitPriority.LOW).fits(LIFT))
  }

  @Test
  fun aHabitWithNoTimeOrPlacesFitsEveryWindowAndPlace() {
    assertTrue(HabitsFilter(TimeOfDay.EVENING, "Home").fits(ANYWHERE_ANYTIME))
  }

  @Test
  fun captionsTheFilterSoWidgetsTellApart() {
    assertEquals(
      "Morning · Gym · High priority",
      HabitsFilter(TimeOfDay.MORNING, "Gym", HabitPriority.HIGH).caption(),
    )
    assertEquals("Gym", HabitsFilter(place = "Gym").caption())
  }

  @Test
  fun readsBackASavedFilter() {
    val filter = HabitsFilter(TimeOfDay.EVENING, "Home", HabitPriority.NORMAL)

    assertEquals(filter, habitsFilter(filter.toJson()))
    assertEquals(HabitsFilter(), habitsFilter(HabitsFilter().toJson()))
  }

  @Test
  fun readsUnknownOrBrokenFiltersAsOpen() {
    assertEquals(HabitsFilter(), habitsFilter("""{"timeOfDay": "night", "priority": "urgent"}"""))
    assertEquals(HabitsFilter(), habitsFilter("not json"))
  }

  @Test
  fun offersThePushedPlaces() {
    assertEquals(listOf("Gym", "Home"), widgetPlaces("""{"places": ["Gym", "Home"]}"""))
    assertEquals(emptyList<String>(), widgetPlaces("""{"date": "2026-11-04"}"""))
    assertEquals(emptyList<String>(), widgetPlaces("not json"))
  }
}
