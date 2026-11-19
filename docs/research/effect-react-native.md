# Effect in this repo: Hermes, Metro and AI agents

Researched 2026-11-19 against Effect [`effect@4.1.4`](https://github.com/Effect-TS/effect/tree/effect%404.1.4) (Effect 3 at [`effect@3.22.4`](https://github.com/Effect-TS/effect/tree/effect%403.22.4)), Expo SDK 58 (React Native 0.88.1, Hermes V1 [`hermes-v260318099.0.5`](https://github.com/facebook/hermes/tree/9a115f15785851f4ff2747ebb090ddd066fc8ad2)). npm latest: `effect` 4.1.4 (`prev` tag: 3.22.4), `@effect/atom-react` 4.1.4, `@effect/sql-d1` 4.1.4, `@effect/sql-sqlite-react-native` 4.1.4, `@effect/tsgo` 0.70.0, `@effect/language-service` 0.87.5, `effect-mcp` 0.1.16.

## Answer

**Don't migrate the whole repo.** Effect 4 runs on this app's Hermes, but a full rewrite would make the repo harder for agents to keep correct, not easier. If you want Effect at all, pilot it in one Worker job.

- **Runs on Hermes**: Effect 4's core needs nothing this Hermes lacks. No polyfill is needed beyond the existing ones. Two Hermes bugs (dates, memory) were fixed in October 2026.
- **Agents know the old version**: Effect 4 shipped on 2026-09-30. Most model training data shows Effect 3, whose names changed. Expect v3 code that the type checker has to reject.
- **More concepts, same features**: the app's hard parts (offline cache, queued writes) live in TanStack Query. Effect's React layer (Atom) is marked unstable and has no offline write queue.
- **Bundle cost is real**: Metro doesn't tree-shake by default. One `import { Effect } from "effect"` pulls in about 830 kB of minified JS. The current Android bundle is 9.2 MB.
- **Worker gains the most**: typed errors, retries and timeouts help the sync jobs (`hevy-sync`, `calendar`). Plain handlers like `sleep.ts` gain little.
- **Leave `src/core` alone**: it is pure functions. Effect adds nothing there, and `zod/mini` is 16 kB against Schema's 76 kB (shaken).

## Full migration vs the current stack

The current stack: `zod/mini` for parsing, TanStack Query (with a persisted cache and paused-mutation queue in [`query-client.ts`](../../src/lib/data/query-client.ts)) for app data, plain `async` Worker handlers. Size today: about 48,000 lines across the app, `src/core` and `worker`; 107 files use `zod/mini`; 33 files use TanStack Query hooks; 105 test files.

| Factor                 | Current stack                                                                          | Full Effect 4 migration                                                                                                                                                                                                               | Edge                                   |
| ---------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Maintainability**    | Few concepts: `async`/`await`, a schema, a query hook. Errors are `instanceof` checks. | Errors and dependencies show in types, which helps. But each reader must learn `Effect.gen`, `pipe`, `Layer`, `Context.Service`, `Schema`, `Atom`. The Effect 4 review calls it "closer to adopting a new language" ([Stork][stork]). | Current, for an owner who rarely codes |
| **Agent reliability**  | Zod, TanStack Query and plain fetch are stable and common in training data.            | v4 is seven weeks old. Agents will write v3 names (`Context.Tag`, `catchAll`) ([migration guide][migration]). Effect ships `AGENTS.md` in the npm package, which helps. No independent study measures agent accuracy.                 | Current                                |
| **Testability (100%)** | Jest, `userEvent`, a real `QueryClient`. Coverage gaps are plain branches.             | Services as `Layer`s make fakes easy. But Effect's test kit targets Vitest (`@effect/vitest`), not Jest. Each `pipe` callback (`catchTag`, `map`) is a function Jest must cover. Effect 4 needs Jest to transform it (ESM-only).      | Even; Effect cost is setup             |
| **Bundle and runtime** | `zod/mini` shakes to 16 kB.                                                            | 175 kB to 830 kB of extra minified JS, depending on imports (see [Bundle size](#bundle-size)). Each `Effect.fn` builds an `Error` at load; Hermes can't shorten those stacks.                                                         | Current                                |
| **Migration effort**   | None.                                                                                  | Rewrite every handler, data hook and schema; replace the offline queue; move tests. Mixed styles are fine, so it can go file by file.                                                                                                 | Current                                |
| **Where Effect wins**  | Retry and timeout rules are hand-written per call.                                     | `Schedule`, `Effect.timeout`, typed error unions and resource cleanup are built in. These pay off in multi-step jobs that call outside APIs.                                                                                          | Effect, in the Worker's sync jobs only |

### Which layers, if any

| Layer                                           | Adopt? | Why                                                                                                                                                                                          |
| ----------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Worker sync jobs** (`hevy-sync`, `calendar`)  | Pilot  | Outside APIs, retries, partial failures: Effect's strengths. Workers run V8, so Hermes issues don't apply. `@effect/sql-d1` exists, but is `@stability unstable`.                            |
| **Worker request handlers** (`worker/api/*.ts`) | No     | Most are "parse body, run SQL, return JSON". Effect's `HttpApi` and `http` modules are `@stability unstable`: breaking changes can land in minor releases ([migration guide][migration]).    |
| **`src/core`**                                  | No     | Pure, synchronous logic shared with the Worker. Effect adds overhead and no benefit.                                                                                                         |
| **App data layer** (TanStack Query)             | No     | The persisted cache and paused-mutation queue have no Effect equivalent. `@effect/atom-react` is `@stability unstable`. Running Effects inside `queryFn` works but adds a layer for nothing. |
| **Parsing** (`zod/mini`)                        | No     | Schema is larger and its API is newer to agents. Swap only if a Worker pilot needs Schema to share types with Effect code.                                                                   |

## Hermes compatibility

React Native 0.88 always uses Hermes V1; the `hermesV1Enabled=false` opt-out is ignored ([`ReactPlugin.kt`][rn-plugin]). The tag in `node_modules/react-native/sdks/hermes-engine/version.properties` is `260318099.0.5`. Feature checks below come from that Hermes tag's source, React Native v0.88.1's global setup, and a grep of the published `effect@4.1.4` `dist/` with doc comments excluded.

| Feature                                                                        | Effect 4 uses it in                                                                    | Hermes V1 / RN 0.88                                                                                                                                                        | Effect on this app                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generators (`function*`, `yield*`)                                             | Everywhere (`Effect.gen`, `Effect.fn`)                                                 | Native ([`GeneratorFunction.cpp`][h-gen]). RN's Babel preset compiles them with regenerator in dev builds and keeps them native in release ([`main.js`][rn-babel]).        | Works. Dev builds run slower generator code and are harder to step through.                                                                                                                                              |
| `Symbol.iterator`, `Symbol.asyncIterator`                                      | `Stream`, `Channel`                                                                    | Present ([`PredefinedSymbols.def`][h-sym])                                                                                                                                 | Works.                                                                                                                                                                                                                   |
| `Symbol.dispose`, `Symbol.asyncDispose`                                        | `Effect.acquireDisposable`, `ManagedRuntime`                                           | Absent ([`PredefinedSymbols.def`][h-sym])                                                                                                                                  | Only `acquireDisposable` needs them, and only if you call it. `ManagedRuntime` defines the key; with no symbol it is a harmless `"undefined"` key.                                                                       |
| `WeakRef`                                                                      | `reactivity/Atom` `family` (guarded)                                                   | Defined when the runtime has a microtask queue ([`GlobalObject.cpp`][h-global]); RN 0.88 installs native microtasks ([`setUpTimers.js`][rn-timers])                        | Works. Atom falls back to a strong map without it ([`Atom.ts`][e-atom]).                                                                                                                                                 |
| `FinalizationRegistry`                                                         | `http/HttpClient` (guarded), Atom `family`                                             | Wired in March 2026 ([commit `b2c6c9a`](https://github.com/facebook/hermes/commit/b2c6c9aef6)), present at this tag ([`GlobalObject.cpp`][h-global])                       | Works. Issue [#8750][i8750] reported Hermes without it (October 2026); the leak in Effect's fallback was fixed in [#8830](https://github.com/Effect-TS/effect/pull/8830).                                                |
| `Error.stackTraceLimit`                                                        | Span, `Effect.fn`, `Layer`, `Schema` call-site capture                                 | Not supported: `// TODO: truncate traces? Support Error.stackTraceLimit?` ([`JSError.cpp`][h-jserror])                                                                     | Every `Effect.fn` definition and span builds a full-depth `Error`. Effect's own source says stack formatting "is slow on some engines (e.g. Hermes)" and defers it ([`Atom.ts`][e-atom]).                                |
| `Intl.DateTimeFormat`                                                          | `DateTime`                                                                             | Java-backed on Android; omits the `fractionalSecond` part                                                                                                                  | Broke every zoned `DateTime` format on Android ([#8689][i8689]). Fixed in [#8707](https://github.com/Effect-TS/effect/pull/8707), merged 2026-10-03 (in 4.0.x).                                                          |
| `BigInt`                                                                       | `Clock` (`performance.now` to nanoseconds), `Duration`                                 | Present ([`BigInt.cpp`][h-tree])                                                                                                                                           | Works.                                                                                                                                                                                                                   |
| `TextEncoder` / `TextDecoder`                                                  | `Random` creates a `TextEncoder` at module load; `Stream`, `Channel`, `Logger`         | `TextEncoder` is a core Hermes extension; `TextDecoder` is a `contrib` extension ([extensions][h-ext])                                                                     | `TextEncoder` works. Whether RN installs the `contrib` `TextDecoder` is **unverified**; it matters only for byte streams.                                                                                                |
| `AbortController`, `AbortSignal.any`                                           | Interruption, `FetchHttpClient`                                                        | RN 0.88 polyfills both, plus `AbortSignal.timeout` ([`AbortSignal.js`][rn-abort])                                                                                          | Works.                                                                                                                                                                                                                   |
| `setImmediate`                                                                 | `Scheduler` uses it to yield every 2,048 ops                                           | RN shims it with `queueMicrotask` ([`setUpTimers.js`][rn-timers])                                                                                                          | Effect's "yield" stays inside the microtask queue on native, so a long CPU-bound fiber can block rendering. Inferred from source, not measured. `Scheduler` accepts a custom timer function ([`Scheduler.ts`][e-sched]). |
| ES2023 copy methods                                                            | Not called at runtime by core (only in doc examples)                                   | `toReversed`, `toSpliced`, `with` native since 2024 ([commit `e607157`](https://github.com/facebook/hermes/commit/e60715764e)); `toSorted` absent ([`Array.cpp`][h-array]) | No new polyfill needed. Note: `AGENTS.md` says `toReversed` is missing too, but this Hermes tag has it.                                                                                                                  |
| `structuredClone`, `Array.fromAsync`, `Promise.withResolvers`, `Iterator.from` | Not in core runtime paths (only `encoding/Xml`, the Swagger/Scalar UI pages, and docs) | `structuredClone` absent                                                                                                                                                   | Avoid `effect/encoding/Xml` and the `http-api` docs UI on native.                                                                                                                                                        |
| `import.meta`                                                                  | `ConfigProvider.fromEnv` reads `import.meta?.env`                                      | Not valid in Metro's scripts; `babel-preset-expo` 58 rewrites it by default (`transformImportMeta !== false` in `build/configs/expo.js`)                                   | Works with the repo's `babel-preset-expo`. A plain `@react-native/babel-preset` setup needs its own plugin ([#6252 comment][i6252]).                                                                                     |

### Effect 3

Effect 3.22.4 uses fewer new globals: no `WeakRef`, `FinalizationRegistry` or `Symbol.dispose` in its ESM build. It yields with `setTimeout(0)`, which does reach the event loop ([`Scheduler.ts`](https://github.com/Effect-TS/effect/blob/effect%403.22.4/packages/effect/src/Scheduler.ts)). It ships both CJS and ESM. It is no longer `latest` on npm, and its support window is **unverified**; Effect 4 is an LTS release "with at least three years of bug and security fixes" ([`README.md`][e-readme]).

## Bundle size

### Published numbers

- **Effect's claim**: "A minimal Effect program bundles to 7.1 kB (minified + gzipped)", down from 35.6 kB in 3.x ([migration guide][migration], [4.0 release post](https://effect.website/blog/releases/effect/40)).
- **Not reproduced independently**: a review notes the figures "have not been independently reproduced" ([Stork][stork]).
- **Assumes a tree-shaking bundler** (Rollup, esbuild, Vite). Metro is not one by default.

### Measured here (esbuild 0.28.2, minified, ESM)

A proxy for Metro: "no tree shaking" approximates Metro's default, which includes every module a file imports.

| Program                                               | Shaken (min / gzip) | Not shaken (min / gzip) |
| ----------------------------------------------------- | ------------------- | ----------------------- |
| v4 minimal, `import * as Effect from "effect/Effect"` | 28 kB / 10 kB       | 175 kB / 61 kB          |
| v4 minimal, `import { Effect } from "effect"`         | 169 kB / 59 kB      | 831 kB / 268 kB         |
| v4 `Effect` + `Schema` decode, subpath imports        | 76 kB / 26 kB       | 502 kB / 166 kB         |
| v4 `Effect` + `Schema` + `effect/http` client, barrel | 460 kB / 152 kB     | 969 kB / 314 kB         |
| v4 Atom + registry, barrel                            | 222 kB / 77 kB      | 868 kB / 280 kB         |
| v3 minimal, `effect/Effect` subpath                   | 140 kB / 47 kB      | 324 kB / 110 kB         |
| `zod/mini` object parse                               | 16 kB / 6 kB        | 431 kB / 87 kB          |

- **Barrel imports cost the most**: `effect`'s `index.js` holds 144 `export * as` lines. Effect's own docs and its `AGENTS.md` write `import { Effect } from "effect"`, so agents will too.
- **Context**: the current Android bundle (`dist/_expo/static/js/android/*.hbc`) is 9.2 MB of Hermes bytecode. Bytecode size differs from minified JS size; the extra Effect bytecode is **unmeasured**.

### Metro and Expo tree shaking

- **Opt-in and production-only**: "Tree-shaking only runs in production bundles", enabled with `EXPO_UNSTABLE_TREE_SHAKING=1`; the docs call it "very experimental" ([Expo tree shaking](https://docs.expo.dev/guides/tree-shaking/)). This repo doesn't set it.
- **Namespace re-exports**: the guide covers `export *` but not `export * as ns`. Whether Expo shakes Effect's barrel is **unverified**.
- **Maintainer view**: a 2024 Metro tree-shaking report was closed with "not our issue, known limitation of metro" ([#4093](https://github.com/Effect-TS/effect/issues/4093)).
- **`sideEffects`**: Effect 4 marks only `SchemaJITCompiler/enable` as having side effects ([`package.json`][e-pkg]), so a shaking bundler can drop the rest.

## Metro bundling issues

- **ESM-only**: Effect 4 is `"type": "module"`, with a flat `exports` map (`.`, `./*`, `./http`, …) and no `main` ([`package.json`][e-pkg]). Metro reads `exports` by default in RN 0.88.
- **Jest needs a transform**: `effect` must go on the allow list in `transformIgnorePatterns`. Under `babel-preset-expo`, Schema decode broke in 4.0 betas ([#6578][i6578]); fixed by [#6659](https://github.com/Effect-TS/effect/pull/6659) (July 2026).
- **"Function is not a constructor"** with v4 on Metro, March 2026; the user went back to v3 ([effect-smol#1861](https://github.com/Effect-TS/effect-smol/issues/1861)). Closed with no fix recorded. Secondary (Discord summary).
- **`ConfigProvider` default read `process.env`/`import.meta`** in an Expo app on v4 beta ([effect-smol#1374](https://github.com/Effect-TS/effect-smol/issues/1374)). Secondary.
- **SQL `Migrator` dynamic imports broke Metro** ([#6347](https://github.com/Effect-TS/effect/issues/6347)); fixed by moving filesystem loading to its own module.
- **`@effect/sql-sqlite-react-native`** is first-party and pinned to `@op-engineering/op-sqlite` 17–18; v17 doesn't build on RN 0.88 ([#9868](https://github.com/Effect-TS/effect/issues/9868)). This app doesn't use SQLite today.
- **No Hermes CI**: a code search finds `hermes` only in an `Atom.ts` comment, and the RN SQLite package tests mock the driver under Vitest ([`Client.test.ts`](https://github.com/Effect-TS/effect/blob/effect%404.1.4/packages/sql/sqlite-react-native/test/Client.test.ts)). Hermes bugs surface through user reports.

## React integration

| Package                         | Status                                                                                                                                                                                                                                        | Fit                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@effect/atom-react` 4.1.4      | First-party, in the Effect monorepo ([`packages/atom/react`](https://github.com/Effect-TS/effect/tree/effect%404.1.4/packages/atom/react)). Peers: React 19, `scheduler`. The `effect/reactivity` modules it binds are `@stability unstable`. | Atoms with `AsyncResult`, `optimistic`, `kvs` (persisted to a `KeyValueStore`). No paused-mutation queue or offline-first network mode found in `Atom.d.ts`. |
| `@effect-atom/atom-react` 0.7.0 | Community (Tim Smart), Effect 3 era                                                                                                                                                                                                           | Superseded by the first-party v4 package.                                                                                                                    |
| TanStack Query                  | No official Effect binding. Guides run `Effect.runPromise` inside `queryFn`/`mutationFn` (community [effectify](https://devx-op.github.io/effectify/react/packages/react-query))                                                              | Works, since `queryFn` only needs a Promise. Typed errors become thrown values again at that edge.                                                           |

- **Known bug class**: synchronous atom initialization can update another component during render ([#9988](https://github.com/Effect-TS/effect/issues/9988)).
- **An Expo user hit `causePartition` crashes** via `useAtomSuspense` on a v4 beta ([#6252][i6252]); the same `reasons` error as the Babel spread bug in [#6578][i6578]. A later commenter reports "Effect v4 family works well" on react-native-macos 0.87 with Hermes V1, after Babel changes.

## Effect 3 vs Effect 4

- **Status**: 4.0.0 published 2026-09-30; 4.1.4 on 2026-11-11 (npm). v3 gets patches (3.22.4 on 2026-10-22) under the `prev` tag.
- **Repo**: v4 now lives in `Effect-TS/effect` (`effect-smol` was the beta repo). Platform, RPC, SQL core and Atom moved into `effect` ([migration guide][migration]).
- **Runtime**: 4.57M vs 0.71M tasks per second; 21.8 MB vs 157.5 MB for 50,000 fibers (Effect's own figures, [4.0 release post](https://effect.website/blog/releases/effect/40)).
- **Stability tags**: `Effect`, `Stream`, `Layer` are mostly `@stability stable`. `http`, `http-api`, `rpc`, `reactivity`, `sql`, `persistence` are `unstable`: new features in patches, breaking changes in minors ([migration guide][migration]).
- **Startup cost**: `Effect.fn` built an `Error` per definition at load, which cost most of a Worker's startup budget ([#8038](https://github.com/Effect-TS/effect/issues/8038)). Effect now skips capture when `Error.stackTraceLimit` is 0 ([#8114](https://github.com/Effect-TS/effect/pull/8114), [#8937](https://github.com/Effect-TS/effect/pull/8937)). Effect reads that as a plain property ([`stackTraceLimit.ts`](https://github.com/Effect-TS/effect/blob/effect%404.1.4/packages/effect/src/internal/stackTraceLimit.ts)), so setting `Error.stackTraceLimit = 0` should also turn capture off on Hermes. **Unverified on a device.**
- **TypeScript**: v4 needs TS 5.9+ and recommends TS 7 with `@effect/tsgo` ([`README.md`][e-readme]). This repo already runs TS 7.

## Real-world reports (secondary)

- **Working**: one commenter runs the "Effect v4 family" on react-native-macos 0.87 with Hermes V1, using custom Babel steps ([#6252][i6252]).
- **Hermes-specific bugs found by RN users**: `DateTime` on Android ([#8689][i8689]), `HttpClient` memory without `FinalizationRegistry` ([#8750][i8750]). Both fixed within days.
- **Gave up**: one Discord user went back to v3 after Metro errors ([effect-smol#1861](https://github.com/Effect-TS/effect-smol/issues/1861)); one 2024 user weighed Micro + zod over Effect for size ([#4093](https://github.com/Effect-TS/effect/issues/4093)).
- **No blog post by Effect's authors on React Native or Expo** turned up; the 4.0 and "first week" posts don't mention mobile.

## AI-agent fit

### What Effect provides

- **`AGENTS.md` and `CLAUDE.md` in the npm package**, identical to the repo's [`LLMS.md`][e-llms], plus 82 `ai-docs` example files. It tells agents to "use this documentation and the Effect source code available in your environment" and to avoid outdated copies.
- **Vendor the source**: Effect's own guide recommends `git subtree` of the Effect repo so agents read real source ([blog, May 2026](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive/)).
- **Docs MCP**: `effect-mcp` by core maintainer Tim Smart searches Effect docs (npm, last published 2025-10-06, before v4 shipped). Whether it covers v4 docs is **unverified**.
- **`llms.txt`**: `effect.website/llms.txt`, `/llms-full.txt` and `/llms-small.txt` all return 404 on 2026-11-19.
- **Language service**: `@effect/tsgo` adds Effect diagnostics for TypeScript 7, which can catch misuse an agent's code would otherwise ship.
- **Migration by agent**: the 4.0 post says "Hand it to your coding agent, and it should do most of the work on its own" ([4.0 release post](https://effect.website/blog/releases/effect/40)). This is a vendor claim.

### Evidence quality

| Claim                                                | Evidence                                                                                               | Quality                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Agents can write Effect 4 well with the shipped docs | Effect's own posts and `LLMS.md`                                                                       | Vendor claim, no measurement |
| Agents file Effect bugs and use its APIs             | [#9988](https://github.com/Effect-TS/effect/issues/9988) carries an "AI disclosure" (written by Codex) | Anecdote                     |
| Models default to v3 APIs                            | v4 shipped after most training cutoffs; v4 renames core APIs ([migration guide][migration])            | Inference, not measured      |
| Agents do worse on Effect than on zod + TanStack     | No study found                                                                                         | **Unverified**               |

### What this means here

- **Type errors catch renames**, but not wrong patterns (forgetting `yield*`, running Effects twice, leaking fibers). `@effect/tsgo` catches some of these.
- **Barrel imports are the default style** in Effect's agent docs, which is the worst case for Metro. A lint rule would have to enforce subpath imports.
- **Repo rules multiply**: the failure log already holds Hermes, Jest and TanStack lessons. Effect adds its own (Babel transform, Jest allow list, scheduler, stack capture) before any feature work.

## Sources

[migration]: https://github.com/Effect-TS/effect/blob/effect%404.1.4/MIGRATION.md
[stork]: https://www.stork.ai/blog/effect-40-is-powerfuland-riskier-than-it-looks
[e-pkg]: https://github.com/Effect-TS/effect/blob/effect%404.1.4/packages/effect/package.json
[e-readme]: https://github.com/Effect-TS/effect/blob/effect%404.1.4/packages/effect/README.md
[e-llms]: https://github.com/Effect-TS/effect/blob/effect%404.1.4/LLMS.md
[e-atom]: https://github.com/Effect-TS/effect/blob/effect%404.1.4/packages/effect/src/reactivity/Atom.ts#L1680
[e-sched]: https://github.com/Effect-TS/effect/blob/effect%404.1.4/packages/effect/src/Scheduler.ts
[i6252]: https://github.com/Effect-TS/effect/issues/6252
[i6578]: https://github.com/Effect-TS/effect/issues/6578
[i8689]: https://github.com/Effect-TS/effect/issues/8689
[i8750]: https://github.com/Effect-TS/effect/issues/8750
[h-gen]: https://github.com/facebook/hermes/blob/9a115f15785851f4ff2747ebb090ddd066fc8ad2/lib/VM/JSLib/GeneratorFunction.cpp
[h-sym]: https://github.com/facebook/hermes/blob/9a115f15785851f4ff2747ebb090ddd066fc8ad2/include/hermes/VM/PredefinedSymbols.def
[h-global]: https://github.com/facebook/hermes/blob/9a115f15785851f4ff2747ebb090ddd066fc8ad2/lib/VM/JSLib/GlobalObject.cpp
[h-jserror]: https://github.com/facebook/hermes/blob/9a115f15785851f4ff2747ebb090ddd066fc8ad2/lib/VM/JSError.cpp
[h-array]: https://github.com/facebook/hermes/blob/9a115f15785851f4ff2747ebb090ddd066fc8ad2/lib/VM/JSLib/Array.cpp
[h-tree]: https://github.com/facebook/hermes/tree/9a115f15785851f4ff2747ebb090ddd066fc8ad2/lib/VM/JSLib
[h-ext]: https://github.com/facebook/hermes/tree/9a115f15785851f4ff2747ebb090ddd066fc8ad2/API/hermes/extensions
[rn-plugin]: https://github.com/facebook/react-native/blob/v0.88.1/packages/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/ReactPlugin.kt
[rn-babel]: https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native-babel-preset/src/configs/main.js
[rn-timers]: https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native/Libraries/Core/setUpTimers.js
[rn-abort]: https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native/src/private/webapis/dom/abort-api/AbortSignal.js

- Size measurements: esbuild 0.28.2 bundles of `effect@4.1.4`, `effect@3.22.4` and `zod@4.6.7`, run 2026-11-19 outside the repo.
- Hermes feature checks: source at tag `hermes-v260318099.0.5` (commit `9a115f1`), the version React Native 0.88.1 pins.
- `babel-preset-expo` 58.0.24 and `@react-native/babel-preset` 0.88.1: the installed copies in `node_modules`.
