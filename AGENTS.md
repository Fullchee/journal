A journal app: one Expo app with its Cloudflare Worker, in a single package.

Targets Android and web only. iOS is out of scope: skip iOS config, builds, testing and docs.

## Layout

One `package.json` at the root; run every command from there. `PRODUCT.md` and `DESIGN.md` hold the product and the design system. Nested `AGENTS.md` files hold rules for their folder; each has a `CLAUDE.md` beside it that imports it.

- **`src/app`**: Expo Router routes. `src/components`, `src/lib` and `src/hooks` are app-only.
- **`src/ui`**: shared components, imported as `@/ui`.
- **`src/core`**: pure logic the app and the Worker share, imported as `@/core`. Oxlint blocks React, Expo and app imports there; fallow's zones block imports from `src/ui` and the app.
- **`worker`**: the Cloudflare Worker (API and web host). **`modules/journal-android`**: Android-only native module and widgets.

`bun run check` runs lint, typecheck, test and fallow in CI's order and prints only a failed step's output.

The repo is public; personal details live only in D1. Write docs, tests and seed rows with invented examples. The private `journal-native-archive` repo keeps the old history, issues and D1 backups.

Parse JSON from outside the app (API responses, storage, model output) with a `zod/mini` schema and derive its type from the schema; never cast it `as T`.

Jest requires 100% coverage in every suite: the app (`jest.config.ts`), `src/core` (`bun run test:core`) and the Worker (`bun run test:api`). After `bun run test`, `bun run coverage:gaps` lists each gap. Drop a branch the types make unreachable instead of testing it.

In app tests, press and type with `userEvent` (`press`, `paste`); keep `fireEvent` for layout, scroll, blur and other events with a payload. Jest fakes timers in every test, so move the clock with `jest.advanceTimersByTime` when code waits on a delay.

To accept a detect-secrets false positive, run `bun run secrets:scan` and mark the hit `is_secret: false`.

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

