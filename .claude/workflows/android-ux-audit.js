export const meta = {
  name: "android-ux-audit",
  description:
    "Research Android UX practice, screenshot the web app at phone width, audit each screen group, verify findings, write a report",
  whenToUse:
    "Check the app against Material 3 and Android quality guidance, using the fast web build instead of an emulator",
  phases: [
    {
      title: "Research",
      detail: "Material 3, Android core app quality, accessibility: one checklist doc",
    },
    { title: "Capture", detail: "Seeded web preview, 412px light and dark, plus 1440px" },
    { title: "Audit", detail: "One auditor per screen group against the checklist" },
    { title: "Verify", detail: "A skeptic per group refutes weak findings" },
    { title: "Report", detail: "Scored impeccable-style audit report" },
  ],
};

// args: { outDir: absolute scratch dir for shots and drafts, reportPath: absolute report path,
//         checklistPath: docs/research/android-ux-practices.md as an absolute path,
//         checklistExists: true to reuse that checklist, refreshResearch?: true to redo it }
const OUT = args.outDir;
const CHECKLIST = args.checklistPath;
const REPORT = args.reportPath;

const GROUPS = [
  {
    key: "shell",
    title: "App shell, navigation and shared UI",
    routes: ["/", "/settings", "/sign-in"],
    files:
      "src/app/_layout.tsx, src/app/(tabs)/_layout.tsx, src/app/settings.tsx, src/app/sign-in.tsx, src/ui/components/**, src/ui/tokens.css",
    focus:
      "navigation bar vs rail by width, system Back and Escape, top app bar, touch targets, focus rings, theming tokens, dark scheme, font scaling, snackbars vs toasts, dialogs vs sheets",
  },
  {
    key: "today",
    title: "Today and logging flows",
    routes: ["/", "/log", "/log-entry", "/one-off", "/plan", "/close-period"],
    files:
      "src/app/(tabs)/index.tsx, src/app/log.tsx, src/app/log-entry.tsx, src/app/one-off.tsx, src/app/plan.tsx, src/app/close-period.tsx, the components they import from src/components",
    focus:
      "one primary action per screen (FAB or filled button), IME and keyboard handling, form fields, feedback after save, low-capacity use",
  },
  {
    key: "habits",
    title: "Habits",
    routes: [
      "/habits",
      "/habit/stretch",
      "/habit/walk",
      "/habit/walk/duration",
      "/habit/stretch/done",
      "/habit/stretch/history",
    ],
    files:
      "src/app/(tabs)/habits.tsx, src/app/habit/**, the components they import from src/components",
    focus:
      "list rows, swipe or long-press affordances, the seven-day strip touch targets, detail screen structure, modality of done/duration screens",
  },
  {
    key: "records",
    title: "Check-ins, Connections, Notes and reviews",
    routes: ["/check-ins", "/connections", "/notes", "/library", "/weekly-review"],
    files:
      "src/app/(tabs)/check-ins.tsx, src/app/(tabs)/connections/**, src/app/(tabs)/(notes)/**, src/app/weekly-review.tsx, every other src/app route no group lists (audit those from source), the components they import",
    focus:
      "list-detail pattern, empty states, charts accessibility, reading layout, list-detail two-pane on wide screens",
  },
];

const ALL_ROUTES = [...new Set(GROUPS.flatMap((g) => g.routes))];
const VARIANTS = ["412-light", "412-dark", "412-text200", "1440-light"];

const SHARED_RULES = `
Ground rules:
- Read PRODUCT.md and DESIGN.md first. DESIGN.md's explicit choices win over Material defaults: Alegreya fonts, small-caps labels, flat hairline depth (no elevation), near-square corners, no manual theme toggle, the top tab bar on wide web. Never report a documented choice as a finding; list it under "documented deviations" only if it hurts an Android user in a way DESIGN.md did not weigh.
- Use GLOSSARY.md terms in any copy you quote or suggest.
- The web build stands in for Android. What the web cannot show (predictive Back, edge-to-edge insets, TalkBack, sp font scaling, haptics), check in the source instead (BackHandler, react-native-safe-area-context, accessibilityLabel/role/state, allowFontScaling, maxFontSizeMultiplier) and say the evidence came from source.
- Read-only: never edit files in the repo.`;

