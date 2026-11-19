#!/usr/bin/env bash
# Serves the app's Worker API on :8798 from a fresh, seeded local database. Nothing it runs talks to Cloudflare.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WRANGLER=$(cd "$HERE" && bun pm bin)/wrangler

# Wrangler otherwise reports usage to Cloudflare, checks npm for updates when it prints its banner,
# and fetches request.cf data from workers.cloudflare.com.
export WRANGLER_SEND_METRICS=false WRANGLER_SEND_ERROR_REPORTS=false WRANGLER_HIDE_BANNER=true CLOUDFLARE_CF_FETCH_ENABLED=false

# A fresh state folder gives every run an empty database and bucket.
STATE=$(mktemp -d -t journal-e2e-api)
cd "$HERE"

# A failed step must not orphan the fake AI: callers find servers to stop through this script's children.
# SIGKILL: on SIGTERM, wrangler dev can hang in shutdown once its fake-AI binding is gone. Every server keeps only temp state.
kill_tree() {
	for child in $(pgrep -P "$1"); do kill_tree "$child"; done
	kill -KILL "$1" 2>/dev/null || true
}
trap 'for child in $(pgrep -P $$); do kill_tree $child; done' EXIT INT TERM

# The fake AI goes first: every command that reads wrangler.toml waits for its service binding.
"$WRANGLER" dev -c fake-ai.wrangler.toml --port 8799 --persist-to "$STATE" &
until curl -s -m 2 -o /dev/null http://localhost:8799; do sleep 1; done

# One execute: `d1 migrations apply` starts a local runtime per migration, about 3 minutes for all of them.
cat "$HERE"/../../worker/migrations/*.sql seed.sql >"$STATE/schema-and-seed.sql"
"$WRANGLER" d1 execute journal-e2e -c wrangler.toml --local --persist-to "$STATE" --yes --file "$STATE/schema-and-seed.sql" >/dev/null
"$WRANGLER" dev -c wrangler.toml --port 8798 --ip 0.0.0.0 --persist-to "$STATE" &
wait
