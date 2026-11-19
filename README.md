# Journal

A personal Growth journal: Check-ins, Habits, Goals, Connections and notes. One Expo codebase builds the Android app and the website. iOS is out of scope.

- **Product**: `PRODUCT.md`
- **Design system**: `DESIGN.md`
- **Domain terms**: `GLOSSARY.md`

## Get started

1. Run the setup script from the repo root (macOS or Linux). It takes no input: it installs Node and Bun with [mise](https://mise.jdx.dev), runs `bun install`, checks the env, runs lint and typecheck (tests run in CI), then installs Android Studio, JDK 21, ccache and the Android SDK. Re-run it any time; it only does the work still missing. Add `SETUP_ANDROID=0` to skip the Android toolchain.

   ```bash
   scripts/setup.sh
   ```

2. Start the app: `bun run web` for the website, or a target from [Run the app](#run-the-app).

Steps only the owner can do (Cloudflare Access, tokens, secrets, Google Calendar and the phone gate) live in `scripts/owner-gate.sh`.

## Layout

| Path                      | What it holds                                                |
| ------------------------- | ------------------------------------------------------------ |
| `src/app`                 | Expo Router routes                                           |
| `src/ui`                  | Shared components (Uniwind + Tailwind 4), imported as `@/ui` |
| `src/core`                | Shared logic, no React Native, imported as `@/core`          |
| `worker`                  | Cloudflare Worker: the API and the web host                  |
| `modules/journal-android` | Android-only native module and widgets                       |

## Run the app

| Target           | Script                      | Does                                                                                                  |
| ---------------- | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Web              | `bun run web`               | Start Metro and open the website in the browser                                                       |
| Start emulator   | `bun run emulator`          | Start the `android-36-with-play-store` emulator in the background (`scripts/setup.sh` creates it)     |
| Android emulator | `bun run android:emulator`  | Build and install the dev build on the running emulator or a plugged-in phone, then start Metro       |
| Android phone    | `bun run android:phone`     | Pick a connected phone, build and install the dev build                                               |
| Android APK      | `bun run android:apk`       | Build a release APK for sideloading (needs JDK 21 and ccache); `--no-build-cache` forces a full build |
| Install the APK  | `bun run android:phone:apk` | Install the built APK on the plugged-in phone (USB debugging on)                                      |

- **Dev builds** compile on your Mac, use no EAS quota and reload live on edits.
- **Native changes** need `bun run android:emulator` again; `bun run start` only opens the installed dev build.
- **Phones** need Metro reachable: plug in over USB, or stay on the Mac's Wi-Fi.
- **EAS builds** run in the cloud on a free tier of 15 a month, so only the owner starts them. Details: `docs/eas.md`.

## Other scripts

| Script                   | Does                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `bun run e2e`            | Run the Maestro smoke flows on the emulator (needs port 8081 free) |
| `bun run screenshot:web` | Screenshot the web app with seeded local data                      |
| `bun run deploy`         | Ship `origin/main` to production from this Mac when CI can't run   |

## Checks

| Script                  | Does                                                                     | When                   |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------- |
| `bun run check`         | Lint, typecheck, test and fallow in CI's order; prints only failed steps | Before calling it done |
| `bun run test`          | Run every Jest suite with the 100% coverage gate                         | While writing code     |
| `bun run coverage:gaps` | List each coverage gap after `bun run test`                              | When coverage fails    |
| `bun run format`        | Format everything with oxfmt                                             | Before committing      |

The pre-push hook runs Oxlint and Stylelint on the pushed files.

## Deploy

CI (`.github/workflows/ci.yml`) runs on every push to `main`:

- **Web**: deploys to the `journal` Worker at https://journal.fullchee.workers.dev after checks pass.
- **Android**: publishes an over-the-air update with `eas update`. A change to native code needs a new APK; CI opens an issue when that happens.

## For agents

Read `AGENTS.md` first, then the `AGENTS.md` in the folder you work in.

## Setup shared with rex-mobile

rex-mobile (checked out at `$REX_MOBILE_DIR`) is the owner's work Expo app. Both repos already share bun 1.4, Node 26, TS 7 with the TS 6 alias, Oxlint with vendored anti-slop rules, Stylelint, fallow, Uniwind, Maestro, the `expo` Claude plugin, Impeccable and `scripts/setup.sh`. Compared on 2026-11-12.

### Worth copying from rex-mobile

Copied on 2026-11-12: oxfmt with the format-on-edit hook, the secrets scan, Worktrunk worktree setup and pruning, the 100% coverage gate, Renovate, the repo release-age, the quiet full check (`bun run check`) and shfmt in `lint:sh`.

| Setup         | In rex-mobile                                         | Why here                              |
| ------------- | ----------------------------------------------------- | ------------------------------------- |
| **Storybook** | On-device and web Storybook, published as an artifact | Only if `@/ui` grows enough to browse |

### Worth copying to rex-mobile

| Setup                    | In this repo                                                                                           | Why there                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **Auto-install on pull** | `lefthook.yml` `post-merge`, `post-rewrite`, `post-checkout` run `bun install` when `bun.lock` changes | Stale `node_modules` after another session adds a dependency        |
| **Fast hooks**           | Pre-commit runs only typecheck; pre-push lints only pushed files plus `fallow:changed`                 | rex's pre-commit runs ESLint and the full typecheck on every commit |
| **Fallow with coverage** | `scripts/merge-coverage.ts` feeds Jest coverage into fallow's CRAP scores                              | rex runs fallow without coverage, so health scores guess            |
| **Stricter linting**     | Oxlint only, type-aware, with `sonarjs`, `unicorn`, `regexp`, `slop`, `@eslint-react`, `jest` plugins  | rex's ESLint is Expo's base config only                             |
| **Fingerprint warning**  | CI compares `@expo/fingerprint` and opens "Rebuild the APK"                                            | rex's EAS update can ship JS that needs a new native build          |
| **mise**                 | `mise.local.toml` pins Node and bun per checkout                                                       | rex relies on `.nvmrc` and a global bun                             |
| **Owner gate script**    | `scripts/owner-gate.sh` collects every human-only step in one wizard                                   | rex has separate wizards per task                                   |
| **Out-of-scope log**     | `.out-of-scope/` records rejected ideas with reasons                                                   | Stops re-proposing dropped features                                 |
| **Web screenshots**      | `screenshot:web` script and `/screenshot-web` skill                                                    | Quick visual checks without a simulator                             |