const FINDINGS = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "group-key plus a short slug" },
          severity: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
          category: {
            type: "string",
            enum: ["Accessibility", "Performance", "Theming", "Conformance", "Adaptivity"],
          },
          title: { type: "string" },
          location: { type: "string", description: "route plus file:line" },
          evidence: { type: "string", description: "screenshot path and/or code quote; say which" },
          guideline: { type: "string", description: "the checklist item or Material/Android rule" },
          impact: { type: "string" },
          recommendation: { type: "string" },
          command: { type: "string", description: "one /impeccable command" },
        },
        required: [
          "id",
          "severity",
          "category",
          "title",
          "location",
          "evidence",
          "guideline",
          "impact",
          "recommendation",
          "command",
        ],
      },
    },
    positives: { type: "array", items: { type: "string" } },
    deviations: { type: "array", items: { type: "string" } },
  },
  required: ["findings", "positives", "deviations"],
};

const VERDICTS = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          keep: { type: "boolean" },
          severity: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
          reason: { type: "string" },
        },
        required: ["id", "keep", "severity", "reason"],
      },
    },
  },
  required: ["verdicts"],
};

const CAPTURE = {
  type: "object",
  properties: {
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          route: { type: "string" },
          variant: {
            type: "string",
            description: "e.g. 412-light, 412-dark, 412-text200, 1440-light",
          },
          path: { type: "string" },
        },
        required: ["route", "variant", "path"],
      },
    },
    problems: {
      type: "array",
      items: { type: "string" },
      description: "console errors, failed requests, empty or broken screens",
    },
  },
  required: ["shots", "problems"],
};

// Research and capture don't depend on each other.
const [research, capture] = await parallel([
  () => {
    if (!args.refreshResearch && args.checklistExists) {
      log(`Reusing ${CHECKLIST}; pass refreshResearch: true to redo it`);
      return Promise.resolve("reused");
    }
    return agent(
      `Research what makes a good Android app experience, then write a checklist an auditor can apply to screenshots and React Native source.

Sources, primary first: m3.material.io (navigation bar/rail, top app bar, FAB, buttons, chips, dialogs, bottom sheets, snackbars, lists, text fields, color roles, type scale, motion, accessibility), developer.android.com "Core app quality" and "Large screen app quality" guidelines, developer.android.com accessibility (touch targets, content labels, font scaling, TalkBack), predictive Back and edge-to-edge guidance (Android 15/16 enforce edge-to-edge), Android Vitals basics (startup, jank). Add evidence on mobile UX for users with ADHD or low energy only if a credible source exists.

Write ${CHECKLIST} as Markdown:
- One section per area: Navigation & Back, Layout & insets, Touch & gestures, Components, Feedback & errors, Typography & scaling, Color & theme, Motion, Accessibility, Adaptive (wide screens), Performance.
- Each item: one testable sentence, tagged [screenshot], [source] or [both] for how an auditor verifies it from a web build plus source, and a source link.
- A short "Web build can't show" section listing what needs the emulator.
- Keep it under 200 lines. Match the house style of docs/research/*.md (read two of them).

Return the file path and the number of items.`,
      { label: "research:android-practice", phase: "Research" },
    );
  },
  () =>
    agent(
      `Screenshot the journal web app for an Android UX audit. Save everything under ${OUT}/shots.

1. Read .claude/skills/screenshot-web/SKILL.md and scripts/screenshot-web.ts. That script only does light mode at fixed widths, so write your own Playwright script at ${OUT}/capture.mjs. Load Playwright with createRequire(process.cwd() + '/package.json')('playwright') so it resolves from the repo.
2. For each route below, capture:
   - 412x915 light, deviceScaleFactor 2, isMobile true, hasTouch true (a common Android phone)
   - 412x915 dark (colorScheme: 'dark')
   - 412x915 light with the root font size doubled (document.documentElement.style.fontSize = '200%') to mimic a large font scale; full page
   - 1440x900 light (the wide web layout)
   Name files <route-slug>-<variant>.png, where the slug is the route with each non-word character as _ and leading _ stripped ("root" for /), and the variants are ${VARIANTS.join(", ")}. Wait for network idle plus 1s before each shot. Record console errors, failed requests and HTTP 4xx/5xx per route.
3. Run it once with: scripts/web-preview.sh node ${OUT}/capture.mjs  (it sets PREVIEW_URL and stops the servers after). If a port is busy, report it and stop; don't kill other sessions' servers.
4. Open a few PNGs to confirm they are not blank. Note any route that renders an error, sign-in wall or empty state.

Routes: ${ALL_ROUTES.join(" ")}

Never edit files in the repo.`,
      { label: "capture:web-412", phase: "Capture", schema: CAPTURE },
    ),
]);

