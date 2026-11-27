A journal app: one Expo app with its Cloudflare Worker, in a single package.

Targets Android and web only. iOS is out of scope: skip iOS config, builds, testing and docs.

## Layout

One `package.json` at the root; run every command from there. `PRODUCT.md` and `DESIGN.md` hold the product and the design system. Nested `AGENTS.md` files hold rules for their folder; each has a `CLAUDE.md` beside it that imports it.

- **`src/app`**: Expo Router routes. `src/components`, `src/lib` and `src/hooks` are app-only.
- **`src/ui`**: shared components, imported as `@/ui`. `@shadcn/lint` (in `.oxlintrc.json`) holds pages to their variants and theme tokens: follow its error's suggested fix; suppress only for a runtime value, with the reason. It can't read classes inside `Platform.select`, so write new web-only classes as `web:` in `className`. Pad for device insets with Uniwind's `pt-safe` and `pb-safe`, except under `OfflineFrame`, which zeroes the top inset in context.
- **`src/core`**: pure logic the app and the Worker share, imported as `@/core`. Oxlint blocks React, Expo and app imports there; fallow's zones block imports from `src/ui` and the app.
- **`worker`**: the Cloudflare Worker (API and web host). **`modules/journal-android`**: Android-only native module and widgets.

`bun run check` runs lint, typecheck, test and fallow in CI's order and prints only a failed step's output.

The repo is public; personal details live only in D1. Write docs, tests and seed rows with invented examples. The private `journal-native-archive` repo keeps the old history, issues and D1 backups.

Parse JSON from outside the app (API responses, storage, model output) with a `zod/mini` schema and derive its type from the schema; never cast it `as T`.

Jest requires 100% coverage in every suite: the app (`jest.config.ts`), `src/core` (`bun run test:core`) and the Worker (`bun run test:api`). After `bun run test`, `bun run coverage:gaps` lists each gap. Drop a branch the types make unreachable instead of testing it.

In app tests, press and type with `userEvent` (`press`, `paste`); keep `fireEvent` for layout, scroll, blur and other events with a payload. Jest fakes timers in every test, so move the clock with `jest.advanceTimersByTime` when code waits on a delay.

To accept a detect-secrets false positive, run `bun run secrets:scan` and mark the hit `is_secret: false`.

`.github/workflows/actions.lock` pins every action to a commit. After changing a `uses:` line, run `GH_TOKEN=$(gh auth token --user Fullchee) gh actions-lock` and commit the lock with it.

Create worktrees with `wt switch --create <branch>`; its setup script copies the untracked `mise.local.toml`, `CLAUDE.local.md` and `.dev.vars`.

This repo is the source for the setup files rex-mobile shares (listed in `scripts/sync-shared-setup.sh`): edit them here, then run `scripts/sync-shared-setup.sh "$REX_MOBILE_DIR"` (set in `mise.local.toml`). `docs/rex-mobile-parity.md` lists every other setup difference and which ones stay; `/compare-rex-mobile` updates it.

Fallow has no baseline: fix each finding. A failing run prints its findings above the `■ Metrics` line; the health lines after it never fail the run.

