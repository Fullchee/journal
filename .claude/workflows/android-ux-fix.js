export const meta = {
  name: "android-ux-fix",
  description:
    "Fix every Android UX audit finding in five file-disjoint worktree batches, review each, squash-merge to main and recheck",
  whenToUse: "After android-ux-audit writes a report: turn its findings into shipped fixes",
  phases: [
    { title: "Fix", detail: "One worktree agent per batch; each owns its files" },
    {
      title: "Review",
      detail: "A reviewer checks each branch against its findings and repairs gaps in place",
    },
    {
      title: "Merge",
      detail: "Squash-merge each branch to main, run the full check, push, re-shoot",
    },
  ],
};

// args: { reportPath: repo-relative audit report, captureScript: absolute path to the audit's capture.mjs,
//         shotsDir: absolute dir for after-fix screenshots }
const REPORT = args.reportPath;
const CAPTURE = args.captureScript;
const SHOTS = args.shotsDir;

// Each batch owns its files outright, so the branches merge without conflicts.
// A batch may add new files and tests; it edits no file another batch owns.
const BATCHES = [
  {
    key: "controls",
    commit: "fix(ui): size shared controls for touch and tighten their strokes",
    owns: "src/ui/components/button.tsx, switch.tsx, input.tsx, dialog.tsx; src/components/modal-header.tsx; src/components/form-fields.tsx (or wherever the shared chips live); the Switch call sites in habit-form.tsx and connection-form.tsx; DESIGN.md",
    findings: [
      "[P1] Shared Button targets are 32-40dp and shrink at 640dp+. Make every size at least 48dp tall on native, drop the sm: shrink (keep it at most for pointer-driven web), and make a caller's h-* win. Update DESIGN.md touch-min to 3rem (48dp) and say why in one line.",
      "[P2] Switch is 18x32dp and its label does nothing: make the whole label row the target (role switch, min 48dp), keeping the API backward compatible or updating habit-form.tsx and connection-form.tsx.",
      "[P2] Empty cells and chips outlined at about 1.5:1: tappable strokes use border-input. (habit-week.tsx and habit-card.tsx belong to the habits batch; fix only form-fields here.)",
      "[P3] Focus ring 50% green at about 2.3:1: use a solid ring token in button, input, switch.",
      "[P3] Chips are pills, not 3px near-square (form-fields only).",
    ],
  },
  {
    key: "shell",
    commit: "fix(app): honour Android insets, Back, and bottom Undo across the app shell",
    owns: "src/components/screen.tsx, two-pane.tsx, nav-row.tsx, modal-frame*.tsx; src/app/_layout.tsx; src/app/(tabs)/_layout.tsx; src/ui/components/toast.tsx, toast.web.tsx, undo-toast.ts; use-alarm-schedule.android.ts; app.json",
    findings: [
      "[P1] Keyboard and bottom insets missing: give Screen the bottom safe-area inset and one keyboard-aware scroll so every form using Screen keeps the focused field and a pinned Save visible. Follow the pattern Today and log.tsx already use, or a library Expo supports for SDK in package.json (check the docs). Other batches will not add their own keyboard handling, so Screen must cover one-off, log-entry, close-period and weekly-review.",
      "[P2] Undo toast lasts 5 s at the top: bottom-centre above the tab bar, 10 s, and no auto-dismiss while a screen reader is on. Keep the undo-toast API; other batches call it.",
      "[P2] Inactive tab labels 10px at about 3.2:1: tints from tokens (graphite inactive, leaf green active), label 12px or more.",
      "[P2] Tab labels scale without limit in a fixed-height bar: maxFontSizeMultiplier about 1.3 or let the bar grow.",
      '[P2] Crash screen is black in light mode with the raw error: a themed ErrorBoundary with a plain sentence, Retry and "Back to Today"; keep Sentry reporting.',
      "[P2] Two-pane: no selected row, blank detail, stray Up arrow: selected state on NavRow, open the first item by default on wide screens, hide Up on the first detail.",
      "[P3] Predictive Back off in app.json, undocumented: read the Expo docs for this SDK and react-native-screens support; enable it if supported, otherwise add the reason to docs/eas.md or an ADR.",
      "[P3] Notification permission asked at first launch: ask in context, the first time the owner sets an Alarm or reminder.",
    ],
  },
  {
    key: "habits",
    commit: "fix(habits): stop the empty start date crash and make Habit rows speak their state",
    owns: "src/core/habit-history.ts and its tests; src/app/habit/**; src/app/(tabs)/habits.tsx; src/ui/components/habit-due-row.tsx, habit-week.tsx, habit-card.tsx, reschedule-sheet.tsx, streak-grid.tsx; src/components/habit-day-detail.tsx, habit-filter-bar.tsx (and any other habit-* component in src/components except habit-form.tsx's Switch call)",
    findings: [
      '[P0] Edit habit and History crash for a Habit with no start date: periodStarts and monthBounds return [] for an empty startDate (or hasHistory requires it); add a src/core test. Reproduce first with the seeded Habits "stretch" and "walk".',
      "[P3] Duration link without params crashes (habit/[id]/duration.tsx): validate params and fall back.",
      '[P2] Overdue Habits turn scarlet with bold "Overdue": graphite or ink with a neutral label; scarlet stays for a weed over its ceiling (Single Red Rule).',
      "[P2] Day strip cells read an ISO date and hide missed/count state: spoken Day plus status, role checkbox with checked state.",
      "[P2] Habit row label drops stage, progress and Streak: drop the override or build a full label.",
      "[P2] One-tap delete of a Duration entry has no Undo: optimistic remove plus the existing undo toast.",
      "[P2] Bottom panels fade in with no handle, swipe or inset (habit-day-detail, reschedule-sheet): slide in, handle with pan-to-dismiss, bottom inset; or a centred dialog.",
      "[P1 part] Raise any hand-sized buttons in habit-due-row and habit-day-detail to 48dp if they override the shared Button size.",
      "[P2] Empty cells and chips outlined at about 1.5:1 in habit-week and habit-card: border-input.",
      "[P3] Time box looks like a button and does nothing: make it plain text or make it open the time.",
      "[P3] Stage filter row clips at 200% and hides the tracker: let it wrap or scroll.",
      "[P3] No press feedback on cells, chips and the Habit name.",
      "[P3] Skip cause shows only on long-press: show it in the cell label or detail.",
    ],
  },
  {
    key: "checkins",
    commit: "fix(check-ins): keep plates, period arrows and the chart readable at large text",
    owns: "src/ui/components/check-in-card.tsx, check-in-chart.tsx, check-in-fields.tsx; src/components/check-in-* (panels, list); src/app/(tabs)/check-ins.tsx; src/components/log-composer.tsx",
    findings: [
      '[P2] 200% text: zone-plate labels read "JPPER"; Log box placeholder cut: cap or shrink-to-fit the plate label, a 2x2 grid at fontScale 1.5+, a shorter placeholder.',
      '[P2] "Next period" arrow pushed off screen at 200%: remove min-w-40, let the label flex and wrap.',
      "[P2] Chart SVG text fixed at 10dp: scale by font scale (capped) or draw labels as RN Text; base 12+.",
      '[P2] Chart reads only "Check-in chart" to TalkBack: a summary label built from the data.',
      "[P2] Empty states state a fact with no next step (check-in-chart, check-ins.tsx): add the reason and one action.",
      '[P2] Check-in rows have no role or edit label: role button and "Edit Check-in, 9:40 AM" when editable.',
      "[P1 part] Raise hand-sized buttons and range chips in check-in-card and check-in-panels to 48dp.",
      '[P3] Check-in "Skip" reuses the Habit Skip word: use a distinct word from GLOSSARY.md or propose one there.',
      "[P3] Check-in search results are dead text: make each open its Check-in.",
      "[P3] Chart tooltip floats on a shadow: hairline frame, no shadow.",
    ],
  },
  {
    key: "records",
    commit: "fix(forms): keep drafts, announce saves, and offer Undo and Retry on records",
    owns: "src/app/close-period.tsx, weekly-review.tsx, one-off.tsx, log-entry.tsx, plan.tsx and the other record screens in src/app; src/app/(tabs)/connections/**; src/app/(tabs)/(notes)/**; src/components/note-body.tsx, connection-list.tsx, weekly-review-days.tsx; src/lib/plan.ts; any new shared draft-guard hook or status Text you create",
    findings: [
      '[P1] Typed text is discarded with no warning: keep drafts per period/week so a Prev/Next or Quarter/Year remount restores them; add the Habit editor\'s usePreventRemove "Discard edits?" guard (src/app/habit/[id]/index.tsx shows it; extract a shared hook only if two or more screens use it); ask before "Draft with AI" replaces text; rewrite GOALS_CHANGED so it no longer tells the owner to switch periods.',
      '[P2] Save errors and "Saved" are not announced: one shared status Text with a polite live region, assertive for errors.',
      "[P2] One-tap delete of a Notes record has no Undo: optimistic remove plus the existing undo toast, more space from Retire.",
      "[P2] Empty states with no next step (connection-list, note-body): reason plus one action.",
      "[P3] Log habits saves silently: show a Receipt or Undo.",
      "[P3] Disabled Save reason sits far away and is silent (one-off, log-entry): put it next to Save and announce it.",
      "[P3] Plan the day: text-only loading and 3 retries before the error: a skeleton or progress row and fail faster.",
      '[P3] Load errors say "try again" with no Retry button (note-body, connection-list).',
      "[P3] Weekly retro day labels lack the heading role.",
      "Do NOT add keyboard handling to these forms: the shell batch makes Screen keyboard-aware. If a form does not render inside Screen, say so in your summary.",
    ],
  },
];