if (!capture || capture.shots.length === 0) {
  log("Capture failed; auditing from source only");
}
const shots = capture ? capture.shots : [];
log(
  `Checklist: ${research ? "ready" : "MISSING"}; ${shots.length} screenshots; ${capture ? capture.problems.length : 0} capture problems`,
);

// Each group audits as soon as research and capture finish, then its skeptic runs without waiting on other groups.
const results = await pipeline(
  GROUPS,
  (group) => {
    // Derive paths from the naming contract: the capture agent's own list came back abridged once.
    const slug = (route) => route.replaceAll(/\W/g, "_").replace(/^_+/, "") || "root";
    const groupShots = group.routes.flatMap((route) =>
      VARIANTS.map((variant) => ({
        route,
        variant,
        path: `${OUT}/shots/${slug(route)}-${variant}.png`,
      })),
    );
    return agent(
      `Audit the "${group.title}" screens of this Expo app against Android UX practice.
${SHARED_RULES}

Inputs:
- Checklist: ${CHECKLIST}. Apply every item that fits these screens.
- Impeccable's native audit rubric: ~/.claude/skills/impeccable/reference/audit.native.md and android.md beside it.
- Screenshots (open each with Read): ${groupShots.map((s) => `${s.variant} ${s.route}: ${s.path}`).join("; ") || "none, audit from source"}
- Source: ${group.files}
- Focus for this group: ${group.focus}

Capture problems seen: ${capture ? capture.problems.join(" | ") || "none" : "capture did not run"}

Report each real issue once, with screenshot or file:line evidence. Use P0-P3 as audit.native.md defines them; keep P3s to three at most. Also list what works well (positives) and documented deviations.`,
      { label: `audit:${group.key}`, phase: "Audit", schema: FINDINGS },
    );
  },
  (audit, group) => {
    if (!audit || audit.findings.length === 0) return { group, audit, verdicts: [] };
    return agent(
      `You are a skeptic. Try to refute each finding below about the "${group.title}" screens. Default to keep=false when the evidence is thin.
${SHARED_RULES}

For each finding: open the cited screenshot or file:line and confirm the issue exists; check DESIGN.md does not deliberately choose it; check the cited guideline really says that (checklist at ${CHECKLIST}). Correct the severity if it is off. A web-only artefact that the Android build does not show is refuted.

Findings:
${JSON.stringify(audit.findings, null, 2)}`,
      { label: `verify:${group.key}`, phase: "Verify", schema: VERDICTS },
    ).then((v) => ({ group, audit, verdicts: v ? v.verdicts : [] }));
  },
);

const kept = [];
const dropped = [];
const positives = [];
const deviations = [];
for (const r of results.filter(Boolean)) {
  if (!r.audit) continue;
  positives.push(...r.audit.positives);
  deviations.push(...r.audit.deviations);
  const byId = new Map(r.verdicts.map((v) => [v.id, v]));
  for (const f of r.audit.findings) {
    const v = byId.get(f.id);
    // A finding the skeptic never judged stays in, flagged, rather than vanishing silently.
    if (!v) kept.push({ ...f, verified: false });
    else if (v.keep) kept.push({ ...f, severity: v.severity, verified: true });
    else dropped.push({ id: f.id, title: f.title, reason: v.reason });
  }
}
log(`${kept.length} findings kept, ${dropped.length} refuted`);

phase("Report");
const report = await agent(
  `Write the Android UX audit report to ${REPORT}.

Follow the report skeleton in ~/.claude/skills/impeccable/reference/audit.native.md exactly: score table (5 dimensions, 0-4 each, /20 with rating band), Platform Conformance Verdict first, Executive Summary, findings by severity, Patterns & Systemic Issues, Positive Findings, Recommended Actions (only /impeccable commands, ending with /impeccable polish).
Add two short sections after Positive Findings: "Documented deviations" and "Not checked on web" (copy the checklist's list; mention the seed holds only two Habits, so empty states dominate some screens).
Merge duplicate findings across groups into one systemic item. Mark unverified findings "(unverified)". Keep it skimmable: tables and short bullets, sentences under 20 words.

Checklist: ${CHECKLIST}
Findings: ${JSON.stringify(kept)}
Refuted (don't report, but count them in the summary): ${dropped.length}
Positives: ${JSON.stringify(positives)}
Deviations: ${JSON.stringify(deviations)}

Return the score table and the top 5 issues as Markdown.`,
  { label: "report", phase: "Report" },
);

return {
  report,
  kept: kept.length,
  refuted: dropped.length,
  shots: shots.length,
  reportPath: REPORT,
  checklistPath: CHECKLIST,
};
