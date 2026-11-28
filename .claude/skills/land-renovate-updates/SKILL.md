---
name: land-renovate-updates
description: Land each update on the Renovate Dependency Dashboard (#1) that passes `bun run check`, one squash commit per update, and record why the rest failed. Run weekly by an Orca automation.
disable-model-invocation: true
---

# Land Renovate updates

Renovate lists pending updates on the Dependency Dashboard, issue #1. This skill applies each one in this worktree, keeps the ones that go **green** under `bun run check`, and reports the **red** ones on #1. Run every `gh` command as `GH_TOKEN=$(gh auth token --user Fullchee) gh … -R Fullchee/journal`.

An **update** is one dashboard checkbox line, a single package or a Renovate group (`oxc tooling`, `dev dependencies`). The packages in a group move together, in one commit.

## Steps

1. Read the merge rules in `AGENTS.md` ("Agent workflow"). Today they say: squash-merge to `main`, no PRs. If they now say to open PRs, open one PR per green update instead of pushing to `main` in step 5.

2. List the updates. Done when you have, for each update, its packages and new versions.

   ```bash
   gh issue view 1 -R Fullchee/journal --json body -q .body > /tmp/dashboard.md
   grep -E -- '- \[[ x]\] <!-- [a-z-]+-branch=' /tmp/dashboard.md   # one line per update
   grep -F 'Updates:' /tmp/dashboard.md                              # package, current → new
   ```

   An open Renovate branch or PR for an update (`gh pr list --author app/renovate`, `git ls-remote origin 'refs/heads/renovate/*'`) shows the exact `package.json` change: read it with `git diff origin/main...origin/<branch> -- package.json`.

   No updates: reply "No Renovate updates" and stop.

3. For each update, one at a time from a clean tree:
   1. Apply it. Write the new version in `package.json` in the form the old one used (keep `^`, `~` or an exact pin), then `bun install`. For an Expo or React Native package (the Expo SDK list in `renovate.json5`), run `bunx expo install <pkg>` instead, so the SDK picks the version.
   2. `bun install` refuses a version younger than `minimumReleaseAge` (`bunfig.toml`): that update is red, reason "too new". Never lower the setting.
   3. Run `bun run check`. Read the whole output of a failed step.
   4. **Green**: commit only `package.json` and `bun.lock`, with Renovate's line as the subject: `git commit -m "chore(deps): update oxc tooling (oxfmt, oxlint)" -- package.json bun.lock`.
   5. **Red**: note the failing step and its first error, then `git restore package.json bun.lock && bun install`.

   Done when every update is either committed or noted with a reason.

4. A native package (one with an `android/` folder, or labelled `native-risk` in `renovate.json5`) lands like any other. CI's fingerprint check flags the change and the owner rebuilds the APK; never build it here.

5. Push the green commits:

   ```bash
   git log --oneline @{u}..
   ```

   Then, as its own command:

   ```bash
   git push origin HEAD:main 2>&1 | grep -E -- '->|rejected|error:'
   ```

   If rejected, `git fetch origin main`, `git rebase FETCH_HEAD`, rerun `bun run check`, and push again.

6. Refresh #1. Tick its "run again" box so Renovate redraws the dashboard without the landed updates:

   ```bash
   sed 's/- \[ \] <!-- manual job -->/- [x] <!-- manual job -->/' /tmp/dashboard.md > /tmp/dashboard.new.md
   gh issue edit 1 -R Fullchee/journal --body-file /tmp/dashboard.new.md
   ```

   With red updates, comment on #1: one bullet per update, its failing step and first error.

## Report

- Landed: one bullet per update, with its commit SHA.
- Red: one bullet per update, with its reason.
- Whether any landed update changes native code (the owner then rebuilds the APK).
