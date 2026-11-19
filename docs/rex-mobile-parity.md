# rex-mobile parity

How this repo's setup (lint, hooks, CI, TypeScript, tests, agent config) differs from rex-mobile (checked out at `$REX_MOBILE_DIR`, set in `mise.local.toml`), and which differences stay. `/compare-rex-mobile` keeps it current; an Orca automation runs that skill weekly.

## Last checked

The skill diffs each repo from these commits, so a run reads only what changed since. Both are `origin/main`.

<!-- compare-rex-mobile:hashes -->

| Repo           | Commit                                     | Checked    |
| -------------- | ------------------------------------------ | ---------- |
| journal-native | `b3eb9fb9d99c2803a0e3ca060e507a685c43f242` | 2026-11-17 |
| rex-mobile     | `aa1539ee4915373d48d1601b17db84fd818eaf5e` | 2026-11-17 |

## Setup paths

The skill compares only these paths. Add a path here when either repo gains a setup file.

```text
package.json bunfig.toml .nvmrc tsconfig*.json
.oxlintrc.json .oxfmtrc.json tools/oxlint stylelint.config.* .fallowrc.*
jest*.config.* jest.setup.ts jest/setup.ts
lefthook.yml .pre-commit-config.yaml
.github cicd scripts
.claude/settings.json .claude/hooks .config/wt.toml
.gitleaks.toml .gitleaksignore renovate.json5
eas.json AGENTS.md skills-lock.json
```

## Already shared

This repo is the source. `scripts/sync-shared-setup.sh "$REX_MOBILE_DIR"` copies them across.

- `scripts/install-if-lock-changed.sh`
- `scripts/prune-worktrees.sh`
- `.claude/hooks/format-edited-file.sh`

Identical today without syncing: shellcheck on commit, `.nvmrc`, `.config/wt.toml` (comment aside), the bun `preinstall` guard, `engines`, `packageManager`, the TS 7 / TS 6 alias pair, the shellcheck and shfmt versions and checksums, stylelint flags, the Jest crawl and worker settings, the jest-expo preset guard, the vendored anti-slop plugin.

## Differences that stay

Each row has a reason. Move a row here from "To align" when you decide it stays.

| Area                      | journal-native                                                                      | rex-mobile                                                                           | Why it stays                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| CI host                   | GitHub Actions only                                                                 | Cloud Build (`cicd/check.yaml`, `cicd/eas-update.yaml`) plus a GitHub Actions mirror | The company runs on GCP; Terraform in devteam-devops owns the trigger.                                       |
| Review flow               | Squash-merge to `main`; CI runs on `main` pushes                                    | PRs; CI and `secrets.yml` also run on `pull_request`                                 | Solo repo versus a team that reviews PRs.                                                                    |
| Deploy                    | `ci.yml` deploys the Worker, applies D1 migrations, then `eas update`               | `eas-update` workflow only; no backend here                                          | journal-native ships its own API; REX's API lives elsewhere.                                                 |
| Platforms                 | Android and web; APK sideloaded                                                     | iOS, Android, web, Expo Go                                                           | The owner has an Android phone; REX ships to both stores.                                                    |
| Pre-push Jira report      | None                                                                                | Posts a Claude token and session summary to Jira                                     | Work tracking only.                                                                                          |
| Jira and plan rules       | None                                                                                | `.claude/rules/jira`, `.claude/rules/html-output`, `.github/instructions`            | Work tracking only.                                                                                          |
| Dependency bot            | Renovate, Monday, 7-day age gate                                                    | Dependabot, Thursday, 5-day cooldown                                                 | rex-mobile: hosted Renovate needs a GitHub org owner (`docs/research/2026-11-14-renovate-vs-dependabot.md`). |
| Test suites               | Three gated suites: app, `src/core`, Worker; plus `node --test` for scripts         | One Jest suite over `src/`                                                           | journal-native shares `src/core` with a Worker.                                                              |
| Fallow zones              | core, ui, worker, app                                                               | lib, shared, app                                                                     | Folder layouts differ; both point dependencies down.                                                         |
| Typecheck                 | Three projects (app, Worker, Node scripts) via `tsconfig.strict.json`               | One project, strict flags inline                                                     | Same flags; journal-native needs them in three places.                                                       |
| Storybook, MSW, mock mode | None                                                                                | On-device and web Storybook, MSW handlers, `.rnstorybook` check                      | REX builds against a mocked API; the journal hits its own Worker.                                            |
| Secrets `pass` rule       | Default Betterleaks rules                                                           | Extra `pass-keyword` rule and `.gitleaksignore`                                      | Ported from rex-mobile's detect-secrets plugin for `MYSQL_PASS`-style keys.                                  |
| Vendored design system    | None                                                                                | `design-system/` excluded from lint, format, secrets                                 | REX mirrors the web design system.                                                                           |
| Hook runner               | lefthook                                                                            | prek (`.pre-commit-config.yaml`)                                                     | Each repo keeps its own; both run the same checks.                                                           |
| Vendored skills           | Expo's skills, minus iOS, store, EAS Hosting, brownfield and eval ones              | Design, Storybook and planning skills                                                | journal-native ships a sideloaded Android APK and hosts web on its Worker; REX builds UI against Storybook.  |
| Skills update             | Weekly job pushes `chore/skills-update` and reopens one issue                       | Weekly rolling PR                                                                    | No PRs here.                                                                                                 |
| Expo install exclude      | None                                                                                | `expo.install.exclude: ["@sentry/react-native"]`                                     | `expo install --check` accepts journal's Sentry version.                                                     |
| `react-hooks-js` rules    | None                                                                                | `react-hooks-js/config`, `gating`                                                    | Both check React Compiler options this repo leaves at defaults; `@eslint-react` covers the hooks rules.      |
| Oxlint import rules       | Errors; `namespace` and `no-named-as-default-member` off, no `no-unassigned-import` | Same rules at warn, all on                                                           | TypeScript checks the first two; every side-effect import here is a polyfill, entry or setup file.           |

