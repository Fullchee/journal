#!/usr/bin/env bash
# Build a standalone release APK (JS bundled in, no Metro), open the Drive upload folder, and reveal the APK in Finder.
set -euo pipefail
cd "$(dirname "$0")/.."

DRIVE_URL="https://drive.google.com/drive/u/0/folders/1uIDzHTp9rQKAxHKFArRUaK1xQXI7RNLO"
BUILT="android/app/build/outputs/apk/release/app-release.apk"
APK="android/app/build/outputs/apk/release/journal.apk"

# Prebuild rewrites the android/ios scripts in package.json to `expo run:*`; keep the committed ones.
cp package.json package.json.prebuild-backup
trap 'mv package.json.prebuild-backup package.json' EXIT
bunx expo prebuild --platform android --no-install
mv package.json.prebuild-backup package.json
trap - EXIT

# sentry-cli fails the build without a token; skipping the upload leaves Sentry with minified stack traces.
if [[ -z "${SENTRY_AUTH_TOKEN:-}" ]]; then
	echo "SENTRY_AUTH_TOKEN is unset: skipping the Sentry source map upload."
	export SENTRY_DISABLE_AUTO_UPLOAD=true
fi

# React Native compiles C++ through ccache when it is on PATH; a shared base dir lets worktrees reuse each other's hits.
export CCACHE_BASEDIR="$HOME"

GRADLE_ARGS=(
	# The bundle task skips .css changes, so it would ship stale styles without a rerun.
	createBundleReleaseJsAndAssets --rerun
	assembleRelease
	# Android 14+ phones are all 64-bit ARM; skipping the other ABIs cuts most of the native compile.
	-PreactNativeArchitectures=arm64-v8a
	--build-cache
	-Dorg.gradle.jvmargs="-Xmx6g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError -XX:+UseParallelGC -Dfile.encoding=UTF-8"
	-Pkotlin.daemon.jvmargs=-Xmx3g
	# A sideloaded personal build needs no shrinking, PNG crunching or Play Store lint gate.
	-Pandroid.enableMinifyInReleaseBuilds=false
	-Pandroid.enablePngCrunchInReleaseBuilds=false
	-x lintVitalAnalyzeRelease -x lintVitalReportRelease -x lintVitalRelease
)
# The build cache lives in ~/.gradle, so every worktree reuses earlier builds; pass --no-build-cache or --rerun-tasks to force a full build.
GRADLE_ARGS+=("$@")
(cd android && ./gradlew "${GRADLE_ARGS[@]}")

cp "$BUILT" "$APK"
open "$DRIVE_URL"
open -R "$APK"

echo "Built $APK. Upload it to the Drive folder, then install it from Drive on the phone."
