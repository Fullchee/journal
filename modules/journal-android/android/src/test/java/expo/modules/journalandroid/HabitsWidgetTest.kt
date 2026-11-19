package expo.modules.journalandroid

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private const val SAVED = """{
  "date": "2026-11-04",
  "due": [
    {"id": "walk", "name": "Walk", "tick": true},
    {"id": "read", "name": "Read", "tick": false}
  ],
  "timed": {"id": "read", "name": "Read"}
}"""

// 2026-11-04 23:30 in Toronto (EST, UTC-5) is 2026-11-05 04:30 UTC.
private const val LATE_WEDNESDAY_MS = 1_793_853_000_000L

class HabitsWidgetTest {
  @Test
  fun listsTheDueHabitsPushedForToday() {
    assertEquals(
      listOf(DueHabit("walk", "Walk", true), DueHabit("read", "Read", false)),
      dueHabits(SAVED, "2026-11-04"),
    )
  }

  @Test
  fun dropsAListPushedOnAnotherDay() {
    assertNull(dueHabits(SAVED, "2026-11-05"))
  }

  @Test
  fun readsBrokenJsonAsNotLoaded() {
    assertNull(dueHabits("not json", "2026-11-04"))
    assertNull(tileHabit("not json"))
  }

  @Test
  fun readsTheTilesTimedHabit() {
    assertEquals(TileHabit("read", "Read"), tileHabit(SAVED))
  }

  @Test
  fun readsNoTimedHabitAsNone() {
    assertNull(tileHabit("""{"date": "2026-11-04", "due": [], "timed": null}"""))
  }

  @Test
  fun readsTheDayAndTimeOnTorontosClock() {
    assertEquals("2026-11-04", torontoDay(LATE_WEDNESDAY_MS))
    assertEquals("23:30", torontoTime(LATE_WEDNESDAY_MS))
  }

  @Test
  fun redrawsAtTorontosNextMidnight() {
    assertEquals(LATE_WEDNESDAY_MS + 30 * 60_000L, nextTorontoMidnight(LATE_WEDNESDAY_MS))
  }

  @Test
  fun linksTheFinishedSessionToItsDurationEntry() {
    assertEquals("habit/read/duration?start=1000&end=61000", durationPath("read", 1_000, 61_000))
  }

  @Test
  fun stampsTheTickWithWhenTheWidgetDrewIt() {
    assertEquals("habit/walk/done?at=1000", tickPath("walk", 1_000))
  }
}