Before pushing, lint and test only the files you touched, run `bun run typecheck` (the app, the Worker and the Node scripts), and run `bun run fallow:changed` (plain `fallow` without CI's coverage fails on static estimates elsewhere; outside `tools/` and `scripts/`, treat a health finding as a hint). Tests and full fallow run only in CI, on purpose: push without waiting on CI.

## Expo has changed: check the docs

Expo ships breaking changes every SDK release. Before writing code that touches an Expo, EAS or React Native API, read the `expo` major version in `package.json` and fetch `https://docs.expo.dev/versions/v<major>.0.0/`. For anything else, start from https://docs.expo.dev/llms.txt.

```bash
bunx expo install <package>        # ALWAYS use to add Expo/RN deps: resolves SDK-compatible versions
bunx wrangler d1 execute fullchee-dashboard --remote --command "<SQL>"   # read live data; the journal skill wraps the API instead
```

Every `journal` URL must keep working: before moving or renaming a route, read `docs/url-parity.md`.

## EAS updates and builds

CI publishes every `main` push to the `production` channel with `eas update`. `runtimeVersion` uses the `fingerprint` policy, so a native change needs a new APK; `package.json` scripts stay out of the fingerprint. EAS CLI reads `EXPO_TOKEN` from `mise.local.toml`; never run `eas login`. When the fingerprint changes, CI reopens the one issue titled "Rebuild the APK"; never open another. Release flow and decisions: `docs/eas.md`.

A new APK is not a blocker. Add native modules, config plugins and dependencies when a feature needs them; the owner rebuilds the APK.

For a sideload APK, `bun run android:apk` beats EAS. It needs `ccache` and runs fastest from the same checkout each time: a fresh worktree recompiles all the C++. Its Gradle build cache in `~/.gradle` serves every worktree; `bun run android:apk --no-build-cache` (or `--rerun-tasks`) forces a full build.

- Never start an EAS build (`eas build`) or wire one to a push: the free tier allows 15 Android builds a month, so only the owner starts them.
- Never build the APK (`bun run android:apk`, `expo run:android --variant release`, `gradlew assembleRelease`) unless the owner asks: a release build takes 13 to 35 minutes and slows every other session's CPU.
- `android/` is generated (Continuous Native Generation). Configure native behaviour in `app.json` and config plugins, never in `android/`.
- Declare every env var in `.env.schema` and read it with `import { ENV } from 'varlock/env'`, not `process.env`. Every value is inlined into the bundle, so never add a secret. After editing `.env`, restart Metro; `--clear` is not needed.

## Agent workflow

Don't create PRs. Merge a branch into `main` with a squash merge (`git merge --squash`), one conventional commit per branch.

After `/triage` or a plan, fan unblocked `ready-for-agent` issues out to parallel worktree agents without asking. Land shared setup on `main` first and name one owner per shared file in each brief.

- **Issue tracker**: GitHub Issues in `Fullchee/journal`. See `docs/agents/issue-tracker.md`.
- **Triage labels**: the five defaults (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.
- **Domain language**: single-context, `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
- **Planning**: the effort is charted with `/wayfinder` as a `wayfinder:map` issue.
- **Moving off `journal`** (the old SvelteKit repo, now `journal-2026-11-svelte`): `docs/api-migration.md` tracks what has moved and what blocks archiving it.
- **Moving `work-log` in** (the Obsidian work vault): `docs/work-log-migration.md` holds the phased plan and its decisions.

## Failure log

Put a lesson that only applies to one folder (`worker`, `modules/journal-android`) in that folder's `AGENTS.md`.

### Product and issues

- Design features for zero routine input: a default plus one optional tap, never a weekly entry. The owner rejected a weekly attendance entry (#126, 2026-11-11).
- Before deciding how a Habit, Check-in or reminder behaves, read `docs/research/habit-tracker-best-practices.md` and cite the finding you follow. If it doesn't cover the question, run `/research` and add the finding there first (#33, 2026-11-22).
- On the wayfinder map, decide grilling and prototype tickets yourself and record the reasons; the owner gives feedback by installing the app, not per ticket.
- Close an issue once its work ships to `main`; the owner opens a new ticket for changes, so skip `ready-for-human` for verification (2026-11-10).
- The owner is the only user, so telemetry keeps every debugging detail (breadcrumbs, console logs, PII) (#129, 2026-11-11).

### Git, worktrees and pushing

- `git worktree add` runs `bun install --frozen-lockfile` through the `post-checkout` hook; its postinstall writes the gitignored `expo-env.d.ts`. If Jest says `Preset jest-expo not found` or typecheck fails on `global.css` imports, run that install.
- For a docs or CI-only change, create the worktree with `LEFTHOOK=0 git worktree add …`: the install takes about 20s and makes `git worktree remove` take minutes. Before pushing it with `--no-verify`, run the main checkout's `node_modules/.bin/oxfmt` on the changed files: CI's `oxfmt --check` fails on unformatted Markdown and skips the deploy and its migrations (2026-11-16).
- When a push is rejected after a green pre-push hook, another session pushed meanwhile: fetch, rebase your own commits, and push with `--no-verify` only if upstream's new commits touch none of your files.
- The pre-push hook's `oxlint {push_files}` reports bogus `no-unsafe-*` errors on `scripts/*.ts`; when full `bunx oxlint` passes, push with `--no-verify` (2026-11-14).
- After a rebase through the `weave` merge driver, scan `git diff origin/main` for repeated lines: its auto-merges copy unchanged `interface` declarations and comments (#120). For a conflicted file both sides rewrote, take `origin/main`'s copy and re-apply your edits.
- After parallel agents push to `main`, run `bun run lint` and `bun run test` on the merged `main` before calling the work done: each agent checked only its own tree (2026-11-12).
- Read the whole CI log, not the last error: `fallow` runs after a failed `test` step, so "Missing coverage/…json" means a Jest suite failed on the line above (2026-11-11).

### Tooling and config

- Oxlint is the only linter: unicorn, sonarjs, regexp, jest, slop, `@eslint-react` and expo, plus typescript-eslint's type-aware rules through `oxlint-tsgolint`. Name ESLint-plugin copies `unicorn-js/*` and `jest-js/*`, since Oxlint reserves those names. Leave out JS-plugin rules that need type information: they throw ("Error running JS plugin", hiding every other finding in that file) or misfire. The recommended sets are copied, so a plugin update adds no rules (2026-11-14).
- When `oxfmt --check` passes on the Mac but fails in CI on a `className`, put the theme color classes (`bg-background`, `border-input`) first: CI's Tailwind sort treats them as unknown (2026-11-22).
- `tsc` is TypeScript 7 from `@typescript/native`; the `typescript` package stays the TS 6 alias typescript-eslint needs (`scripts/repo-config.test.ts` guards it).
- Expo's typed-route types (`.expo/types`, `expo-env.d.ts`) come from the `postinstall`; never write `expo-env.d.ts` by hand, or `Href` is `string` on one machine and a route union on another.
- Fallow adds each destructured prop to a component's cognitive score. When a component fails `complexity-cognitive` with few branches, pass the props it only forwards as one `...rest` object (2026-11-23).
- Keep `metro.config.cjs`, `babel.config.cjs` and `fingerprint.config.cjs` as CommonJS: a typed Metro config needs casts (Expo pins Metro 0.87.1, Sentry pulls 0.87.3), and fingerprint loads only `.js` and `.cjs` (2026-11-13). `jest/lucide-react-native.cjs` stays CommonJS for its lazy per-icon getters on `exports`. Write config plugins in TypeScript.
- When you enable a Claude plugin in `.claude/settings.json`, add its MCP server to `opencode.json` and its skills repo to `setup.sh`'s OpenCode stage: OpenCode can't load Claude plugins. `scripts/repo-config.test.ts` checks the MCP half (2026-11-27).
- Bun runs a dependency's install scripts only if `trustedDependencies` lists it, and that list replaces bun's default. After adding a dependency, run `bun pm untrusted` and trust each blocked script the package needs.
- Find a package's files with `require.resolve`, never a hard-coded `node_modules` path: the linker decides where packages live (the pnpm-to-bun switch broke `jest/lucide-react-native.cjs`).
- Set `compatibility_date` in `wrangler.jsonc` no later than the installed workerd supports, or `wrangler dev` refuses to start; bun's `minimumReleaseAge` can block the newest wrangler.

### Jest

- Never add `--forceExit`: `jest/setup.ts` gives TanStack unref'd timers, so a hanging file means a new open handle (find it with `--detectOpenHandles`).
- Jest measures a never-imported file only under the config's `roots`; keep `roots` wide enough to hold every source file, or an untested file passes the 100% gate unseen (2026-11-13).
- Map `lucide-react-native` to `jest/lucide-react-native.cjs`, never its CJS entry: the entry requires all ~4,600 icon files, slow under on-access antivirus scanning.
- In a suite that calls `renderRouter(APP_DIR)`, add `beforeAll(() => preloadRoutes(APP_DIR))`: loading every route in the first test outlasts the 30s timeout, and later tests fail on overlapping `act()` calls.
- Route tests that render `src/app` must mock `DataProvider` with a real `QueryClientProvider`: the root layout calls `useQueryClient()`.
- To cover a screen's offline, error and loading branches, give the test a fresh `QueryClient` with `retry: false`, hold loading with `pendingApi()` or `Promise.withResolvers`, and drop the connection with `act(() => setOnline(false))`.
- Mock a data hook with a `mock`-prefixed state object read inside `jest.mock`, not `jest.mocked(…).mockReturnValue(… as unknown as …)`: anti-slop rejects chained casts.
- Mock `expo-crypto` in tests that queue a Check-in: jest-expo's `randomUUID` returns `undefined`, which hides the queued row.
- Build "N days ago" as `shiftDay(torontoDay(new Date()), -N)` and an instant as `isoAt(day, minutes)` or with a `-05:00` offset, never from local Date fields: Jest runs in the machine's zone (UTC in CI), so a local date lands on another Toronto Day five hours a day (2026-11-10).

### App runtime

- Set TanStack Query `gcTime` to `Infinity`, never a long finite value: above about 24.8 days it overflows `setTimeout` and garbage-collects queries at once.
- `cacheVersion` keys the persisted cache on `Updates.updateId` too: an `eas update` keeps `expo.version`, so a new API field would otherwise meet a restored cache that lacks it (2026-11-09).
- Hermes here (260318099.0.5) lacks `toSorted`; `src/lib/array-copy-methods.ts` adds it. Polyfill any other missing method there, or the native app crashes while Jest and web pass. Check a method with `grep -a <name>` on `libhermesvm.so` from the `hermes-android` AAR in `~/.gradle/caches` (2026-11-19).
- Clear a tab screen's params with `useNavigation().setParams`; `router.setParams` targets the root route, so the tab keeps them.

### Running on Android

- Run the app with `bunx expo run:android`; `expo start` opens the installed dev build, which throws "Cannot find native module" for native code added since that build (2026-11-13).
- Start Metro without `CI=1` when you will edit code: CI mode turns off its file watcher (2026-11-09).
- On the emulator, the debug build loads its bundle from the host's port 8081 (`10.0.2.2`) and ignores `adb reverse`, so a second Metro must take 8081 itself; `bun run e2e` refuses to start if 8081 is busy.

### Cloudflare Access

- Read Access's OAuth endpoints from `https://fullchee.cloudflareaccess.com/.well-known/oauth-authorization-server`; the authorize path is `/oauth/authorization`.
- Managed OAuth is set per Access app: before pointing Android at a new origin, request the authorize URL with `resource=<origin>`; `invalid_target` means that app has it off (2026-11-08).
- Link Zero Trust pages under `https://dash.cloudflare.com/<account>/one/…` (Access apps: `/one/access-controls/apps`); the old `one.dash.cloudflare.com` URLs are invalid.