## To align

Pick a direction for each row, then port it or move it to "Differences that stay". **→ rex** means rex-mobile should copy journal-native.

### Hooks

| Topic            | journal-native                               | rex-mobile                       | Suggested                                                        |
| ---------------- | -------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| Format on commit | `oxfmt` writes and re-stages (`stage_fixed`) | `oxfmt --check` fails the commit | → rex: a commit never fails on style alone.                      |
| Oxlint           | Pre-push, pushed files only; no rule warns   | Pre-commit, `--deny-warnings`    | Decide when it runs. Warnings match: neither repo lets one pass. |
| Fallow           | Pre-push, `--changed-since origin/main`      | None                             | → rex: about 2 s there.                                          |

### Lint and format

| Topic                           | journal-native                               | rex-mobile                                        | Suggested                                        |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `printWidth`                    | Default (100)                                | 80                                                | → rex: drop the setting and use oxfmt's default. |
| Oxlint categories               | None; rules listed one by one                | `correctness` error, `suspicious` and `perf` warn | Decide.                                          |
| Oxlint JS plugins               | adds `jest-js` and a repo plugin (`journal`) | adds `react-hooks-js`, `react-js`                 | `jest-js` → rex.                                 |
| `reportUnusedDisableDirectives` | `error`                                      | unset                                             | → rex.                                           |
| oxfmt scope                     | Formats `.claude` and `.github`              | Skips `.claude`, `.github`, `cicd`                | Decide.                                          |

### CI

| Topic          | journal-native                    | rex-mobile                                   | Suggested                                      |
| -------------- | --------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| Tool cache     | `*.tsbuildinfo`, `/tmp/jest_*`    | `node_modules/.cache` (tsc, Jest, stylelint) | Pick one layout.                               |
| `check` script | `scripts/check.ts` (Node, tested) | `scripts/check.sh` (bash)                    | Pick one and add it to `sync-shared-setup.sh`. |

### Jest, TypeScript, Bun

| Topic          | journal-native                                          | rex-mobile                               | Suggested                                                    |
| -------------- | ------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| lucide in Jest | Mapped to `jest/lucide-react-native.cjs` (lazy getters) | Transforms the ESM package               | → rex: the full entry reads ~4,600 files, slow under Sophos. |
| Bun age gate   | 7 days                                                  | 5 days (matches global `~/.bunfig.toml`) | Pick one; update the bot config with it.                     |
| Bun linker     | `linker = "hoisted"` set explicitly                     | Default (AGENTS.md says keep hoisted)    | → rex: make it explicit.                                     |
| Env vars       | varlock (`.env.schema`, typed `ENV`)                    | `.env.example`, `process.env`            | → rex: a typed schema catches a missing var at build time.   |

### Agent setup

| Topic               | journal-native                                                                      | rex-mobile                                                            | Suggested                            |
| ------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| Format hook matcher | `Edit\|Write\|MultiEdit`                                                            | `Edit\|Write`                                                         | → rex.                               |
| `CLAUDE.md`         | Imports `@AGENTS.md`; `lint:conventions` checks every one                           | Symlink to `AGENTS.md`; `lint:conventions` checks every one           | Pick one.                            |
| `setup-worktree.sh` | Copies `mise.local.toml`, `CLAUDE.local.md`, `.dev.vars`; links `.expo/build-cache` | Links `.expo/build-cache`, writes typed routes, copies `.env.example` | Share the common part of the script. |
| `setup.sh`          | Unattended, idempotent                                                              | `/wizard` style, prompts                                              | Decide.                              |