const FIXED = {
  type: "object",
  properties: {
    branch: { type: "string" },
    worktree: { type: "string", description: "absolute path of the worktree holding the branch" },
    commit: { type: "string" },
    done: { type: "array", items: { type: "string" } },
    skipped: { type: "array", items: { type: "string" }, description: "finding plus reason" },
    decisions: { type: "array", items: { type: "string" } },
    checks: { type: "string", description: "which checks ran and their result" },
  },
  required: ["branch", "worktree", "commit", "done", "skipped", "decisions", "checks"],
};

const REVIEWED = {
  type: "object",
  properties: {
    branch: { type: "string" },
    repaired: { type: "array", items: { type: "string" } },
    remaining: { type: "array", items: { type: "string" } },
    checks: { type: "string" },
  },
  required: ["branch", "repaired", "remaining", "checks"],
};

const fixPrompt = (b) => `Fix one batch of findings from the Android UX audit in ${REPORT}.

Setup:
1. You are in a fresh git worktree. Run \`git switch -c ux/${b.key}\`, then \`bun install --frozen-lockfile\`.
2. Read ${REPORT} (the rows below come from it), PRODUCT.md, DESIGN.md, GLOSSARY.md and ~/.claude/skills/impeccable/reference/craft-floor.md and android.md before editing UI.
3. Before touching an Expo or React Native API, read the expo major in package.json and the matching docs.expo.dev page.

You own: ${b.owns}
Edit no file another batch owns. Four other agents fix other files in parallel: controls (shared Button/Switch/Input/DESIGN.md), shell (Screen, layouts, toasts, app.json), habits, checkins, records. Rely on their fixes rather than duplicating them.

Findings to fix:
${b.findings.map((f) => `- ${f}`).join("\n")}

Rules:
- Fix every finding. Decide open design questions yourself, within DESIGN.md and PRODUCT.md, and record each decision in one line.
- Skip a finding only when it needs a native build to verify AND a wrong guess could break the app; say why.
- Every added branch, function and component gets a test; Jest needs 100% coverage.
- Before committing: lint and test only the files you touched (\`bunx oxlint <files>\`, \`bunx jest <tests>\`), \`bun run typecheck\`, \`bun run fallow:changed\`. Fix every failure.
- Never build the APK or start EAS. Don't run the web preview: ports clash with the other agents.
- Commit once on ux/${b.key} with the message: ${b.commit}. Stage only your paths. Don't push.

Return the branch, \`pwd\` of the worktree, the commit hash, what you fixed, what you skipped and why, your decisions, and the check results.`;