- On the wayfinder map, decide grilling and prototype tickets yourself and record the reasons; the owner gives feedback by installing the app, not per ticket.
- Expo's typed-route types (`.expo/types`, `expo-env.d.ts`) come from the `postinstall`; never write `expo-env.d.ts` by hand, or `Href` is `string` on one machine and a route union on another.
- Design features for zero routine input: a default plus one optional tap, never a weekly entry. The owner rejected a weekly attendance entry (#126, 2026-11-11).
- Find a package's files with `require.resolve`, never a hard-coded `node_modules` path: the linker decides where packages live (the pnpm-to-bun switch broke `jest/lucide-react-native.cjs`).
- The owner is the only user, so telemetry keeps every debugging detail (breadcrumbs, console logs, PII) instead of scrubbing it (#129, 2026-11-11).
- Set TanStack Query `gcTime` to `Infinity`, never a long finite value: above about 24.8 days it overflows `setTimeout` and garbage-collects queries at once.
- Close an issue once its work ships to `main`; never leave it open or label it `ready-for-human` for the owner to verify. The owner opens a new ticket for changes (2026-11-10).
- Route tests that render `src/app` must mock `DataProvider` with a real `QueryClientProvider`: the root layout calls `useQueryClient()`.
- Read the whole CI log, not the last error: the `fallow` step runs after a failed `test` step, so "Missing coverage/…json" means a Jest suite failed on the line above (2026-11-11).
- Keep `metro.config.cjs`, `babel.config.cjs` and `fingerprint.config.cjs` as CommonJS, named `.cjs` because `package.json` sets `"type": "module"`: Expo pins Metro 0.87.1 while Sentry pulls in 0.87.3, so a typed Metro config needs casts at each wrapper; fingerprint loads only `.js` and `.cjs` (2026-11-13). `jest/lucide-react-native.cjs` stays CommonJS too: it defines one lazy getter per icon on `exports`, which ESM can't declare. Config plugins are TypeScript: Expo loads `.ts` plugins directly.
- Oxlint is the only linter. It runs unicorn, sonarjs, regexp, jest, slop, `@eslint-react` and expo (built-in rules, or the ESLint plugin via `jsPlugins`; `unicorn-js/*` and `jest-js/*` because Oxlint reserves those names), and typescript-eslint's type-aware rules through `oxlint-tsgolint`. JS plugins get no type information: a plugin rule that needs it either throws ("Error running JS plugin", which hides every other plugin finding in that file) or misfires, so leave it out. The recommended sets are copied, so a plugin update adds no rules on its own (2026-11-14).
- Clear a tab screen's params with `useNavigation().setParams`; `router.setParams` targets the root route, so the tab keeps them.
- Bun runs a dependency's install scripts only if `package.json` `trustedDependencies` lists it, and that list replaces bun's default one. After adding a dependency, run `bun pm untrusted` and trust each blocked script the package needs.
- Mock `expo-crypto` in Jest tests that queue a Check-in: jest-expo's `randomUUID` returns `undefined`, which hides the queued row.
- After a rebase through the `weave` merge driver, scan `git diff origin/main` for repeated lines: its auto-merges copy unchanged `interface` declarations and comments several times (#120). For a conflicted file both sides rewrote, take `origin/main`'s copy and re-apply your edits.
- Read Access's OAuth endpoints from `https://fullchee.cloudflareaccess.com/.well-known/oauth-authorization-server`; the authorize path is `/oauth/authorization`, not `/oauth/authorize`.
- After parallel agents push to `main`, run `bun run lint` and `bun run test` on the merged `main` before calling the work done: each agent checked only its own tree (2026-11-12).
- Never add `--forceExit` to Jest: `MutationCache.clear()` leaves each mutation's 5-minute gc timer running, so `jest/setup.ts` gives TanStack unref'd timers; a hanging file means a new open handle (find it with `--detectOpenHandles`).
- `tsc` is TypeScript 7 (`scripts/repo-config.test.ts` guards the `typescript` package's TS 6 alias).
- Hermes here (260318099.0.5) has ES2023's `toReversed`, `toSpliced` and `with` but lacks `toSorted`; `src/lib/array-copy-methods.ts` adds it. Polyfill any other missing method there, or the native app crashes while Jest and web pass. Check a method with `grep -a <name>` on `libhermesvm.so` from the `hermes-android` AAR in `~/.gradle/caches` (2026-11-19).
- Other sessions push while the pre-push hook runs; when the push is rejected after a green hook, fetch, rebase your own commits, and push with `--no-verify` only if upstream's new commits touch none of your files.
- `git worktree add` runs `bun install --frozen-lockfile` through the `post-checkout` hook, and its postinstall writes the gitignored `expo-env.d.ts`. If Jest says `Preset jest-expo not found` or typecheck fails on `global.css` imports, run that install.
- Link Cloudflare Zero Trust pages under `https://dash.cloudflare.com/<account>/one/…` (Access apps: `/one/access-controls/apps`); the old `one.dash.cloudflare.com/<account>/access/apps` URL is an invalid page.
- In a suite that calls `renderRouter(APP_DIR)`, add `beforeAll(() => preloadRoutes(APP_DIR))`: requiring every route inside the first test outlasts the 30s timeout on a loaded machine, and the suite's later tests then fail on overlapping `act()` calls.
- For a docs or CI-only change, create the worktree with `LEFTHOOK=0 git worktree add …`: the post-checkout `bun install` takes about 20s and makes `git worktree remove` take minutes. That worktree has no `node_modules`, so before pushing it with `--no-verify`, run the main checkout's `node_modules/.bin/oxfmt` on the changed files: CI's `oxfmt --check` fails on unformatted Markdown and skips the deploy and its migrations (2026-11-16).
- Map `lucide-react-native` in Jest to `jest/lucide-react-native.cjs`, never its CJS entry: the entry requires all ~4,600 icon files, a third of a run's file reads, and each read is slow under on-access antivirus scanning.
- Jest measures a never-imported file only if it sits under the config's `roots`; the old `packages/core` set `roots` to its tests, so an untested file there passed the 100% gate unseen (2026-11-13).
- On the emulator, the debug build loads its bundle from the host's port 8081 (`10.0.2.2`) and ignores `adb reverse`, so a second Metro must take 8081 itself; `bun run e2e` refuses to start if 8081 is busy.
- In tests, build "N days ago" as `shiftDay(torontoDay(new Date()), -N)` and an instant as `isoAt(day, minutes)` or with a `-05:00` offset, never from local Date fields: app Jest runs in the machine's zone (UTC in CI), so a local date lands on another Toronto Day for five hours a day (calendar module, 2026-11-10).
- Managed OAuth is set per Access app: before pointing Android at a new origin, request the authorize URL with `resource=<origin>`; `invalid_target` means that app has it off (the workers.dev app did, 2026-11-08).
- The pre-push hook's `oxlint {push_files}` reports bogus `no-unsafe-*` errors on `scripts/*.ts` that full `bunx oxlint` does not; when the full run passes, push with `--no-verify` (2026-11-14).
- Run the app on Android with `bunx expo run:android`; `expo start` opens the installed dev build, which throws "Cannot find native module" for native code added since that build (2026-11-13).
- Start Metro without `CI=1` when you will edit code: CI mode turns off its file watcher, so it serves the old bundle until restarted (verified 2026-11-09; watchman is not needed).
- An `eas update` keeps `expo.version`, so `cacheVersion` also keys the persisted cache on `Updates.updateId`; without it, a field added to an API row reaches the app while the restored cache still lacks it (2026-11-09).
- Set `compatibility_date` in `wrangler.jsonc` no later than the installed workerd supports, or `wrangler dev` refuses to start; bun's `minimumReleaseAge` can block the newest wrangler.
- In component tests, mock a data hook with a `mock`-prefixed state object read inside `jest.mock`, never `jest.mocked(…).mockReturnValue(… as unknown as …)`: anti-slop rejects chained casts.
- To cover a screen's offline, error and loading branches, give the test a fresh `QueryClient` with `retry: false`, hold loading with `pendingApi()` or `Promise.withResolvers`, and drop the connection with `act(() => setOnline(false))`.
