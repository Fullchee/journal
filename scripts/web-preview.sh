#!/usr/bin/env bash
# Serves the web app with seeded local data: the Maestro API on :8798 and Metro on a free port, same origin, no CORS.
# Usage: web-preview.sh [command…]. With a command, runs it once ready (PREVIEW_URL is set), then stops both servers.
# Without one, serves until Ctrl-C. Nothing it runs talks to production or Cloudflare (see .maestro/README.md).
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP=$(dirname "$HERE")
API_PORT=8798
FAKE_AI_PORT=8799
LOGS=$(mktemp -d -t journal-web-preview)

for port in "$API_PORT" "$FAKE_AI_PORT"; do
	if lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null; then
		echo "Port $port is busy; stop the other wrangler (e.g. bun run e2e) first." >&2
		exit 1
	fi
done

# 8081 stays free for the emulator's debug build.
METRO_PORT=${PREVIEW_PORT:-8091}
while lsof -ti "tcp:$METRO_PORT" -sTCP:LISTEN >/dev/null; do METRO_PORT=$((METRO_PORT + 1)); done

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

"$APP/.maestro/api/start.sh" >"$LOGS/api.log" 2>&1 &
wait_for "http://localhost:$API_PORT/api/me" "The local API"

cd "$APP"
# Unset EXPO_PUBLIC_API_URL makes web call its own origin, where the Metro proxy forwards /api/* to the local API.
# --offline and EXPO_NO_TELEMETRY keep Expo's CLI off api.expo.dev and cdp.expo.dev.
# No CI=1: in CI mode Metro stops watching files and serves the old bundle after every edit.
env -u CI -u EXPO_PUBLIC_API_URL JOURNAL_WEB_API_PROXY="http://localhost:$API_PORT" EXPO_NO_TELEMETRY=1 \
	bunx expo start --offline --port "$METRO_PORT" </dev/null >"$LOGS/metro.log" 2>&1 &
wait_for "http://localhost:$METRO_PORT/status" "Metro"

export PREVIEW_URL="http://localhost:$METRO_PORT"
# The first request builds the web bundle; doing it here keeps it out of the caller's page-load timeout.
BUNDLE=$(curl -s "$PREVIEW_URL/" | grep -o 'src="/[^"]*\.bundle[^"]*"' | head -1 | cut -d'"' -f2)
curl -s -o "$LOGS/bundle.js" "$PREVIEW_URL$BUNDLE"
curl -sf -o /dev/null "$PREVIEW_URL/api/me" || {
	echo "The API proxy failed; logs in $LOGS." >&2
	exit 1
}
grep -q 'reloads are disabled' "$LOGS/metro.log" && {
	echo "Metro isn't watching files, so edits won't show; see $LOGS/metro.log." >&2
	exit 1
}

echo "Web preview ready at $PREVIEW_URL (seeded API on :$API_PORT, logs in $LOGS)."
echo "Bundle built $(date +%T); Metro is watching, so edits reach the next page load."

if (($#)); then
	"$@"
else
	wait
fi
