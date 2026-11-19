package expo.modules.journalandroid

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

// Home-screen widget with one Log button; a tap opens Today with the log box focused.
class LogWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    val views = RemoteViews(context.packageName, R.layout.log_widget)

    views.setOnClickPendingIntent(R.id.log_button, context.widgetTap("?log"))
    manager.updateAppWidget(widgetIds, views)
  }
}
