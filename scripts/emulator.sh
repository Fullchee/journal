#!/usr/bin/env bash
# Starts the dev emulator in the background. scripts/setup.sh creates it.
#
# Usage: bun run emulator
set -euo pipefail

AVD=android-36-with-play-store
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$SDK" ]]; then
	if [[ "$(uname -s)" == Darwin ]]; then
		SDK="$HOME/Library/Android/sdk"
	else SDK="$HOME/Android/Sdk"; fi
fi
EMULATOR="$SDK/emulator/emulator"

if ! "$EMULATOR" -list-avds 2>/dev/null | grep -qx "$AVD"; then
	echo "No $AVD emulator. Create it with scripts/setup.sh." >&2
	exit 1
fi

if pgrep -f -- "-avd $AVD" >/dev/null; then
	echo "$AVD is already running."
	exit 0
fi

LOG=$(mktemp -t "$AVD")
nohup "$EMULATOR" -avd "$AVD" >"$LOG" 2>&1 &
echo "Started $AVD. Log: $LOG"
