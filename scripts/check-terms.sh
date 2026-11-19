#!/usr/bin/env bash
# Fails when a tracked file holds a term from DENIED_TERMS: one term per line, matched case-insensitively anywhere in a line.
# The list comes from an Actions secret, and a hit prints only file:line: CI logs are public, and the list names what it guards.
set -euo pipefail

terms=$(printf '%s\n' "${DENIED_TERMS:-}" | sed '/^[[:space:]]*$/d')

if [[ -z "$terms" ]]; then
	echo "DENIED_TERMS is empty: set the Actions secret." >&2
	exit 1
fi

hits=$(git grep -n -I -i -F -f <(printf '%s\n' "$terms") -- . | cut -d: -f1,2 || true)

if [[ -n "$hits" ]]; then
	echo "Denied terms found at:" >&2
	echo "$hits" >&2
	exit 1
fi

echo "No denied terms in tracked files."
