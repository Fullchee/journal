The native Android module: widgets, alarms and app links.

## Failure log

- To see a widget change, run `./gradlew :app:installDebug` and redraw with `adb shell am broadcast -a <action> -n dev.fullchee.journal/<widget class>`; never `am force-stop` the app, which blanks its placed widgets until they are removed and re-added. Run widget unit tests with `./gradlew :journal-android:testDebugUnitTest` from `android/`.
