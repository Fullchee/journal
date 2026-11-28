---
name: log-session-lessons
description: Review today's Claude sessions in this repo, add each new lesson to the right AGENTS.md failure log, and list cleanup candidates. Run every evening by an Orca automation.
disable-model-invocation: true
---

# Log session lessons

A **lesson** is a mistake an agent made in this repo, or a correction the owner gave, that a written rule would have prevented. This skill finds today's lessons and writes each as one failure-log line. It deletes nothing and edits only `AGENTS.md` files.

## Steps

1. List today's session transcripts for this repo. Older journal repos (`journal-native`) and other repos are out of scope; skip this run's own transcript.

   ```bash
   find ~/.claude/projects -maxdepth 1 -type d \( -name '*-personal-projects-journal*' -o -name '*-orca-workspaces-journal-*' \) ! -name '*journal-native*' \
     -exec find {} -maxdepth 1 -name '*.jsonl' -newermt "$(date +%F)" \;
   ```

   None: reply "No sessions today" and stop.

2. Read each transcript's turns, not its tool output. The owner's messages carry the corrections:

   ```bash
   jq -r 'select(.type=="user" and (.message.content|type)=="string") | .message.content' <file>
   jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' <file>
   ```

   For a candidate, read the tool calls around it in the transcript to learn what went wrong. `orca search "<words>" --since <today>` finds the same mistake in other sessions.

   Signals: the owner says "no", "wrong", "still broken", "I told you"; a step redone after a failed hook, CI run or push; an agent writing "I should have". Done when every transcript is read and each lesson is listed with its session id and a short quote.

3. Drop lessons already covered: grep `AGENTS.md`, `CLAUDE.local.md`, `worker/AGENTS.md` and `modules/journal-android/AGENTS.md` for the rule. Drop generic git, shell or library knowledge any model has. Keep a lesson that recurred in two sessions, or one the owner stated as a rule.

4. Write each remaining lesson as one line, following the failure-log rules in `AGENTS.md`:
   - **Log**: the folder's `AGENTS.md` when it applies to one folder (`worker`, `modules/journal-android`); otherwise the root `AGENTS.md`. A lesson that holds in any repo goes in the summary for the owner, not here.
   - **Line**: imperative, the correct behaviour, then the reason after a colon, then `(YYYY-MM-DD)`.
   - **Place**: under the matching `###` heading, at a random spot in the group, not the end.

   Keep each `AGENTS.md` under 500 lines (`wc -l`); when one would pass that, list it in the summary instead.

5. List **cleanup candidates**, without acting on any:
   - Worktrees whose branch is merged or gone: `git worktree list`, `git branch --merged origin/main`.
   - Remote branches already merged: `git branch -r --merged origin/main`.
   - Docs naming a path that no longer exists.

6. No new lines and no candidates: reply "No new lessons" and stop. The run changes nothing.

7. Commit the log lines in one commit. The body cites each line's source:

   ```text
   docs(agents): log lessons from <YYYY-MM-DD> sessions

   - <line, shortened>: session <id>, "<owner's quote or the error>"
   ```

   Commit with `git commit -F <msg file> -- <each AGENTS.md you changed>`. Run `git log --oneline @{u}..` as its own command, then `git push origin HEAD:main 2>&1 | grep -E -- '->|rejected|error:'`. If rejected, `git fetch origin main`, `git rebase FETCH_HEAD`, push again.

8. Post the summary on the open issue titled `Daily session review` (create it with `--label documentation` if none is open). Run `gh` as `GH_TOKEN=$(gh auth token --user Fullchee) gh … -R Fullchee/journal`. The comment holds:
   - The commit link and its lines.
   - Lessons for the global log or over the 500-line cap.
   - Cleanup candidates, at most 5 per group.

## Report

The issue comment link, or "No new lessons".
