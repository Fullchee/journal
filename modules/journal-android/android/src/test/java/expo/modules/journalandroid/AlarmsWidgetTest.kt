package expo.modules.journalandroid

import java.util.Calendar
import org.junit.Assert.assertEquals
import org.junit.Test

// 2026-11-04 is a Wednesday, weekday 3 in `WidgetAlarm.days`.
private fun wednesdayAt(hour: Int, minute: Int): Calendar =
  Calendar.getInstance().apply {
    clear()
    set(2026, Calendar.NOVEMBER, 4, hour, minute)
  }

private const val SAVED = """[
  {"id": "walk", "name": "Walk", "time": "07:30", "days": [0, 1, 2, 3, 4, 5, 6]},
  {"id": "meds", "name": "Meds", "time": "09:00", "days": [3]},
  {"id": "gym", "name": "Gym", "time": "18:00", "days": [1, 5]}
]"""

class AlarmsWidgetTest {
  @Test
  fun listsTodaysAlarmsStillToRingFirst() {
    assertEquals(
      listOf(AlarmRow("meds", "Meds", "09:00", 0), AlarmRow("walk", "Walk", "07:30", 1)),
      upcomingRows(SAVED, wednesdayAt(8, 0), limit = 2),
    )
  }

  @Test
  fun keepsAnAlarmThroughTheMinuteItRings() {
    assertEquals(AlarmRow("meds", "Meds", "09:00", 0), upcomingRows(SAVED, wednesdayAt(9, 0), limit = 1).first())
  }

  @Test
  fun showsTomorrowsAlarmsOnceTodaysHaveRung() {
    assertEquals(
      listOf(AlarmRow("walk", "Walk", "07:30", 1), AlarmRow("walk", "Walk", "07:30", 2), AlarmRow("gym", "Gym", "18:00", 2)),
      upcomingRows(SAVED, wednesdayAt(21, 0), limit = 3),
    )
  }

  @Test
  fun listsAWeeklyAlarmThatAlreadyRangTodayAWeekOut() {
    val weeklyOnly = """[{"id": "meds", "name": "Meds", "time": "09:00", "days": [3]}]"""

    assertEquals(listOf(AlarmRow("meds", "Meds", "09:00", 7)), upcomingRows(weeklyOnly, wednesdayAt(10, 0), limit = 5))
  }

  @Test
  fun ringsAtTheAlarmsMinuteOnItsDay() {
    val at = ringsAt(AlarmRow("walk", "Walk", "07:30", 2), wednesdayAt(21, 15))

    assertEquals(listOf(6, 7, 30), listOf(at.get(Calendar.DAY_OF_MONTH), at.get(Calendar.HOUR_OF_DAY), at.get(Calendar.MINUTE)))
  }

  @Test
  fun fitsAsManyRowsAsTheWidgetIsTall() {
    assertEquals(listOf(3, 1, 4, 8), listOf(0, 60, 212, 2000).map(::rowsThatFit))
  }

  @Test
  fun showsNothingForUnreadableJson() {
    assertEquals(emptyList<AlarmRow>(), upcomingRows("not json", wednesdayAt(8, 0), limit = 5))
  }

  @Test
  fun labelsTimesOnATwelveHourClock() {
    assertEquals(
      listOf("12:05 AM", "7:30 AM", "12:00 PM", "6:00 PM"),
      listOf("00:05", "07:30", "12:00", "18:00").map(::clockLabel),
    )
  }
}
