package expo.modules.journalandroid

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class AlarmSoundTest {
  @Test
  fun keepsOneChannelIdPerSound() {
    val song = "content://media/external/audio/media/42"

    assertEquals(alarmChannelId(song), alarmChannelId(song))
    assertNotEquals(alarmChannelId(song), alarmChannelId("content://settings/system/alarm_alert"))
  }

  @Test
  fun neverReusesTheLegacyBeepChannel() {
    assertNotEquals("alarms", alarmChannelId("content://settings/system/alarm_alert"))
  }
}