const reviewPrompt = (
  b,
  fixed,
) => `Review and repair branch ${fixed.branch} in the worktree ${fixed.worktree} (cd there; work only there).

It should fix these Android UX audit findings (full detail in ${REPORT}):
${b.findings.map((f) => `- ${f}`).join("\n")}

The fixer reported: ${JSON.stringify({ done: fixed.done, skipped: fixed.skipped, decisions: fixed.decisions, checks: fixed.checks })}

1. Read \`git diff origin/main...HEAD\`. For each finding, check the diff really fixes it on Android, not only on web. Check each skip is justified.
2. Check the diff against AGENTS.md and the global coding rules: no edits outside ${b.owns} (new files and tests are fine), no casts of outside JSON, GLOSSARY terms, DESIGN.md rules (One Green Voice, Single Red Rule, no shadows), tests for every new branch.
3. Repair what is missing or wrong yourself. Rerun the checks from the fixer's list on the files you touched. Amend the single commit (\`git commit --amend --no-edit\`) so the branch stays one commit. Don't push.

Return the branch, what you repaired, anything still unfixed with a reason, and the check results.`;

const results = await pipeline(
  BATCHES,
  (b) =>
    agent(fixPrompt(b), {
      label: `fix:${b.key}`,
      phase: "Fix",
      schema: FIXED,
      isolation: "worktree",
    }),
  (fixed, b) => {
    if (!fixed) return null;
    return agent(reviewPrompt(b, fixed), {
      label: `review:${b.key}`,
      phase: "Review",
      schema: REVIEWED,
    }).then((r) => ({
      key: b.key,
      fixed,
      review: r,
    }));
  },
);

