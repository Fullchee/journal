#!/usr/bin/env bash
# Build a standalone release APK (JS bundled in, no Metro) from the current code.
# --install puts it on the USB-connected phone; otherwise it publishes the APK as the latest GitHub release.
set -euo pipefail

install_on_phone=false
if [[ "${1:-}" == --install ]]; then
	install_on_phone=true
	shift
fi

cd "$(dirname "$0")/.."

# Without the owner's key, Gradle falls back to the public debug key, which anyone could use to sign an APK that installs over this one.
if [[ -z "${JOURNAL_KEYSTORE_PATH:-}" || -z "${JOURNAL_KEYSTORE_PASSWORD:-}" ]]; then
	echo "JOURNAL_KEYSTORE_PATH and JOURNAL_KEYSTORE_PASSWORD are unset: run scripts/setup-release-keystore.sh." >&2
	exit 1
fi

# The release tags HEAD, so GitHub must have the commit; check before the long build.
commit="$(git rev-parse HEAD)"
if [[ $install_on_phone == false && -z "$(git branch -r --contains "$commit")" ]]; then
	echo "Push $commit before building: the GitHub release tags it." >&2
	exit 1
fi

REPO="Fullchee/journal"
BUILT="android/app/build/outputs/apk/release/app-release.apk"
APK="android/app/build/outputs/apk/release/journal.apk"
RUNTIME_VERSION="android/app/build/outputs/apk/release/runtime-version.txt"

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

if [[ $install_on_phone == true ]]; then
	adb -d install -r "$APK"
else
	# A release names the code it holds, so its date is the commit's, not the build's.
	commit_time() { git show -s --format=%cd --date="format-local:$1" "$commit"; }
	tag="apk-$(commit_time %Y%m%d-%H%M)-$(git rev-parse --short "$commit")"
	title="Journal for Android, $(commit_time '%B %-d, %Y at %-I:%M %p')"
	# The active gh account is the work one; the repo belongs to the personal account.
	# The app compares this with its own runtime version to offer a newer APK (use-apk-update-toast.android.ts).
	unzip -p "$APK" assets/fingerprint >"$RUNTIME_VERSION"
	GH_TOKEN="$(gh auth token --user Fullchee)" gh release create "$tag" "$APK" "$RUNTIME_VERSION" \
		--repo "$REPO" --target "$commit" --title "$title" --latest \
		--notes "Release APK for $commit. Later JS changes arrive as EAS updates."
	echo "Published $tag. On the phone, open https://github.com/$REPO/releases/latest/download/journal.apk"
fi
