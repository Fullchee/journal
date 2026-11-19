#!/usr/bin/env bash
# Copy the repo-agnostic setup files from this repo, their one source, into a sibling repo (rex-mobile).
# Usage: scripts/sync-shared-setup.sh <target-repo>. Review and commit the result in the target repo.
set -euo pipefail

target="$(cd "${1:?usage: scripts/sync-shared-setup.sh <target-repo>}" && pwd)"
cd "$(dirname "$0")/.."

files=(
	scripts/install-if-lock-changed.sh
	scripts/prune-worktrees.sh
	.claude/hooks/format-edited-file.sh
)

for f in "${files[@]}"; do
	mkdir -p "$target/$(dirname "$f")"
	cp "$f" "$target/$f"
done

git -C "$target" status --short -- "${files[@]}"
