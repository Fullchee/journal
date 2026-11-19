#!/usr/bin/env bash
# Runs the smoke flows on the emulator against a local API. Nothing here talks to production or Cloudflare.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEVICE=${E2E_DEVICE:-emulator-5554}
# The debug build on an emulator always loads its bundle from the host's :8081 (10.0.2.2).
METRO_PORT=8081
API_PORT=8798
FAKE_AI_PORT=8799
LOGS=$(mktemp -d -t journal-e2e-logs)

# Refuse busy ports, so a normal dev server (which talks to production) is never reused.
for port in "$METRO_PORT" "$API_PORT" "$FAKE_AI_PORT"; do
	if lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null; then
		echo "Port $port is busy; stop whatever runs there first." >&2
		exit 1
	fi
done

# Only an emulator: flows clear app data, which would sign the phone out.
[[ "$DEVICE" == emulator-* ]] || {
	echo "E2E_DEVICE must be an emulator, got $DEVICE." >&2
	exit 1
}
adb -s "$DEVICE" get-state >/dev/null 2>&1 || {
	echo "$DEVICE isn't running; start the emulator first." >&2
	exit 1
}
# With fewer cores, System UI ANR dialogs cover the app and every assertion fails.
cores=$(adb -s "$DEVICE" shell nproc | tr -d '\r')
((cores >= 4)) || {
	echo "$DEVICE has $cores cores; give its AVD 4 cores and 4 GB RAM in Device Manager." >&2
	exit 1
}

wait_for() { # url, what
	for _ in {1..300}; do
		curl -s -m 2 -o /dev/null "$1" && return
		sleep 1
	done
	echo "$2 didn't start; logs in $LOGS." >&2
	exit 1
}

# Stops this script's servers and everything they spawned, without touching whatever started this script.
# SIGKILL: on SIGTERM, wrangler dev can hang in shutdown once its fake-AI binding is gone. Every server keeps only temp state.
kill_tree() {
	for child in $(pgrep -P "$1"); do kill_tree "$child"; done
	kill -KILL "$1" 2>/dev/null || true
}
trap 'for child in $(pgrep -P $$); do kill_tree $child; done' EXIT INT TERM

"$HERE/api/start.sh" >"$LOGS/api.log" 2>&1 &
wait_for "http://localhost:$API_PORT/api/me" "The local API"

cd "$HERE/.."
# --offline and EXPO_NO_TELEMETRY keep Expo's CLI off api.expo.dev and cdp.expo.dev.
JOURNAL_E2E=1 EXPO_PUBLIC_API_URL="http://10.0.2.2:$API_PORT" CI=1 EXPO_NO_TELEMETRY=1 \
	bunx expo start --offline --port "$METRO_PORT" >"$LOGS/metro.log" 2>&1 &
wait_for "http://localhost:$METRO_PORT/status" "Metro"

# System UI ANR dialogs on a busy emulator cover the app and fail every assertion.
adb -s "$DEVICE" shell settings put global hide_error_dialogs 1

# Maestro otherwise sends usage analytics and checks for updates.
MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true MAESTRO_DISABLE_UPDATE_CHECK=true \
	maestro --device "$DEVICE" test "$HERE/flows" "$@"
