---
name: compare-rex-mobile
description: Compare this repo's setup (lint, hooks, CI, TypeScript, Jest, agent config) with the rex-mobile checkout at `$REX_MOBILE_DIR` since the last check, update docs/rex-mobile-parity.md, and ask or record which repo adopts each difference. Use when asked to compare with rex-mobile, check setup drift, answer the parity questions issue, or when the weekly Orca automation runs it.
---

# Compare rex-mobile

`docs/rex-mobile-parity.md` records every setup difference and the commit each repo was last checked at. A run reads only the setup files changed since those commits.

rex-mobile is read-only here: it is a work repo with PR review. Record what it should copy; never edit or commit there.

Every new difference becomes a **question** for the owner: adopt in journal, adopt in rex-mobile, or keep different. Questions live in one open GitHub issue titled `rex-mobile parity questions`. Run every `gh` command as `GH_TOKEN=$(gh auth token --user Fullchee) gh … -R Fullchee/journal`.

The run is **scheduled** when the prompt says `scheduled` (the Orca automation): the owner is away, so it asks on the issue. Otherwise it is **interactive**: it applies the answers first, then compares.

## Steps

1. **Interactive only: apply answers.** Find the open questions issue and read it:

   ```bash
   gh issue list -R Fullchee/journal --state open --search 'in:title "rex-mobile parity questions"' --json number -q '.[0].number'
   gh issue view <n> -R Fullchee/journal --comments
   ```

   For each question the owner answered on the issue, record the answer in the doc (table below). Ask the owner each unanswered one now, one at a time, and record that answer too. Done when every question has an answer recorded. Then close the issue with a comment listing the decisions.

   | Answer    | Doc change                                                                                |
   | --------- | ----------------------------------------------------------------------------------------- |
   | `journal` | Set Suggested to `→ journal (decided)`. Port it here in this session if the owner agrees. |
   | `rex`     | Set Suggested to `→ rex (decided)`. Never edit rex-mobile.                                |
   | `keep`    | Move the row to "Differences that stay"; the owner's reason goes in "Why it stays".       |

2. Fetch both repos. `mise.local.toml` sets `REX_MOBILE_DIR`; stop if it is unset or the folder is missing.

   ```bash
   R=${REX_MOBILE_DIR:?set REX_MOBILE_DIR in mise.local.toml}
   git fetch -q origin && git -C "$R" fetch -q origin
   ```

3. Read the last-checked commits and the setup paths from the doc.

   ````bash
   doc=docs/rex-mobile-parity.md
   j_old=$(grep -m1 '^| journal-native' "$doc" | grep -oE '[0-9a-f]{40}')
   r_old=$(grep -m1 '^| rex-mobile' "$doc" | grep -oE '[0-9a-f]{40}')
   setup_paths() { awk '/^```text/{f=1;next} /^```/{f=0} f' "$doc"; }
   ````

4. List what changed in each repo.

   ```bash
   setup_paths | xargs git diff --stat "$j_old" origin/main --
   setup_paths | xargs git -C "$R" diff --stat "$r_old" origin/main --
   ```

   Both empty: skip to step 7.

5. For each changed file, read its diff (`git diff <old> origin/main -- <file>`) and open its counterpart in the other repo at `origin/main` (`git -C "$R" show origin/main:<file>`). Skip changes that are only product code or dependency bumps.

6. Update the doc:
   - **New difference**: add a row to the matching "To align" table with both sides and a suggested direction (`→ rex`, `→ journal`, `Pick one` or `Decide`). Note it as a new question for step 9.
   - **Difference closed**: delete its row.
   - **Row changed**: rewrite both sides.
   - **"Differences that stay"**: never move or delete a row; the owner decides. Update a side only if its facts changed.
   - **Shared files**: if a file in "Already shared" changed in rex-mobile, add a "To align" row: this repo is the source, so the change belongs here first.
   - **New setup file** in either repo: add its path to the "Setup paths" block.

7. Set both rows of the "Last checked" table to `git rev-parse origin/main` of each repo and today's date.

8. Format, then commit straight to `main` and push:

   ```bash
   node_modules/.bin/oxfmt docs/rex-mobile-parity.md
   git commit -m "docs(parity): compare with rex-mobile at <short rex sha>" -- docs/rex-mobile-parity.md
   git push origin HEAD:main 2>&1 | grep -E -- '->|rejected|error:'
   ```

   With no doc changes beyond the hashes, use the subject `docs(parity): no setup changes since <date>`. If step 1 recorded answers, say so in the subject. If the push is rejected, `git pull --rebase origin main` and push again.

9. **Scheduled only: ask.** Skip when step 6 added no row. Otherwise write one question per new row, numbered after the issue's last question:

   ```markdown
   **Q<n>. <Topic>** (<table heading>)

   - journal: <journal side>
   - rex-mobile: <rex-mobile side>
   - Suggested: <direction and its reason>

   Answer `journal`, `rex` or `keep`.
   ```

   Post them as a comment on the open questions issue; with none open, create it with `--label question` and the questions as its body. Its body starts with: "Answer each question in a comment (e.g. `Q1 rex, Q2 keep: reason`), or run `/compare-rex-mobile` to answer them live."

## Report

- Answers recorded, grouped by `journal`, `rex` and `keep`.
- Rows added, removed and changed, grouped by "To align" table.
- The questions issue link, when the run posted questions.
- The top "→ journal" row, as the next action.