const ready = results.filter(Boolean);
const failed = BATCHES.filter((b) => !ready.some((r) => r.key === b.key)).map((b) => b.key);
if (failed.length) log(`No branch from: ${failed.join(", ")}; the merge skips them`);

phase("Merge");
const merge = await agent(
  `Squash-merge the Android UX fix branches into main, check the result, push, and re-shoot the web app.

Branches, in this order (controls and shell first: others rely on them):
${ready
  .sort(
    (a, b) =>
      ["controls", "shell", "habits", "checkins", "records"].indexOf(a.key) -
      ["controls", "shell", "habits", "checkins", "records"].indexOf(b.key),
  )
  .map((r) => `- ${r.fixed.branch} (worktree ${r.fixed.worktree})`)
  .join("\n")}

1. \`git fetch origin\`, then \`git worktree add -b ux/merge ../journal-native.ux-merge origin/main\`; work only there; \`bun install --frozen-lockfile\`.
2. For each branch: \`git merge --squash <branch>\`, then commit with that branch's own commit message (\`git log -1 --format=%B <branch>\`). Run git commands one at a time. On a conflict, keep both sides' intent; never drop a fix. After each merge scan \`git diff HEAD~1\` for repeated lines (the weave merge driver duplicates declarations).
3. On the merged tree run \`bun run check\` (lint, typecheck, test, fallow). Fix every failure in a separate \`fix:\` commit.
4. Re-shoot: \`scripts/web-preview.sh node ${CAPTURE}\` with the capture script's output dir pointed at ${SHOTS} (edit a copy of the script, not the original, if it hard-codes its out dir). Open the shots for /, /habits, /habit/stretch, /check-ins, /close-period and /notes at 412-light, 412-text200 and 1440-light. Confirm the P0 crash is gone, buttons look 48dp, tab labels read, plates don't clip.
5. Push: \`git log --oneline origin/main..HEAD\` must list only these commits; then \`git push origin HEAD:main\` and read the result with \`grep -E -- '->|rejected|error:'\`. If rejected, fetch, rebase, rerun the check, push again.
6. After a successful push, in a later command, remove ../journal-native.ux-merge and every ux/* worktree and branch listed above (\`git worktree remove --force\` in the background).

Return: the pushed commits, the check result, what the screenshots show for each confirmed fix, and anything still broken.`,
  { label: "merge:main", phase: "Merge" },
);

return {
  merge,
  batches: ready.map((r) => ({
    key: r.key,
    done: r.fixed.done.length,
    skipped: r.fixed.skipped,
    decisions: r.fixed.decisions,
    remaining: r.review ? r.review.remaining : ["review did not run"],
  })),
  failed,
};
