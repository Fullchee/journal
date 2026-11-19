---
name: compare-rex-mobile
description: Compare this repo's setup (lint, hooks, CI, TypeScript, Jest, agent config) with the rex-mobile checkout at `$REX_MOBILE_DIR` since the last check, and update docs/rex-mobile-parity.md. Use when asked to compare with rex-mobile, check setup drift, or when the weekly Orca automation runs it.
---

# Compare rex-mobile

`docs/rex-mobile-parity.md` records every setup difference and the commit each repo was last checked at. A run reads only the setup files changed since those commits.

rex-mobile is read-only here: it is a work repo with PR review. Record what it should copy; never edit or commit there.

## Steps

1. Fetch both repos. `mise.local.toml` sets `REX_MOBILE_DIR`; stop if it is unset or the folder is missing.

   ```bash
   R=${REX_MOBILE_DIR:?set REX_MOBILE_DIR in mise.local.toml}
   git fetch -q origin && git -C "$R" fetch -q origin
   ```

2. Read the last-checked commits and the setup paths from the doc.

   ````bash
   doc=docs/rex-mobile-parity.md
   j_old=$(grep -m1 '^| journal-native' "$doc" | grep -oE '[0-9a-f]{40}')
   r_old=$(grep -m1 '^| rex-mobile' "$doc" | grep -oE '[0-9a-f]{40}')
   setup_paths() { awk '/^```text/{f=1;next} /^```/{f=0} f' "$doc"; }
   ````

3. List what changed in each repo.

   ```bash
   setup_paths | xargs git diff --stat "$j_old" origin/main --
   setup_paths | xargs git -C "$R" diff --stat "$r_old" origin/main --
   ```

   Both empty: skip to step 6.

4. For each changed file, read its diff (`git diff <old> origin/main -- <file>`) and open its counterpart in the other repo at `origin/main` (`git -C "$R" show origin/main:<file>`). Skip changes that are only product code or dependency bumps.

5. Update the doc:
   - **New difference**: add a row to the matching "To align" table with both sides and a suggested direction (`→ rex`, `→ journal`, `Pick one` or `Decide`).
   - **Difference closed**: delete its row.
   - **Row changed**: rewrite both sides.
   - **"Differences that stay"**: never move or delete a row; the owner decides. Update a side only if its facts changed.
   - **Shared files**: if a file in "Already shared" changed in rex-mobile, add a "To align" row: this repo is the source, so the change belongs here first.
   - **New setup file** in either repo: add its path to the "Setup paths" block.

6. Set both rows of the "Last checked" table to `git rev-parse origin/main` of each repo and today's date.

7. Format, then commit straight to `main` and push:

   ```bash
   node_modules/.bin/oxfmt docs/rex-mobile-parity.md
   git commit -m "docs(parity): compare with rex-mobile at <short rex sha>" -- docs/rex-mobile-parity.md
   git push origin HEAD:main 2>&1 | grep -E -- '->|rejected|error:'
   ```

   With no doc changes beyond the hashes, use the subject `docs(parity): no setup changes since <date>`. If the push is rejected, `git pull --rebase origin main` and push again.

## Report

- Rows added, removed and changed, grouped by "To align" table.
- The top "→ journal" row, as the next action.
