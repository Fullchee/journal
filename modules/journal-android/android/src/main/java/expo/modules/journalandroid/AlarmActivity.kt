package expo.modules.journalandroid

import android.app.Activity
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.service.notification.StatusBarNotification
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

// The app puts this on every `alarm` kind notification; notify-kit copies `data` into the notification's extras.
private const val HABIT_ID_EXTRA = "habitId"

// The lock-screen ring screen for an `alarm` kind Habit. Native, so it shows in under a second and
// shows nothing but the Habit's name. The alarm rings until Dismiss or Open cancels its notification.
class AlarmActivity : Activity() {
  private val notifications: NotificationManager
    get() = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()

    // notify-kit starts this screen without extras, so the ringing alarm is the newest one with a Habit id.
    val ringing = notifications.activeNotifications
      .filter { it.notification.extras.getString(HABIT_ID_EXTRA) != null }
      .maxByOrNull { it.postTime }

    if (ringing == null) {
      finish()
      return
    }

    setContentView(layout(ringing))
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
  }

  private fun layout(ringing: StatusBarNotification): LinearLayout {
    val habitId = ringing.notification.extras.getString(HABIT_ID_EXTRA).orEmpty()
    val name = ringing.notification.extras.getCharSequence(Notification.EXTRA_TITLE) ?: ""

    return LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.BLACK)
      setPadding(dp(32), dp(32), dp(32), dp(32))

      addView(TextView(context).apply {
        text = name
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 32f)
        gravity = Gravity.CENTER
        setPadding(0, 0, 0, dp(48))
      })
      addView(button("Dismiss") { stop(ringing) })
      addView(button("Open") {
        open(habitId)
        stop(ringing)
      })
    }
  }

  private fun button(label: String, onTap: () -> Unit) = Button(this).apply {
    text = label
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64)).apply {
      topMargin = dp(16)
    }
    setOnClickListener { onTap() }
  }

  // Cancelling the notification stops its looping sound.
  private fun stop(ringing: StatusBarNotification) {
    notifications.cancel(ringing.tag, ringing.id)
    finish()
  }

  private fun open(habitId: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager

      keyguard.requestDismissKeyguard(this, null)
    }
    startActivity(appLink("habits?edit=${Uri.encode(habitId)}"))
  }

  private fun dp(value: Int) =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()
}
