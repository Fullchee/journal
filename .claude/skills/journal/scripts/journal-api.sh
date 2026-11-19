#!/usr/bin/env bash
# Calls the live journal API as the owner, logging in through Cloudflare Access when needed.
# Usage: journal-api.sh METHOD PATH [JSON | @file]
#   journal-api.sh GET '/api/habits?view=tracker'
#   journal-api.sh POST /api/check-ins '{"score": 5}'
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
	sed -n '2,5p' "$0" >&2
	exit 2
fi

method="$1"
path="$2"
base="${JOURNAL_URL:-https://journal.fullchee.workers.dev}"

command -v cloudflared >/dev/null || {
	echo "cloudflared is missing: brew install cloudflared" >&2
	exit 1
}

# `access token` fails once the Access session expires; `access login` opens the browser for the email PIN.
if ! token="$(cloudflared access token -app="$base" 2>/dev/null)"; then
	cloudflared access login --quiet "$base" >&2
	token="$(cloudflared access token -app="$base")"
fi

body_args=()
if [[ $# -eq 3 ]]; then
	body_args=(-H "content-type: application/json" --data-binary "$3")
fi

response="$(curl -sS -X "$method" "$base$path" -H "cf-access-token: $token" ${body_args[@]+"${body_args[@]}"} -w $'\n%{http_code} %{content_type}')"
status_line="${response##*$'\n'}"
status="${status_line%% *}"
content_type="${status_line#* }"
payload="${response%$'\n'*}"

# Access answers a rejected token with its HTML login page, not JSON.
if [[ "$content_type" == text/html* ]]; then
	echo "Access rejected the token. Run: cloudflared access login $base" >&2
	exit 1
fi

echo "HTTP $status"
[[ -n "$payload" ]] && echo "$payload"
[[ "$status" -lt 400 ]]
