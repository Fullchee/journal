package expo.modules.journalandroid

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri

// Matches `expo.scheme` in app.json, so every link lands on its screen through Expo Router.
private const val APP_SCHEME = "dev.fullchee.journal"

// `path` is the route plus query, e.g. `habits?edit=<id>`.
internal fun Context.appLink(path: String): Intent =
  Intent(Intent.ACTION_VIEW, Uri.parse("$APP_SCHEME:///$path"))
    .setPackage(packageName)
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

// Each tap's link differs in its data, so Android keeps them apart without distinct request codes.
internal fun Context.widgetTap(path: String): PendingIntent =
  PendingIntent.getActivity(
    this,
    0,
    appLink(path),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
  )
