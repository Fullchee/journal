#!/usr/bin/env bash
# Remove worktrees and branches already in main or behind a merged PR, then list unmerged branches that look abandoned.
# Run as `wt cleanup`; a SessionStart hook in .claude/settings.json also runs it.
set -euo pipefail

min_age="${PRUNE_MIN_AGE:-3d}"
idle_days="${PRUNE_IDLE_DAYS:-14}"

cd "$(git rev-parse --show-toplevel)"

# Squash merges and deleted remote branches are only visible after a fetch.
git fetch --prune --quiet origin || echo "prune-worktrees: fetch failed; using local refs" >&2

# prune treats the current worktree like any other, so lock it to keep this session's directory.
main_checkout="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
lock_reason="prune-worktrees: in use"
# A run killed by the hook timeout skips its EXIT trap, so a lock with this reason is a leftover to reclaim.
if [ "$PWD" != "$main_checkout" ] && {
	git worktree lock --reason "$lock_reason" "$PWD" 2>/dev/null ||
		[ "$(cat "$(git rev-parse --git-dir)/locked" 2>/dev/null)" = "$lock_reason" ]
}; then
	trap 'git worktree unlock "$PWD"' EXIT
fi

# prune skips locked worktrees, uncommitted changes (untracked files included) and branches not yet in main.
wt step prune --yes --min-age="$min_age"

# A merged PR whose head is the worktree's HEAD proves the branch holds no new work, so it skips the age guard.
if merged_heads="$(gh pr list --state merged --limit 100 --json headRefName,headRefOid --jq '.[] | "\(.headRefName)\t\(.headRefOid)"')"; then
	git worktree list --porcelain | awk '
		/^worktree / { path = substr($0, 10); head = ""; branch = ""; locked = 0 }
		/^HEAD / { head = $2 }
		/^branch / { branch = substr($2, 12) }
		/^locked/ { locked = 1 }
		/^$/ { if (branch != "" && !locked) print branch "\t" head }
	' | { grep -Fxf <(printf '%s\n' "$merged_heads") || true; } | cut -f1 | while read -r branch; do
		# remove refuses a worktree with uncommitted changes, so in-progress edits survive.
		wt remove --yes "$branch" || true
	done
else
	echo "prune-worktrees: gh pr list failed; skipping merged-PR check" >&2
fi

# The weave merge driver leaves its temp files at the root; a day-old one belongs to no running merge.
find "$main_checkout" -maxdepth 1 -name '.merge_file_*' -mmin +1440 -delete

gone="$(git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads | sed -n 's/ \[gone\]$//p')"
cutoff="$(date -u -v-"${idle_days}"d +%Y-%m-%dT%H:%M:%SZ)"

wt list --branches --format=json | jq -r --arg gone "$gone" --arg cutoff "$cutoff" '
	($gone | split("\n")) as $gone_list
	| .items[]
	| select(.worktree.main != true and .default_branch.integration == null)
	| if (.branch | IN($gone_list[])) then "remote gone, unmerged: \(.branch)"
	  elif .head.committed_at < $cutoff then "idle since \(.head.committed_at[:10]), unmerged: \(.branch)"
	  else empty end
'
