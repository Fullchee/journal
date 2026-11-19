package expo.modules.journalandroid

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

// Zone names match `ZONES` in @/core, which Today reads from the `zone` param.
private val ZONE_BUTTONS = listOf(
  "Storm" to R.id.zone_storm,
  "Rain" to R.id.zone_rain,
  "Cloud" to R.id.zone_cloud,
  "Sun" to R.id.zone_sun,
)

// Home-screen widget with the four Storm to Sun zones; a tap opens Today with that zone's plate marked.
class CheckInWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    val views = RemoteViews(context.packageName, R.layout.check_in_widget)

    for ((zone, button) in ZONE_BUTTONS) {
      views.setOnClickPendingIntent(button, context.widgetTap("?zone=$zone"))
    }

    manager.updateAppWidget(widgetIds, views)
  }
}
