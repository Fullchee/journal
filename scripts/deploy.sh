#!/usr/bin/env bash
# Ships origin/main to production from this machine, as CI's deploy job does, for when GitHub Actions can't run.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [[ -n $(git status --porcelain) ]]; then
	echo "Commit or stash your changes first: production only runs pushed commits." >&2
	exit 1
fi

git fetch --quiet origin main

if [[ $(git rev-parse HEAD) != $(git rev-parse origin/main) ]]; then
	echo "Check out origin/main first: production only runs what is on main." >&2
	exit 1
fi

bun run check
EXPO_NO_TELEMETRY=1 bunx expo export -p web
WRANGLER_SEND_METRICS=false bunx wrangler@4 d1 migrations apply fullchee-dashboard --remote
WRANGLER_SEND_METRICS=false bunx wrangler@4 deploy
