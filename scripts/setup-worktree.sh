#!/usr/bin/env bash
# Prepare a fresh git worktree so lint, typecheck and tests pass; safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/.."

# Untracked local files live only in the main checkout: mise env (EXPO_TOKEN), agent notes and wrangler secrets.
main_checkout="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
if [ "$main_checkout" != "$PWD" ]; then
	for f in mise.local.toml CLAUDE.local.md .dev.vars; do
		if [ -f "$main_checkout/$f" ] && [ ! -f "$f" ]; then
			cp "$main_checkout/$f" "$f"
		fi
	done

	# Share expo run's dev-build cache with the main checkout, so a new worktree skips the native build.
	if [ ! -e .expo/build-cache ]; then
		mkdir -p .expo "$main_checkout/.expo/build-cache"
		ln -s "$main_checkout/.expo/build-cache" .expo/build-cache
	fi
fi

# Lefthook's post-checkout hook has usually installed already; this skips in that case.
scripts/install-if-lock-changed.sh
